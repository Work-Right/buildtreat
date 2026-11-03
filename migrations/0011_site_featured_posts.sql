-- the Atmospheric Builders' Retreat — who's coming + the posts stream

-- Who's coming: organizer-curated confirmed registrants. Off by default;
-- the public render additionally requires the registration to still be
-- confirmed, so a later decline hides the card without touching this row.
CREATE TABLE site_featured (
  did         TEXT PRIMARY KEY,
  blurb       TEXT NOT NULL DEFAULT '',
  shown       INTEGER NOT NULL DEFAULT 0 CHECK (shown IN (0, 1)),
  position    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Bluesky posts in the stream, by at:// URI. Hydrated from the public
-- appview at render time (KV-cached); a post that no longer resolves is
-- omitted silently.
CREATE TABLE site_bsky_posts (
  uri       TEXT PRIMARY KEY,
  added_at  TEXT NOT NULL,
  added_by  TEXT NOT NULL
);

-- Updates are sections with kind = 'update' and a publish date; they render
-- in the posts stream instead of the page flow. SQLite (and D1) accept a
-- CHECK on ADD COLUMN and test it against existing rows; kind is also
-- validated in code by Task 9b's sections.ts.
ALTER TABLE site_sections ADD COLUMN kind TEXT NOT NULL DEFAULT 'section'
  CHECK (kind IN ('section', 'update'));
ALTER TABLE site_sections ADD COLUMN published_at TEXT;
