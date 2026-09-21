-- RemPro Control V2: cortes de obra, trazabilidad de precios y avances ChatGPT.

alter table public.rempro_rules
  add column if not exists stud_spacing numeric not null default 0.61,
  add column if not exists stud_length numeric not null default 3.05,
  add column if not exists track_length numeric not null default 3.05;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='rempro_rules_stud_spacing_positive'
      and conrelid='public.rempro_rules'::regclass
  ) then
    alter table public.rempro_rules
      add constraint rempro_rules_stud_spacing_positive check (stud_spacing > 0),
      add constraint rempro_rules_stud_length_positive check (stud_length > 0),
      add constraint rempro_rules_track_length_positive check (track_length > 0);
  end if;
end $$;

create table if not exists public.rempro_price_history (
  id uuid primary key default gen_random_uuid(),
  price_id uuid null references public.rempro_prices(id),
  item text not null,
  supplier text null,
  unit text null,
  net numeric not null default 0 check (net >= 0),
  vat numeric not null default 16 check (vat >= 0 and vat <= 100),
  date date not null default current_date,
  source_type text not null default 'manual'
    check (source_type in ('manual','photo','document')),
  evidence_path text null,
  evidence_name text null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text null
);

create index if not exists rempro_price_history_price_date_idx
  on public.rempro_price_history(price_id, date desc, updated_at desc);

alter table public.rempro_price_history enable row level security;

drop policy if exists rempro_price_history_select on public.rempro_price_history;
create policy rempro_price_history_select
  on public.rempro_price_history for select to authenticated
  using (
    exists (
      select 1 from public.rempro_members m
      where m.email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists rempro_price_history_insert on public.rempro_price_history;
create policy rempro_price_history_insert
  on public.rempro_price_history for insert to authenticated
  with check (
    exists (
      select 1 from public.rempro_members m
      where m.email = (auth.jwt() ->> 'email')
    )
  );

revoke all on public.rempro_price_history from anon;
revoke update, delete, truncate on public.rempro_price_history from authenticated;
grant select, insert on public.rempro_price_history to authenticated;

create table if not exists public.rempro_project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.rempro_projects(id),
  as_of_date date not null default current_date,
  progress numeric not null check (progress >= 0 and progress <= 100),
  notes text null,
  source text not null default 'chatgpt'
    check (source in ('chatgpt','chatgpt_audio')),
  created_at timestamptz not null default now(),
  created_by text not null default 'ChatGPT'
);

create index if not exists rempro_project_updates_project_date_idx
  on public.rempro_project_updates(project_id, as_of_date desc, created_at desc);

alter table public.rempro_project_updates enable row level security;

drop policy if exists rempro_project_updates_select on public.rempro_project_updates;
create policy rempro_project_updates_select
  on public.rempro_project_updates for select to authenticated
  using (
    exists (
      select 1 from public.rempro_members m
      where m.email = (auth.jwt() ->> 'email')
    )
  );

revoke all on public.rempro_project_updates from anon, authenticated;
grant select on public.rempro_project_updates to authenticated;

create or replace function private.rempro_guard_project_progress()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('authenticated','anon')
     and new.progress is distinct from old.progress then
    new.progress := old.progress;
  end if;
  return new;
end;
$$;
revoke all on function private.rempro_guard_project_progress() from public, anon, authenticated;

drop trigger if exists trg_rempro_guard_project_progress on public.rempro_projects;
create trigger trg_rempro_guard_project_progress
before update on public.rempro_projects
for each row execute function private.rempro_guard_project_progress();

create or replace function private.rempro_apply_project_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.rempro_projects
     set progress = new.progress,
         updated_at = greatest(now(), new.created_at),
         updated_by = case
           when new.source='chatgpt_audio' then 'ChatGPT audio'
           else 'ChatGPT'
         end
   where id = new.project_id;
  return new;
end;
$$;
revoke all on function private.rempro_apply_project_update() from public, anon, authenticated;

drop trigger if exists trg_rempro_apply_project_update on public.rempro_project_updates;
create trigger trg_rempro_apply_project_update
after insert on public.rempro_project_updates
for each row execute function private.rempro_apply_project_update();

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'rempro-price-evidence',
  'rempro-price-evidence',
  false,
  15728640,
  array[
    'image/jpeg','image/png','image/webp','application/pdf','text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists rempro_price_evidence_select on storage.objects;
create policy rempro_price_evidence_select
  on storage.objects for select to authenticated
  using (
    bucket_id='rempro-price-evidence'
    and exists (
      select 1 from public.rempro_members m
      where m.email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists rempro_price_evidence_insert on storage.objects;
create policy rempro_price_evidence_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id='rempro-price-evidence'
    and exists (
      select 1 from public.rempro_members m
      where m.email = (auth.jwt() ->> 'email')
    )
  );
