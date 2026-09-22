-- Sincronización del borrador APU rápido entre dispositivos autorizados.
create table if not exists public.rempro_apu_drafts (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text null
);

alter table public.rempro_apu_drafts enable row level security;

revoke all on public.rempro_apu_drafts from anon, authenticated;
grant select, insert, update on public.rempro_apu_drafts to authenticated;

drop policy if exists rempro_apu_drafts_select on public.rempro_apu_drafts;
create policy rempro_apu_drafts_select on public.rempro_apu_drafts
for select to authenticated
using ((select public.rempro_is_member()));

drop policy if exists rempro_apu_drafts_insert on public.rempro_apu_drafts;
create policy rempro_apu_drafts_insert on public.rempro_apu_drafts
for insert to authenticated
with check ((select public.rempro_is_member()));

drop policy if exists rempro_apu_drafts_update on public.rempro_apu_drafts;
create policy rempro_apu_drafts_update on public.rempro_apu_drafts
for update to authenticated
using ((select public.rempro_is_member()))
with check ((select public.rempro_is_member()));
