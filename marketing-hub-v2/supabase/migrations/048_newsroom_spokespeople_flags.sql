-- Ensure public newsroom spokespeople are marked in both contact stores.
-- Safe to re-run; only patches known Peters & May press contacts.

with patch(id, name, email, role, organisation, photo_url, is_spokesperson) as (
  values
    ('ctc_9fcadf83', 'Simon Judson', 'simon@petersandmay.com', 'Chief Executive Officer', 'Peters & May', '/newsroom/spokespeople/simon-judson.jpg', true),
    ('sb_b99d324f-1bd4-4c91-be42-ef54ecc5edc4', 'Craig Stanbury', 'craig@petersandmay.com', 'Global Operations Director - Racing', 'Peters & May', '/newsroom/spokespeople/craig-stanbury.jpg', true),
    ('sb_ea8e086f-5867-4f2e-bc5b-0f0914d2361f', 'Richard Howatt', 'richard@petersandmay.com', 'UK Marine Senior Sales Manager', 'Peters & May', '/newsroom/spokespeople/richard-howatt.jpg', true),
    ('ctc_42fa3f09', 'Paul Everley', 'peverley@petersandmay.com', 'Global Head of Forwarding', 'Peters & May', '/newsroom/spokespeople/paul-everley.jpg', true),
    ('sb_4243ecba-c96a-4c2f-a263-bbea7fb939e4', 'Robert Blades', 'robert@petersandmay.com', 'Global Commercial Sales Manager', 'Peters & May', '/newsroom/spokespeople/robert-blades.jpg', true),
    ('ctc_1a80207b', 'Sophie Edgerley', 'marketing@petersandmay.com', 'Marketing Manager', 'Peters & May', '/newsroom/spokespeople/sophie-edgerley.jpg', true),
    ('sb_bd2f1e29-0751-45a1-b3b1-f359b2c215f9', 'Sophie Edgerley', 'sophie@petersandmay.com', 'Marketing Manager', 'Peters & May', '', false)
)
update hub_contact_records h
set
  email = lower(p.email),
  payload = h.payload || jsonb_build_object(
    'name', p.name,
    'email', lower(p.email),
    'role', p.role,
    'organisation', p.organisation,
    'photo_url', nullif(p.photo_url, ''),
    'is_spokesperson', p.is_spokesperson,
    'is_press', false,
    'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  updated_at = now()
from patch p
where h.id = p.id;
