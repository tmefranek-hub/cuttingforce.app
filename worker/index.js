/*
 * Worker für cuttingforce.app
 * - Statische Dateien (public/) laufen weiterhin über die "assets"-Konfiguration in wrangler.jsonc
 *   und werden NICHT von diesem Script ausgeliefert – Cloudflare prüft bei jeder Anfrage zuerst,
 *   ob eine passende Datei existiert, und ruft diesen Worker nur auf, wenn das nicht der Fall ist
 *   (also für /api/* und für Adressen, die es als Datei nicht mehr gibt, z. B. die alte App-Adresse).
 * - Hier werden nur zwei Dinge behandelt: die Anmeldungs-API unter /api/* und der 301-Redirect
 *   der alten Versuchsprotokoll-Adresse auf die neue /schnittkraftrechner/-Adresse.
 */

const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const OLD_PATH_PREFIX = '/versuchsprotokoll-zerspanung';
const NEW_PATH = '/schnittkraftrechner/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    // Lokal (wrangler dev) läuft alles über http://, dort darf das Cookie kein "Secure" haben,
    // sonst verwirft der Browser es stillschweigend. In Produktion (https://cuttingforce.app) ist es immer gesetzt.
    const secure = url.protocol === 'https:';

    // 1) Dauerhafter Redirect der alten Adresse auf die neue
    if (path === OLD_PATH_PREFIX || path === OLD_PATH_PREFIX + '/' || path.startsWith(OLD_PATH_PREFIX + '/')) {
      return Response.redirect(new URL(NEW_PATH, url.origin), 301);
    }

    // 2) API-Routen
    if (path === '/api/me' && request.method === 'GET') {
      return handleMe(request, env);
    }
    if (path === '/api/register' && request.method === 'POST') {
      return handleRegister(request, env, secure);
    }
    if (path === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env, secure);
    }
    if (path === '/api/logout' && request.method === 'POST') {
      return handleLogout(request, env, secure);
    }

    // Alles andere: hier landen wir nur, wenn weder eine statische Datei noch eine der Routen oben
    // gepasst hat (z. B. Tippfehler in der Adresse) – einfache 404-Antwort.
    return new Response('Not found', { status: 404 });
  },
};

/* ---------- Hilfsfunktionen ---------- */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function randomHex(byteLength) {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** PBKDF2-Hash eines Passworts, liefert Hex-String (256 Bit). */
async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toHex(bits);
}

/** Zeitkonstanter Vergleich zweier gleich langer Hex-Strings. */
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function sessionCookieHeader(sessionId, maxAgeSeconds, secure) {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookieHeader(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=0`;
}

function isAdminEmail(email, env) {
  const admin = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  return !!admin && email.trim().toLowerCase() === admin;
}

/** Liest die aktuelle Session (falls vorhanden und gültig) samt zugehörigem Benutzer. */
async function getSessionUser(request, env) {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const row = await env.DB.prepare(
    `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  )
    .bind(sid)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    // abgelaufene Session gleich aufräumen
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run();
    return null;
  }
  return { email: row.email, userId: row.user_id };
}

/* ---------- Routen ---------- */

async function handleMe(request, env) {
  const session = await getSessionUser(request, env);
  if (!session) return json({ role: 'guest' });
  const role = isAdminEmail(session.email, env) ? 'admin' : 'user';
  return json({ role, email: session.email });
}

async function handleRegister(request, env, secure) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!isValidEmail(email)) return json({ error: 'Bitte eine gültige E-Mail-Adresse eintragen' }, 400);
  if (password.length < 8) return json({ error: 'Das Passwort muss mindestens 8 Zeichen haben' }, 400);

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (existing) return json({ error: 'Für diese E-Mail-Adresse besteht bereits ein Konto' }, 409);

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  const created = nowIso();

  const result = await env.DB.prepare(
    `INSERT INTO users (email, password_hash, password_salt, iterations, created_at, failed_attempts)
     VALUES (?, ?, ?, ?, ?, 0)`
  )
    .bind(email, hash, salt, PBKDF2_ITERATIONS, created)
    .run();

  const userId = result.meta.last_row_id;
  return startSession(env, userId, email, secure);
}

async function handleLogin(request, env, secure) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const genericError = 'E-Mail oder Passwort falsch';

  if (!isValidEmail(email) || !password) return json({ error: genericError }, 401);

  const user = await env.DB.prepare(
    `SELECT id, email, password_hash, password_salt, iterations, failed_attempts, locked_until FROM users WHERE email = ?`
  )
    .bind(email)
    .first();
  if (!user) return json({ error: genericError }, 401);

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return json({ error: 'Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.' }, 429);
  }

  const computedHash = await hashPassword(password, user.password_salt, user.iterations);
  const ok = timingSafeEqualHex(computedHash, user.password_hash);

  if (!ok) {
    const attempts = (user.failed_attempts || 0) + 1;
    const lockUntil =
      attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await env.DB.prepare(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`)
      .bind(attempts, lockUntil, user.id)
      .run();
    return json({ error: genericError }, 401);
  }

  await env.DB.prepare(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`
  )
    .bind(nowIso(), user.id)
    .run();

  return startSession(env, user.id, user.email, secure);
}

async function handleLogout(request, env, secure) {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (sid) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader(secure) });
}

async function startSession(env, userId, email, secure) {
  const sid = randomHex(32);
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(sid, userId, created, expires)
    .run();
  const role = isAdminEmail(email, env) ? 'admin' : 'user';
  return json(
    { ok: true, role, email },
    200,
    { 'Set-Cookie': sessionCookieHeader(sid, SESSION_DAYS * 86400, secure) }
  );
}
