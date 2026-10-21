-- Zentrale Stammdaten für die Einstellungs-App (wird vom Worker bei Bedarf auch selbst angelegt).
-- Anwenden mit: npx wrangler d1 execute cuttingforce-db --remote --file=./migrations/0002_stammdaten.sql

CREATE TABLE IF NOT EXISTS stammdaten (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
