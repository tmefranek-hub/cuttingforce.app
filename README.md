# Meine Homepage

Persönliche Homepage von Tobias Franek. Reines HTML/CSS (kein Framework,
kein Build-Schritt), gehostet über **Cloudflare Workers** mit statischen
Dateien (`assets`-Verzeichnis `./public`).

## Lokal testen

```bash
npx wrangler dev
```

Öffnet einen lokalen Server (Adresse wird im Terminal angezeigt, z. B.
`http://localhost:8787`).

## Veröffentlichen

```bash
npx wrangler deploy
```

Lädt die Seite zu Cloudflare Workers hoch.

## Struktur

```
public/
  index.html     Startseite
  style.css      Design
  bilder/        Bilder (noch leer)
  robots.txt     Suchmaschinen-Anweisungen
  sitemap.xml    Sitemap (Platzhalter-Domain https://example.com)
wrangler.jsonc   Cloudflare-Worker-Konfiguration
```

## Geplant

- Eigener Inhalt statt Platzhaltertexte
- Python als Cloudflare Python Worker (z. B. für zukünftige dynamische Funktionen)
