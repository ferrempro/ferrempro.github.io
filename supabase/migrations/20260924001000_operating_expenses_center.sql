-- Centro de gastos operativos generales RemPro.
-- Los movimientos reales se registran solamente en Supabase; este archivo conserva la estructura.

create table if not exists public.rempro_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  cost_center text not null default 'Operación general',
  category text not null default 'other'
    check (category in ('fuel','maintenance','equipment','office','transport','other')),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  project_related boolean not null default false,
  project_id uuid null references public.rempro_projects(id)
    on update restrict on delete restrict,
  notes text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists rempro_operating_expenses_date_idx
  on public.rempro_operating_expenses(expense_date desc);

alter table public.rempro_operating_expenses enable row level security;

revoke all on public.rempro_operating_expenses from anon, authenticated;
grant select, insert, update on public.rempro_operating_expenses to authenticated;

drop policy if exists rempro_operating_expenses_all on public.rempro_operating_expenses;
create policy rempro_operating_expenses_all
  on public.rempro_operating_expenses for all to authenticated
  using ((select public.rempro_is_member()))
  with check ((select public.rempro_is_member()));
