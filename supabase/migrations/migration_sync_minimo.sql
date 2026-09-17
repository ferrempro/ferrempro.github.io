-- RemPro Control · Sincronización mínima (V2)
-- ---------------------------------------------------------------------
-- Este archivo reemplaza, para este cambio, al borrador de 44 tablas
-- (20260915065819_initial_schema.sql) que el propio archivo marca como
-- "DRAFT 1.6 — NO EJECUTAR TODAVÍA" y cierra con un comentario de
-- ROLLBACK. Ese borrador sigue disponible para revisión futura, pero no
-- se ejecuta aquí ni lo sustituye: es una migración distinta, del tamaño
-- real de lo que la V1 guarda hoy (obras, precios, reglas).
--
-- Cómo aplicarlo:
--   1. Entra a app.supabase.com → tu proyecto (rvjjnkrojkpepbcxvevl) →
--      SQL Editor → New query.
--   2. Pega este archivo completo y ejecuta (Run).
--   3. Al final cambia el correo de ejemplo por el tuyo si es distinto,
--      antes de ejecutar, o edítalo después en Table editor.
--   4. Crea tu usuario en Authentication → Users → Add user (con
--      contraseña) usando el MISMO correo que agregaste a
--      rempro_members.
--
-- Nadie que no esté en rempro_members puede leer ni escribir estas
-- tablas, ni siquiera con sesión iniciada. La llave publicable (anon)
-- que ya está en supabase-config.js no sirve para saltarse esto: sin
-- sesión autenticada, RLS bloquea todo acceso a las cuatro tablas.

create extension if not exists pgcrypto;

-- 1) Lista blanca de correos con acceso. Se administra sólo desde el
--    Dashboard de Supabase (Table editor) o con la service_role key,
--    nunca desde el navegador: no hay política de insert/update/delete
--    para "authenticated", así que la app no puede auto-agregarse.
create table if not exists public.rempro_members (
  email text primary key,
  display_name text,
  added_at timestamptz not null default now()
);

alter table public.rempro_members enable row level security;

drop policy if exists rempro_members_select_self on public.rempro_members;
create policy rempro_members_select_self
  on public.rempro_members for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

-- 2) Obras (antes "projects" en localStorage / rempro_projects_v1)
create table if not exists public.rempro_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  folio text,
  status text,
  contract numeric not null default 0,
  collected numeric not null default 0,
  cost numeric not null default 0,
  progress numeric not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 3) Precios (antes "prices" / rempro_prices_v1)
create table if not exists public.rempro_prices (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  supplier text,
  unit text,
  net numeric not null default 0,
  vat numeric not null default 16,
  date date,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 4) Reglas RemPro (antes "rules" / rempro_rules_v1) — fila única
create table if not exists public.rempro_rules (
  id text primary key default 'default',
  liston numeric,
  canaleta numeric,
  angle numeric,
  wire numeric,
  screws numeric,
  mini numeric,
  cajillo numeric,
  curtain numeric,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.rempro_projects enable row level security;
alter table public.rempro_prices  enable row level security;
alter table public.rempro_rules   enable row level security;

-- Cualquier persona autenticada Y en rempro_members puede leer/escribir
-- estas tres tablas. Nadie más (incluida la clave anon sin sesión).
drop policy if exists rempro_projects_all on public.rempro_projects;
create policy rempro_projects_all
  on public.rempro_projects for all
  to authenticated
  using (exists (select 1 from public.rempro_members m where m.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.rempro_members m where m.email = auth.jwt() ->> 'email'));

drop policy if exists rempro_prices_all on public.rempro_prices;
create policy rempro_prices_all
  on public.rempro_prices for all
  to authenticated
  using (exists (select 1 from public.rempro_members m where m.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.rempro_members m where m.email = auth.jwt() ->> 'email'));

drop policy if exists rempro_rules_all on public.rempro_rules;
create policy rempro_rules_all
  on public.rempro_rules for all
  to authenticated
  using (exists (select 1 from public.rempro_members m where m.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.rempro_members m where m.email = auth.jwt() ->> 'email'));

-- updated_at siempre lo pone el servidor en cada UPDATE (evita que un
-- reloj de dispositivo mal ajustado gane una fusión por error).
create or replace function public.rempro_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rempro_projects_touch on public.rempro_projects;
create trigger trg_rempro_projects_touch
  before update on public.rempro_projects
  for each row execute function public.rempro_touch_updated_at();

drop trigger if exists trg_rempro_prices_touch on public.rempro_prices;
create trigger trg_rempro_prices_touch
  before update on public.rempro_prices
  for each row execute function public.rempro_touch_updated_at();

drop trigger if exists trg_rempro_rules_touch on public.rempro_rules;
create trigger trg_rempro_rules_touch
  before update on public.rempro_rules
  for each row execute function public.rempro_touch_updated_at();

-- Primer usuario con acceso. Cambia el correo si vas a usar otro antes
-- de ejecutar, o edítalo después en Table editor → rempro_members.
insert into public.rempro_members (email, display_name)
values ('ferrempro@gmail.com', 'Fernando Díaz Flores')
on conflict (email) do nothing;
