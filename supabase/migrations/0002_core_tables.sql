-- Core tables for Eivor: projects a user has started, the structured form
-- answers for each project, and the facade photos tagged by direction.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  initial_description text,
  assessment_verdict text check (
    assessment_verdict in ('kräver_bygglov', 'kräver_troligen_inte_bygglov', 'osäkert')
  ),
  assessment_summary text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);

-- Exact fields are still being defined, so answers are stored as JSONB
-- instead of fixed columns to avoid a migration every time the form changes.
create table if not exists public.project_answers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  direction text not null check (direction in ('norr', 'söder', 'öster', 'väster')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (project_id, direction)
);

create index if not exists project_images_project_id_idx on public.project_images(project_id);

-- Keep updated_at current on writes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_project_answers_updated_at on public.project_answers;
create trigger set_project_answers_updated_at
  before update on public.project_answers
  for each row execute function public.set_updated_at();

-- Row Level Security: every table is scoped to the owning user.
alter table public.projects enable row level security;
alter table public.project_answers enable row level security;
alter table public.project_images enable row level security;

drop policy if exists "Users manage their own projects" on public.projects;
create policy "Users manage their own projects"
  on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage answers for their own projects" on public.project_answers;
create policy "Users manage answers for their own projects"
  on public.project_answers
  for all
  using (exists (
    select 1 from public.projects p
    where p.id = project_answers.project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_answers.project_id and p.user_id = auth.uid()
  ));

drop policy if exists "Users manage images for their own projects" on public.project_images;
create policy "Users manage images for their own projects"
  on public.project_images
  for all
  using (exists (
    select 1 from public.projects p
    where p.id = project_images.project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_images.project_id and p.user_id = auth.uid()
  ));

-- Storage bucket for facade photos. Private; access is scoped by the
-- uploader's user id, which is the first path segment of each object
-- (<user_id>/<project_id>/<direction>.<ext>).
insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', false)
on conflict (id) do nothing;

drop policy if exists "Users manage their own project images in storage" on storage.objects;
create policy "Users manage their own project images in storage"
  on storage.objects
  for all
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
