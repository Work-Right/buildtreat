-- the Atmospheric Builders' Retreat — retreat site content

-- `/` becomes the retreat home: organizer-written sections, each public,
-- invited-only, or hidden (a draft). Photos are stored in the private R2
-- bucket SITE_MEDIA under their `id`; rows here carry what the page needs
-- to lay them out. An empty `alt` means the photo isn't shown yet.
CREATE TABLE site_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  visibility  TEXT NOT NULL DEFAULT 'hidden'
              CHECK (visibility IN ('public', 'invited', 'hidden')),
  position    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);

CREATE TABLE site_photos (
  id            TEXT PRIMARY KEY,
  section_id    INTEGER NOT NULL REFERENCES site_sections(id) ON DELETE CASCADE,
  alt           TEXT NOT NULL DEFAULT '',
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  position      INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX site_photos_section ON site_photos(section_id, position);

-- Seed: public facts the site already states (PRODUCT.md / content.ts),
-- plus empty hidden drafts for the invited sections Bryan will write.
INSERT INTO site_sections (title, body, visibility, position, updated_at, updated_by) VALUES
  ('The retreat',
   'Three nights and two full days with the builders of the Atmosphere — December 4–7, 2026, near Palm Springs, California.' || char(10) || char(10) ||
   'Lodging and food are covered. You cover your travel; if that''s a stretch, registration asks how we can help.',
   'public', 1, '2026-10-31T00:00:00Z', 'seed'),
  ('Who''s organizing',
   'Organized by Bryan Guffey ([@chaosgreml.in](https://aturi.to/profile/did:plc:h3wpawnrlptr4534chevddo6)) in partnership with Bluesky PBC.',
   'public', 2, '2026-10-31T00:00:00Z', 'seed'),
  ('Where we''re staying', '', 'hidden', 3, '2026-10-31T00:00:00Z', 'seed'),
  ('Schedule', '', 'hidden', 4, '2026-10-31T00:00:00Z', 'seed'),
  ('Getting there', '', 'hidden', 5, '2026-10-31T00:00:00Z', 'seed'),
  ('What to bring', '', 'hidden', 6, '2026-10-31T00:00:00Z', 'seed');
