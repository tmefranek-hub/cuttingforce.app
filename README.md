# cuttingforce.app

Persönliche Homepage von Tobias Franek mit dem **Schnittkraftrechner**
(Zerspanungstechnik: Drehen, Fräsen, Bohren, Drehschälen, Blechkantenfräsen,
Kurbelwellenfräsen). Reines HTML/CSS/JS (kein Framework, kein Build-Schritt),
gehostet über **Cloudflare Workers**:

- statische Dateien laufen über das `assets`-Verzeichnis `./public`
- ein kleiner Worker (`worker/index.js`) übernimmt nur `/api/*` (Anmeldung/
  Registrierung) sowie den dauerhaften Redirect der alten App-Adresse
- Benutzerkonten/Sitzungen liegen in einer **Cloudflare-D1-Datenbank**

## Zugriffsstufen im Schnittkraftrechner

Gesteuert über `PROC_ACCESS` in `public/schnittkraftrechner/index.html`:

| Wert       | Bedeutung                                   |
|------------|----------------------------------------------|
| `'public'` | für alle nutzbar (Gast + angemeldet)          |
| `'user'`   | nur für angemeldete Benutzer                  |
| `'wip'`    | nur für den Administrator (zum Testen), „in Arbeit“ |

Aktuell: Drehen/Fräsen/Bohren = `public`, Drehschälen/Blechkantenfräsen/
Kurbelwellenfräsen = `wip`. Einzelne Prozesse können jederzeit auf `'user'`
oder `'public'` umgestellt werden, sobald sie fertig sind.

Der Administrator ist die E-Mail-Adresse aus der Umgebungsvariable
`ADMIN_EMAIL` (niemals im Code/Repository).

## Lokal einrichten (einmalig)

```bash
npx wrangler d1 create cuttingforce-db
```

Die zurückgegebene `database_id` in `wrangler.jsonc` eintragen (Feld
`d1_databases[0].database_id`). Danach das Schema anlegen:

```bash
npx wrangler d1 execute cuttingforce-db --local --file=./schema.sql
```

Für den Administratorzugang lokal eine Datei `.dev.vars` anlegen (wird von
Git ignoriert, **nicht committen**):

```
ADMIN_EMAIL=deine@mail-adresse.at
```

## Lokal testen

```bash
npx wrangler dev
```

Öffnet einen lokalen Server (Adresse wird im Terminal angezeigt, z. B.
`http://localhost:8787`).

## Veröffentlichen

**Vorher einmalig in Cloudflare** (nicht lokal, betrifft das echte Konto):

```bash
npx wrangler d1 execute cuttingforce-db --remote --file=./schema.sql
npx wrangler secret put ADMIN_EMAIL
```

Danach reicht ein `git push` auf `main` – Cloudflare baut und veröffentlicht
über die GitHub-Verbindung automatisch. Manuell ginge auch:

```bash
npx wrangler deploy
```

## Struktur

```
public/
  index.html                     Startseite (Logo, Schnittkraftrechner-Button, Kontakt)
  style.css                      Design (Schwarz-Weiß)
  schnittkraftrechner/index.html Schnittkraftrechner-App (Single-File)
  impressum/index.html           Impressum
  datenschutz/index.html         Datenschutzerklärung
  logos/                         Logo-Dateien
  bilder/                        Bilder (noch leer)
  robots.txt                     Suchmaschinen-Anweisungen
  sitemap.xml                    Sitemap
worker/index.js                  Worker: /api/register, /api/login, /api/logout,
                                  /api/me, Redirect alte Adresse → /schnittkraftrechner/
schema.sql                       D1-Tabellen (users, sessions)
wrangler.jsonc                   Cloudflare-Worker-Konfiguration
```

## Geplant

- Eigener Inhalt statt Platzhaltertexte (Impressum/Datenschutz: Adresse, E-Mail)
- LinkedIn-Link auf der Startseite ergänzen

## Quellcode und Build

- Lesbarer Quellcode liegt in `src/` (Seiten `src/<app>/index.html`, Mitglieder-Module `src/member/*.js`).
- `public/` enthält die **minifizierte Auslieferung** – dort nicht direkt bearbeiten.
- Nach jeder Änderung in `src/`: `node scripts/build.mjs` (benötigt esbuild: `npm i -D esbuild`), dann committen.
- Mitglieder-Module (`/app/m/*`, z. B. Längsnahtfräsen mit Leistungsberechnung und Optimierern) liefert der Worker nur mit gültiger Anmeldung aus; Gäste laden sie nie.

## E-Mail bei neuer Registrierung (Freigabe per Link)

Bei jeder neuen Registrierung schickt der Worker eine E-Mail an `ADMIN_EMAIL` mit einem Link
„Freigeben oder ablehnen“ (signiert, 14 Tage gültig, Bestätigung erst auf der geöffneten Seite).
Ohne Mail-Konfiguration funktioniert die Registrierung wie bisher, es wird nur keine Mail verschickt.

Einrichtung mit Resend (einfachste Variante, keine DNS-Änderung nötig):
1. Konto auf https://resend.com mit der Admin-E-Mail-Adresse anlegen, API-Key erzeugen.
2. Cloudflare Dashboard → Workers & Pages → cuttingforce-app → Settings → Variables and Secrets →
   Secret `RESEND_API_KEY` mit dem Key anlegen (oder `npx wrangler secret put RESEND_API_KEY`).
3. Ohne eigene Absender-Domain verschickt Resend über `onboarding@resend.dev` – das geht nur an die
   E-Mail-Adresse des Resend-Kontos (reicht für die Admin-Benachrichtigung). Mit verifizierter Domain
   optional `MAIL_FROM` setzen, z. B. `cuttingforce.app <noreply@cuttingforce.app>`.

Alternative: Cloudflare Email Routing mit `send_email`-Binding `MAILER` (Ziel-Adresse muss verifiziert sein).
