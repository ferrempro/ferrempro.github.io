drop policy if exists rempro_price_history_select on public.rempro_price_history;
create policy rempro_price_history_select
  on public.rempro_price_history for select to authenticated
  using (
    exists (
      select 1 from public.rempro_members m
      where m.email = ((select auth.jwt()) ->> 'email')
    )
  );

drop policy if exists rempro_price_history_insert on public.rempro_price_history;
create policy rempro_price_history_insert
  on public.rempro_price_history for insert to authenticated
  with check (
    exists (
      select 1 from public.rempro_members m
      where m.email = ((select auth.jwt()) ->> 'email')
    )
  );

drop policy if exists rempro_project_updates_select on public.rempro_project_updates;
create policy rempro_project_updates_select
  on public.rempro_project_updates for select to authenticated
  using (
    exists (
      select 1 from public.rempro_members m
      where m.email = ((select auth.jwt()) ->> 'email')
    )
  );

drop policy if exists rempro_price_evidence_select on storage.objects;
create policy rempro_price_evidence_select
  on storage.objects for select to authenticated
  using (
    bucket_id='rempro-price-evidence'
    and exists (
      select 1 from public.rempro_members m
      where m.email = ((select auth.jwt()) ->> 'email')
    )
  );

drop policy if exists rempro_price_evidence_insert on storage.objects;
create policy rempro_price_evidence_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id='rempro-price-evidence'
    and exists (
      select 1 from public.rempro_members m
      where m.email = ((select auth.jwt()) ->> 'email')
    )
  );
