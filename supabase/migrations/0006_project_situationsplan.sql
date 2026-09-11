-- Optional per-project situationsplan: an uploaded nybyggnadskarta (image)
-- with a manual pixel-per-meter calibration and a manually placed building
-- position. Kept on the projects table like detaljplan_text - this is
-- case-specific context, not shared reference material.
--
-- Scale calibration is stored as pixels-per-meter (derived from a 2-point
-- click + known distance), not a print scale ratio like "1:400" - a print
-- scale alone doesn't determine pixel size on an arbitrary digital image
-- without knowing its scan/photo DPI, which we have no way to know.
alter table public.projects
  add column if not exists situationsplan_storage_path text,
  add column if not exists situationsplan_image_width numeric,
  add column if not exists situationsplan_image_height numeric,
  add column if not exists situationsplan_pixels_per_meter numeric,
  add column if not exists situationsplan_building_x numeric,
  add column if not exists situationsplan_building_y numeric;
