-- Centro de costo para vehículos RemPro.
-- Los movimientos financieros reales se capturan únicamente en Supabase,
-- no se publican en el repositorio.

create table if not exists public.rempro_vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  make text,
  model text,
  year integer,
  vehicle_type text not null default 'work'
    check (vehicle_type in ('work','personal','mixed')),
  status text not null default 'active'
    check (status in ('active','inactive','sold')),
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  financed_amount numeric(14,2) not null default 0 check (financed_amount >= 0),
  monthly_payment numeric(14,2) not null default 0 check (monthly_payment >= 0),
  notes text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.rempro_vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.rempro_vehicles(id)
    on update restrict on delete restrict,
  expense_date date,
  entry_type text not null default 'expense'
    check (entry_type in ('expense','financing_payment','recovery')),
  category text not null default 'other'
    check (category in ('fuel','maintenance','repair','tire','glass','insurance','registration','financing','other')),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'paid'
    check (status in ('paid','quoted','scheduled')),
  recovery_eligible boolean not null default true,
  notes text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists rempro_vehicle_costs_vehicle_idx
  on public.rempro_vehicle_costs(vehicle_id);

create index if not exists rempro_vehicle_costs_date_idx
  on public.rempro_vehicle_costs(expense_date desc nulls last);

alter table public.rempro_vehicles enable row level security;
alter table public.rempro_vehicle_costs enable row level security;

revoke all on public.rempro_vehicles from anon, authenticated;
revoke all on public.rempro_vehicle_costs from anon, authenticated;

grant select, insert, update on public.rempro_vehicles to authenticated;
grant select, insert, update on public.rempro_vehicle_costs to authenticated;

drop policy if exists rempro_vehicles_all on public.rempro_vehicles;
create policy rempro_vehicles_all
  on public.rempro_vehicles for all to authenticated
  using ((select public.rempro_is_member()))
  with check ((select public.rempro_is_member()));

drop policy if exists rempro_vehicle_costs_all on public.rempro_vehicle_costs;
create policy rempro_vehicle_costs_all
  on public.rempro_vehicle_costs for all to authenticated
  using ((select public.rempro_is_member()))
  with check ((select public.rempro_is_member()));
