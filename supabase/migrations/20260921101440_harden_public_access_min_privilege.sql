-- RemPro Control: mínimo privilegio para la capa activa.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

revoke all on public.rempro_members from authenticated;
grant select on public.rempro_members to authenticated;

revoke all on public.rempro_projects from authenticated;
grant select, insert, update on public.rempro_projects to authenticated;

revoke all on public.rempro_prices from authenticated;
grant select, insert, update on public.rempro_prices to authenticated;

revoke all on public.rempro_rules from authenticated;
grant select, insert, update on public.rempro_rules to authenticated;

revoke all on public.rempro_price_history from authenticated;
grant select, insert on public.rempro_price_history to authenticated;

revoke all on public.rempro_project_updates from authenticated;
grant select on public.rempro_project_updates to authenticated;

revoke execute on function public.rempro_touch_updated_at() from public, anon, authenticated;
