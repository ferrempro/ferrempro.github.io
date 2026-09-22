-- Fix de sincronización: la app valida membresía mediante RPC segura y las RLS usan el mismo helper.
create or replace function public.rempro_is_member()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.rempro_members m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.rempro_is_member() from public, anon;
grant execute on function public.rempro_is_member() to authenticated;

drop policy if exists rempro_projects_all on public.rempro_projects;
create policy rempro_projects_all on public.rempro_projects for all to authenticated
using ((select public.rempro_is_member())) with check ((select public.rempro_is_member()));

drop policy if exists rempro_prices_all on public.rempro_prices;
create policy rempro_prices_all on public.rempro_prices for all to authenticated
using ((select public.rempro_is_member())) with check ((select public.rempro_is_member()));

drop policy if exists rempro_rules_all on public.rempro_rules;
create policy rempro_rules_all on public.rempro_rules for all to authenticated
using ((select public.rempro_is_member())) with check ((select public.rempro_is_member()));

drop policy if exists rempro_price_history_select on public.rempro_price_history;
create policy rempro_price_history_select on public.rempro_price_history for select to authenticated
using ((select public.rempro_is_member()));
drop policy if exists rempro_price_history_insert on public.rempro_price_history;
create policy rempro_price_history_insert on public.rempro_price_history for insert to authenticated
with check ((select public.rempro_is_member()));

drop policy if exists rempro_project_updates_select on public.rempro_project_updates;
create policy rempro_project_updates_select on public.rempro_project_updates for select to authenticated
using ((select public.rempro_is_member()));

drop policy if exists rempro_documents_select on public.rempro_documents;
create policy rempro_documents_select on public.rempro_documents for select to authenticated
using ((select public.rempro_is_member()));
drop policy if exists rempro_documents_insert on public.rempro_documents;
create policy rempro_documents_insert on public.rempro_documents for insert to authenticated
with check ((select public.rempro_is_member()));
drop policy if exists rempro_documents_update on public.rempro_documents;
create policy rempro_documents_update on public.rempro_documents for update to authenticated
using ((select public.rempro_is_member())) with check ((select public.rempro_is_member()));

drop policy if exists rempro_price_evidence_select on storage.objects;
create policy rempro_price_evidence_select on storage.objects for select to authenticated
using (bucket_id='rempro-price-evidence' and (select public.rempro_is_member()));
drop policy if exists rempro_price_evidence_insert on storage.objects;
create policy rempro_price_evidence_insert on storage.objects for insert to authenticated
with check (bucket_id='rempro-price-evidence' and (select public.rempro_is_member()));
