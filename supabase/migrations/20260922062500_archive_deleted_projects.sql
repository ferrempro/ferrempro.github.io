-- Histórico inmutable de obras eliminadas desde cualquier dispositivo.
create table if not exists public.rempro_project_archive (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  name text not null,
  client text null,
  folio text null,
  status text null,
  contract numeric not null default 0,
  collected numeric not null default 0,
  cost numeric not null default 0,
  progress numeric not null default 0,
  source_updated_at timestamptz null,
  archived_at timestamptz not null default now(),
  archived_by text null,
  archive_reason text not null default 'soft_delete'
    check (archive_reason in ('soft_delete','synced_tombstone','hard_delete','backfill')),
  project_snapshot jsonb not null,
  documents_snapshot jsonb not null default '[]'::jsonb,
  updates_snapshot jsonb not null default '[]'::jsonb,
  unique (project_id, source_updated_at, archive_reason)
);

create index if not exists rempro_project_archive_archived_at_idx
  on public.rempro_project_archive(archived_at desc);
create index if not exists rempro_project_archive_name_idx
  on public.rempro_project_archive(lower(name));

alter table public.rempro_project_archive enable row level security;
revoke all on public.rempro_project_archive from anon, authenticated;
grant select on public.rempro_project_archive to authenticated;

drop policy if exists rempro_project_archive_select on public.rempro_project_archive;
create policy rempro_project_archive_select
  on public.rempro_project_archive for select to authenticated
  using ((select public.rempro_is_member()));

create or replace function public.rempro_archive_project_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  r public.rempro_projects%rowtype;
  reason text;
begin
  if tg_op = 'DELETE' then
    r := old;
    reason := 'hard_delete';
  elsif tg_op = 'INSERT' then
    if new.deleted is distinct from true then return new; end if;
    r := new;
    reason := 'synced_tombstone';
  else
    if not (old.deleted is distinct from true and new.deleted is true) then return new; end if;
    r := new;
    reason := 'soft_delete';
  end if;

  insert into public.rempro_project_archive (
    project_id, name, client, folio, status,
    contract, collected, cost, progress,
    source_updated_at, archived_at, archived_by, archive_reason,
    project_snapshot, documents_snapshot, updates_snapshot
  )
  values (
    r.id, r.name, r.client, r.folio, r.status,
    coalesce(r.contract,0), coalesce(r.collected,0), coalesce(r.cost,0), coalesce(r.progress,0),
    r.updated_at, now(), coalesce(auth.jwt() ->> 'email', r.updated_by), reason,
    to_jsonb(r),
    coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at, d.id)
              from public.rempro_documents d where d.project_id=r.id),'[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at, u.id)
              from public.rempro_project_updates u where u.project_id=r.id),'[]'::jsonb)
  )
  on conflict (project_id, source_updated_at, archive_reason) do nothing;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.rempro_archive_project_snapshot() from public, anon, authenticated;

drop trigger if exists rempro_projects_archive_on_insert on public.rempro_projects;
create trigger rempro_projects_archive_on_insert
after insert on public.rempro_projects
for each row when (new.deleted is true)
execute function public.rempro_archive_project_snapshot();

drop trigger if exists rempro_projects_archive_on_soft_delete on public.rempro_projects;
create trigger rempro_projects_archive_on_soft_delete
after update of deleted on public.rempro_projects
for each row when (old.deleted is distinct from true and new.deleted is true)
execute function public.rempro_archive_project_snapshot();

drop trigger if exists rempro_projects_archive_on_hard_delete on public.rempro_projects;
create trigger rempro_projects_archive_on_hard_delete
before delete on public.rempro_projects
for each row execute function public.rempro_archive_project_snapshot();

insert into public.rempro_project_archive (
  project_id, name, client, folio, status,
  contract, collected, cost, progress,
  source_updated_at, archived_at, archived_by, archive_reason,
  project_snapshot, documents_snapshot, updates_snapshot
)
select
  p.id, p.name, p.client, p.folio, p.status,
  coalesce(p.contract,0), coalesce(p.collected,0), coalesce(p.cost,0), coalesce(p.progress,0),
  p.updated_at, now(), p.updated_by, 'backfill', to_jsonb(p),
  coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at,d.id)
            from public.rempro_documents d where d.project_id=p.id),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at,u.id)
            from public.rempro_project_updates u where u.project_id=p.id),'[]'::jsonb)
from public.rempro_projects p
where p.deleted is true
on conflict (project_id, source_updated_at, archive_reason) do nothing;
