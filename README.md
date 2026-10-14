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
