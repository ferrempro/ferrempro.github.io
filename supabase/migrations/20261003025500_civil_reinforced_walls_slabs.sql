-- Calculador de obra civil RemPro · Fase 7.
-- Amplía el historial privado para muros y losas de concreto reforzado.
-- No contiene datos operativos, costos ni información de clientes.

alter table public.rempro_civil_calculations
  drop constraint if exists rempro_civil_calculations_calculation_type_check;

alter table public.rempro_civil_calculations
  add constraint rempro_civil_calculations_calculation_type_check
  check (calculation_type in ('concrete','mortar','masonry_wall','column','beam','footing','stone_masonry','reinforced_wall','reinforced_slab'))
  not valid;

alter table public.rempro_civil_calculations
  validate constraint rempro_civil_calculations_calculation_type_check;

comment on table public.rempro_civil_calculations is
  'Historial privado RemPro de concretos, morteros, mamposterías y elementos de concreto reforzado; protegido por RLS y membresía.';
