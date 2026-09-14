-- AI-interpreted facade material/color (from analyzeFacadePhoto's vision
-- call) used to be recomputed from scratch on every "Generera ritningar"
-- click and passed straight through into the teknisk beskrivning as
-- already-final text - the user had no way to see it was a guess, correct
-- it, or avoid paying for the same vision call repeatedly. Persisting it
-- here makes it an explicit, editable, confirmable fact per photo instead.
alter table public.project_images
  add column if not exists material text,
  add column if not exists color text,
  add column if not exists attributes_confirmed boolean not null default false;
