-- RemPro Control V2: documentos y estados del Control Maestro.

create table if not exists public.rempro_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.rempro_projects(id),
  title text not null,
  document_type text not null default 'Otro',
  folio text null,
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','partial','paid','accepted','overdue','rejected')),
  sent_state text not null default 'unsent' check (sent_state in ('unsent','sent')),
  due_date date null,
  notes text null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text null
);

create index if not exists rempro_documents_project_idx on public.rempro_documents(project_id, updated_at desc);
create index if not exists rempro_documents_status_idx on public.rempro_documents(status, updated_at desc);

alter table public.rempro_documents enable row level security;

drop policy if exists rempro_documents_select on public.rempro_documents;
create policy rempro_documents_select on public.rempro_documents for select to authenticated
using (exists (select 1 from public.rempro_members m where m.email = (select auth.jwt() ->> 'email')));

drop policy if exists rempro_documents_insert on public.rempro_documents;
create policy rempro_documents_insert on public.rempro_documents for insert to authenticated
with check (exists (select 1 from public.rempro_members m where m.email = (select auth.jwt() ->> 'email')));

drop policy if exists rempro_documents_update on public.rempro_documents;
create policy rempro_documents_update on public.rempro_documents for update to authenticated
using (exists (select 1 from public.rempro_members m where m.email = (select auth.jwt() ->> 'email')))
with check (exists (select 1 from public.rempro_members m where m.email = (select auth.jwt() ->> 'email')));

revoke all on public.rempro_documents from anon, authenticated;
grant select, insert, update on public.rempro_documents to authenticated;
