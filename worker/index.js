/*
 * Worker für cuttingforce.app
 * - Statische Dateien (public/) laufen weiterhin über die "assets"-Konfiguration in wrangler.jsonc
 *   und werden NICHT von diesem Script ausgeliefert – Cloudflare prüft bei jeder Anfrage zuerst,
 *   ob eine passende Datei existiert, und ruft diesen Worker nur auf, wenn das nicht der Fall ist
 *   (also für /api/* und für Adressen, die es als Datei nicht mehr gibt, z. B. die alte App-Adresse).
 * - Hier werden behandelt: die Anmeldungs-API unter /api/*, der 301-Redirect der alten Adresse
 *   /versuchsprotokoll-zerspanung/ auf /versuchsprotokoll/ und die Auslieferung von /versuchsprotokoll/
 *   (dieselbe App-Datei wie /schnittkraftrechner/, Modus wird in der App anhand der Adresse gewählt).
 */

const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const OLD_PATH_PREFIX = '/versuchsprotokoll-zerspanung';
const NEW_PATH = '/versuchsprotokoll/';
// Das Versuchsprotokoll nutzt dieselbe App-Datei wie der Schnittkraftrechner (Modus per Adresse)
const PROTOKOLL_PATH = '/versuchsprotokoll';
const APP_FILE = '/schnittkraftrechner/';

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

    // 1b) Versuchsprotokoll: gleiche App-Datei ausliefern, die App schaltet anhand der Adresse in den Protokoll-Modus
    if (path === PROTOKOLL_PATH) {
      return Response.redirect(new URL(PROTOKOLL_PATH + '/', url.origin), 301);
    }
    if (path.startsWith(PROTOKOLL_PATH + '/')) {
      return env.ASSETS.fetch(new Request(new URL(APP_FILE, url.origin), request));
    }

    // 1c) Apps nur für angemeldete Benutzer (Spanbildung, Vorspannrechner)
    const gated = MEMBER_APPS.find((a) => path === a.path || path.startsWith(a.path + '/'));
    if (gated) {
      if (path === gated.path) return Response.redirect(new URL(gated.path + '/', url.origin), 301);
      const session = await getSessionUser(request, env);
      if (!session) {
        return new Response(gatePage(gated), {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, no-store');
      return out;
    }

    // 1d) Mitglieder-Module (Berechnungsmodelle nur für angemeldete Benutzer)
    if (path.startsWith(MEMBER_MODULE_PREFIX)) {
      const session = await getSessionUser(request, env);
      if (!session) {
        return new Response('/* Anmeldung erforderlich */', {
          status: 403,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, no-store');
      out.headers.set('X-Robots-Tag', 'noindex');
      return out;
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
    if (path === '/api/admin/pending-users' && request.method === 'GET') {
      return handlePendingUsers(request, env);
    }
    if (path === '/api/admin/approve-user' && request.method === 'POST') {
      return handleApproveUser(request, env);
    }
    if (path === '/api/admin/reject-user' && request.method === 'POST') {
      return handleRejectUser(request, env);
    }

    // Alles andere: hier landen wir nur, wenn weder eine statische Datei noch eine der Routen oben
    // gepasst hat (z. B. Tippfehler in der Adresse) – einfache 404-Antwort.
    return new Response('Not found', { status: 404 });
  },
};

/* ---------- Apps und Module nur für Mitglieder ---------- */

const MEMBER_MODULE_PREFIX = '/app/m/';

const MEMBER_APPS = [
  { path: '/spanbildung', name: 'Spanbildung & Spankammer', text: '2D-Simulation der Spanbildung beim Fräsen und Auslegung der Spankammer.' },
  { path: '/vorspannrechner', name: 'Vorspannrechner', text: 'Klemmschraube einer Wendeschneidplatte: Kontakt, Umdrehungen bis zur festen Montage und Biegung der Schraube.' },
];

/** Anmeldeseite, die statt der App ausgeliefert wird, solange niemand angemeldet ist. */
function gatePage(app) {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${app.name} – Anmeldung · cuttingforce.app</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/style.css">
<style>
.gate{max-width:26rem;margin:32px auto;padding-inline:16px}
.gate form{display:grid;gap:10px;margin-top:12px}
.gate label{display:grid;gap:4px;font-size:13px;color:var(--muted)}
.gate input{font:16px var(--f-body);padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg)}
.gate button{padding:11px;border:1px solid var(--fg);border-radius:6px;font:600 15px var(--f-disp);cursor:pointer;background:var(--accent);color:var(--accent-ink)}
.gate .alt{background:none;border:0;color:var(--fg);text-decoration:underline;padding:4px;font:14px var(--f-body)}
.gate .err{color:#b3261e;min-height:1.2em;margin:0;font-size:14px}
</style></head>
<body><header class="top"><div class="wrap"><a href="/" class="brand-logo" style="text-decoration:none"><span class="wordmark"><span class="wm-light">cutting</span><span class="wm-bold">force</span><span class="wm-mono">.app</span></span></a></div></header>
<main class="gate"><section class="card">
<h2>${app.name}</h2><p>${app.text}</p><p><b>Diese App steht nur angemeldeten Benutzern zur Verfügung.</b></p>
<form id="f" autocomplete="on">
<label>E-Mail<input id="em" type="email" autocomplete="username" required></label>
<label>Passwort<input id="pw" type="password" autocomplete="current-password" required minlength="8"></label>
<label id="l2" hidden>Passwort wiederholen<input id="pw2" type="password" autocomplete="new-password"></label>
<p class="err" id="err" role="alert"></p>
<button type="submit" id="go">Anmelden</button>
<button type="button" class="alt" id="sw">Noch kein Konto? Registrieren</button>
</form></section><p><a href="/">← Zur Startseite</a></p></main>
<script>
let reg=false;const $=i=>document.getElementById(i);
$('sw').onclick=()=>{reg=!reg;$('l2').hidden=!reg;$('go').textContent=reg?'Konto anlegen':'Anmelden';$('sw').textContent=reg?'Schon ein Konto? Anmelden':'Noch kein Konto? Registrieren';$('pw').autocomplete=reg?'new-password':'current-password';$('err').textContent='';};
$('f').onsubmit=async e=>{e.preventDefault();const email=$('em').value.trim(),password=$('pw').value;
 if(reg&&password!==$('pw2').value){$('err').textContent='Die Passwörter stimmen nicht überein';return;}
 try{const r=await fetch(reg?'/api/register':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const d=await r.json().catch(()=>({}));if(!r.ok){$('err').textContent=d.error||'Das hat nicht funktioniert.';return;}
  location.reload();}catch(x){$('err').textContent='Keine Verbindung zum Server';}};
</script></body></html>`;
}

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

/** Das Administrator-Konto ist immer freigegeben, unabhängig von der gespeicherten approved-Spalte. */
function isApproved(user, env) {
  return user.approved === 1 || isAdminEmail(user.email, env);
}

/** Antwort für ein Konto, das auf die Admin-Freigabe wartet (gleiche Form wie andere Formularfehler). */
function pendingResponse() {
  return json(
    { error: 'Dein Konto wurde angelegt und wartet noch auf Freigabe durch den Administrator.', pending: true },
    403
  );
}

async function requireAdmin(request, env) {
  const session = await getSessionUser(request, env);
  if (!session || !isAdminEmail(session.email, env)) return null;
  return session;
}

/** Liest die aktuelle Session (falls vorhanden und gültig) samt zugehörigem Benutzer. */
async function getSessionUser(request, env) {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const row = await env.DB.prepare(
    `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.email, u.approved
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
  if (!isApproved(row, env)) {
    // Falls die Freigabe nachträglich entzogen wurde: Sitzung ungültig machen
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
  const autoApproved = isAdminEmail(email, env) ? 1 : 0;

  const result = await env.DB.prepare(
    `INSERT INTO users (email, password_hash, password_salt, iterations, created_at, failed_attempts, approved)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(email, hash, salt, PBKDF2_ITERATIONS, created, autoApproved)
    .run();

  if (!autoApproved) return pendingResponse();

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
    `SELECT id, email, password_hash, password_salt, iterations, failed_attempts, locked_until, approved FROM users WHERE email = ?`
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

  if (!isApproved(user, env)) return pendingResponse();

  return startSession(env, user.id, user.email, secure);
}

/* ---------- Administrator: Freigabe neuer Konten ---------- */

async function handlePendingUsers(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Nicht erlaubt' }, 403);
  // Das Administrator-Konto selbst gilt immer als freigegeben und gehört nie in diese Liste,
  // auch wenn die gespeicherte approved-Spalte (z. B. nach einer Migration) noch 0 ist.
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const rows = await env.DB.prepare(
    `SELECT id, email, created_at FROM users WHERE approved = 0 AND lower(email) != ? ORDER BY created_at ASC`
  )
    .bind(adminEmail)
    .all();
  return json({ users: rows.results || [] });
}

async function handleApproveUser(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Nicht erlaubt' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  const userId = Number(body.userId);
  if (!Number.isInteger(userId)) return json({ error: 'Ungültige Benutzer-ID' }, 400);
  await env.DB.prepare(`UPDATE users SET approved = 1 WHERE id = ?`).bind(userId).run();
  return json({ ok: true });
}

async function handleRejectUser(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Nicht erlaubt' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  const userId = Number(body.userId);
  if (!Number.isInteger(userId)) return json({ error: 'Ungültige Benutzer-ID' }, 400);
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
  await env.DB.prepare(`DELETE FROM users WHERE id = ? AND approved = 0`).bind(userId).run();
  return json({ ok: true });
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
