-- Fügt die Freigabe-Spalte zu bereits bestehenden "users"-Tabellen hinzu
-- (neue/frische Datenbanken bekommen die Spalte schon über schema.sql).
-- Anwenden mit: npx wrangler d1 execute cuttingforce-db --local --file=./migrations/0001_add_approved.sql
--          bzw. npx wrangler d1 execute cuttingforce-db --remote --file=./migrations/0001_add_approved.sql

ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;
