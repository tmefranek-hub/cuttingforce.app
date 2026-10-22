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
// Zentrale Einstellungs-App (Platz 8 der Startseite): ebenfalls dieselbe App-Datei, Modus per Adresse
const SETTINGS_PATH = '/einstellungen';

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

    // 1b') Einstellungen: für alle erreichbar (Gäste sehen nur die Grundeinstellungen, Admin-Bereiche prüft die API)
    if (path === SETTINGS_PATH) {
      return Response.redirect(new URL(SETTINGS_PATH + '/', url.origin), 301);
    }
    if (path.startsWith(SETTINGS_PATH + '/')) {
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
    if (path === '/api/stammdaten' && request.method === 'GET') {
      return handleGetStammdaten(request, env);
    }
    if (path === '/api/stammdaten' && request.method === 'PUT') {
      return handlePutStammdaten(request, env);
    }
    if (path === '/api/admin/users' && request.method === 'GET') {
      return handleListUsers(request, env);
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
    if (path === '/api/admin/approve-link') {
      return handleApproveLink(request, env, url);
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
  { path: '/gewinde', name: 'Gewindesimulation', text: 'Schraube im Gewinde: ISO-Regelgewinde M1 bis M10 mit Toleranzklassen nach ISO 965-1, Flankenspiel, Tragtiefe und Einschrauben.' },
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

/* ---------- Stammdaten (zentral, Lesen: angemeldete Benutzer, Schreiben: nur Administrator) ---------- */

const STAMM_MAX_BYTES = 900 * 1024;

async function ensureStammTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS stammdaten (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`
  ).run();
}

async function handleGetStammdaten(request, env) {
  const session = await getSessionUser(request, env);
  if (!session) return json({ error: 'Anmeldung erforderlich' }, 401);
  await ensureStammTable(env);
  const row = await env.DB.prepare(`SELECT data, updated_at FROM stammdaten WHERE id = 1`).first();
  if (!row) return json({ data: null });
  let data = null;
  try { data = JSON.parse(row.data); } catch (e) { data = null; }
  return json({ data, updated_at: row.updated_at });
}

async function handlePutStammdaten(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Nur Administratoren dürfen Stammdaten ändern' }, 403);
  const text = await request.text();
  if (text.length > STAMM_MAX_BYTES) return json({ error: 'Stammdaten sind zu groß' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'Ungültige Anfrage' }, 400); }
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const data = { wsp: arr(body.wsp), tr: arr(body.tr), mat: arr(body.mat), matMode: body.matMode === 'replace' ? 'replace' : 'add' };
  await ensureStammTable(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO stammdaten (id, data, updated_at, updated_by) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).bind(JSON.stringify(data), now, admin.email).run();
  return json({ ok: true, updated_at: now });
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

  if (!autoApproved) {
    try {
      await notifyAdminNewUser(env, new URL(request.url).origin, result.meta.last_row_id, email);
    } catch (e) {
      /* Mailversand ist optional – Registrierung klappt auch ohne */
    }
    return pendingResponse();
  }

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

/** Liste aller Benutzerkonten für die Stammdaten (nur Administrator): Status, Registrierung, letzte Anmeldung, aktive Sitzungen. */
async function handleListUsers(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Nicht erlaubt' }, 403);
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.created_at, u.last_login_at, u.approved, u.locked_until,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions
     FROM users u ORDER BY u.created_at ASC`
  )
    .bind(now)
    .all();
  const users = (rows.results || []).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    role: isAdminEmail(u.email, env) ? 'admin' : 'user',
    approved: isApproved(u, env),
    locked: !!(u.locked_until && u.locked_until > now),
    sessions: u.sessions || 0,
  }));
  return json({ users });
}

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

/* ---------- Freigabe per E-Mail-Link ----------
   Bei jeder neuen Registrierung bekommt der Administrator eine E-Mail mit einem Freigabe-Link.
   Der Link ist mit HMAC-SHA256 signiert; Schlüssel ist der (geheime, nie ausgelieferte) Passwort-Hash des
   neuen Kontos, signiert werden ID, E-Mail und Anlagezeitpunkt → keine zusätzliche Datenbankspalte nötig.
   Der Link öffnet eine Bestätigungsseite (GET); erst der Klick auf „Freigeben“/„Ablehnen“ (POST) ändert etwas,
   damit Link-Vorschauen von Mailprogrammen nichts auslösen. Gültig 14 Tage.
   Versand: RESEND_API_KEY (Secret, resend.com) oder Cloudflare-Email-Binding MAILER (send_email). */
const APPROVE_LINK_DAYS = 14;

async function hmacHex(keyText, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const approveToken = (u) => hmacHex(u.password_hash, `approve|${u.id}|${u.email}|${u.created_at}`);

function escHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendMail(env, { to, subject, text, html }) {
  const from = env.MAIL_FROM || 'cuttingforce.app <onboarding@resend.dev>';
  if (env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    return r.ok;
  }
  if (env.MAILER && typeof env.MAILER.send === 'function') {
    const { EmailMessage } = await import('cloudflare:email');
    const sender = env.MAIL_FROM_ADDRESS || 'noreply@cuttingforce.app';
    const boundary = 'b' + randomHex(8);
    const raw = [
      `From: cuttingforce.app <${sender}>`, `To: ${to}`, `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      'MIME-Version: 1.0', `Message-ID: <${randomHex(12)}@cuttingforce.app>`, `Date: ${new Date().toUTCString()}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text, '',
      `--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', html, '', `--${boundary}--`, '',
    ].join('\r\n');
    await env.MAILER.send(new EmailMessage(sender, to, raw));
    return true;
  }
  return false;
}

async function notifyAdminNewUser(env, origin, userId, email) {
  const admin = (env.ADMIN_EMAIL || '').trim();
  if (!admin) return false;
  const u = await env.DB.prepare(`SELECT id, email, password_hash, created_at FROM users WHERE id = ?`).bind(userId).first();
  if (!u) return false;
  const link = `${origin}/api/admin/approve-link?u=${u.id}&t=${await approveToken(u)}`;
  const subject = `Neue Registrierung: ${email}`;
  const text = `Neue Registrierung auf cuttingforce.app\n\nE-Mail: ${email}\nAngelegt: ${u.created_at}\n\nFreigeben oder ablehnen:\n${link}\n\nDer Link ist ${APPROVE_LINK_DAYS} Tage gültig.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5"><p>Neue Registrierung auf <b>cuttingforce.app</b></p><p>E-Mail: <b>${escHtml(email)}</b><br>Angelegt: ${escHtml(u.created_at)}</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Freigeben oder ablehnen</a></p><p style="color:#666;font-size:13px">Der Link ist ${APPROVE_LINK_DAYS} Tage gültig. Erst auf der folgenden Seite wird bestätigt.</p></div>`;
  return sendMail(env, { to: admin, subject, text, html });
}

function approvePage(title, body) {
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(title)} – cuttingforce.app</title><link rel="stylesheet" href="/style.css">
<style>.box{max-width:460px;margin:40px auto;padding:22px;border:1px solid var(--line,#ddd);border-radius:10px;font-family:var(--f-body,Arial,sans-serif)}.box h1{font:600 22px var(--f-disp,Arial);margin:0 0 10px}.box form{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.box button{padding:11px 18px;border-radius:6px;border:1px solid var(--fg,#111);font:600 15px var(--f-disp,Arial);cursor:pointer;background:var(--surface,#fff);color:var(--fg,#111)}.box button.pri{background:var(--accent,#111);color:var(--accent-ink,#fff)}</style></head>
<body><main class="box"><h1>${escHtml(title)}</h1>${body}<p style="margin-top:18px"><a href="/">← Zur Startseite</a></p></main></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
  );
}

async function handleApproveLink(request, env, url) {
  const id = Number(url.searchParams.get('u'));
  const t = String(url.searchParams.get('t') || '');
  if (!Number.isInteger(id) || !/^[0-9a-f]{64}$/.test(t)) return approvePage('Ungültiger Link', '<p>Der Freigabe-Link ist unvollständig.</p>');
  const u = await env.DB.prepare(`SELECT id, email, password_hash, created_at, approved FROM users WHERE id = ?`).bind(id).first();
  if (!u) return approvePage('Nicht gefunden', '<p>Dieses Konto gibt es nicht mehr (bereits abgelehnt oder gelöscht).</p>');
  if (!timingSafeEqualHex(await approveToken(u), t)) return approvePage('Ungültiger Link', '<p>Der Freigabe-Link ist nicht gültig.</p>');
  if (u.approved === 1) return approvePage('Bereits freigegeben', `<p><b>${escHtml(u.email)}</b> ist bereits freigegeben.</p>`);
  if (Date.now() - new Date(u.created_at).getTime() > APPROVE_LINK_DAYS * 864e5)
    return approvePage('Link abgelaufen', `<p>Der Link ist älter als ${APPROVE_LINK_DAYS} Tage. Bitte im Versuchsprotokoll unter Stammdaten → Benutzer freigeben.</p>`);
  if (request.method === 'POST') {
    let act = '';
    try { act = String((await request.formData()).get('act') || ''); } catch (e) {}
    if (act === 'approve') {
      await env.DB.prepare(`UPDATE users SET approved = 1 WHERE id = ? AND approved = 0`).bind(id).run();
      return approvePage('Freigegeben', `<p><b>${escHtml(u.email)}</b> ist freigegeben und kann sich jetzt anmelden.</p>`);
    }
    if (act === 'reject') {
      await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM users WHERE id = ? AND approved = 0`).bind(id).run();
      return approvePage('Abgelehnt', `<p>Die Registrierung von <b>${escHtml(u.email)}</b> wurde abgelehnt und gelöscht.</p>`);
    }
    return approvePage('Ungültige Anfrage', '<p>Keine Aktion gewählt.</p>');
  }
  return approvePage('Neue Registrierung', `<p>E-Mail: <b>${escHtml(u.email)}</b><br>Angelegt: ${escHtml(u.created_at)}</p>
<form method="post"><button class="pri" name="act" value="approve">Freigeben</button><button name="act" value="reject">Ablehnen</button></form>`);
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
