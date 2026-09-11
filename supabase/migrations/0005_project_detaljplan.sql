-- Optional per-project detaljplan upload. Kept on the projects table
-- itself (not regelverk_chunks - this is case-specific context, not
-- shared reference material) since it's a single optional document per
-- project, not something that needs its own chunking/embedding table.
alter table public.projects
  add column if not exists detaljplan_storage_path text,
  add column if not exists detaljplan_text text;

-- Private storage bucket for the uploaded PDF, same ownership-scoping
-- pattern as project-images: <user_id>/<project_id>/detaljplan.pdf
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

drop policy if exists "Users manage their own project documents in storage" on storage.objects;
create policy "Users manage their own project documents in storage"
  on storage.objects
  for all
  using (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'project-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
