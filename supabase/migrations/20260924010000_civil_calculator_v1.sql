-- Calculador de obra civil RemPro.
-- Guarda cálculos de concretos y morteros sin publicar datos reales en el repositorio.

create table if not exists public.rempro_civil_calculations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.rempro_projects(id)
    on update restrict on delete restrict,
  calculation_type text not null
    check (calculation_type in ('concrete','mortar')),
  label text not null default '',
  input_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  source_version text not null default 'civil-v1',
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists rempro_civil_calculations_project_idx
  on public.rempro_civil_calculations(project_id)
  where deleted=false;

create index if not exists rempro_civil_calculations_updated_idx
  on public.rempro_civil_calculations(updated_at desc)
  where deleted=false;

alter table public.rempro_civil_calculations enable row level security;

revoke all on public.rempro_civil_calculations from anon, authenticated;
grant select, insert, update on public.rempro_civil_calculations to authenticated;

drop policy if exists rempro_civil_calculations_all on public.rempro_civil_calculations;
create policy rempro_civil_calculations_all
  on public.rempro_civil_calculations for all to authenticated
  using ((select public.rempro_is_member()))
  with check ((select public.rempro_is_member()));
