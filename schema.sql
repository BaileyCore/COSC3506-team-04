-- Phase 0 starter schema.
-- Run once against your PostgreSQL database before starting the backend:
--   psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS items (
    id          SERIAL PRIMARY KEY,
    title       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A couple of rows so the deployed frontend has something to show on first load.
INSERT INTO items (title)
SELECT 'First item'
WHERE NOT EXISTS (SELECT 1 FROM items);
