-- Calculador de obra civil RemPro · Fase 4.
-- Amplía el historial privado para admitir trabes de concreto armado.
-- No contiene datos operativos, costos ni información de clientes.

alter table public.rempro_civil_calculations
  drop constraint if exists rempro_civil_calculations_calculation_type_check;

alter table public.rempro_civil_calculations
  add constraint rempro_civil_calculations_calculation_type_check
  check (calculation_type in ('concrete','mortar','masonry_wall','column','beam'))
  not valid;

alter table public.rempro_civil_calculations
  validate constraint rempro_civil_calculations_calculation_type_check;

comment on table public.rempro_civil_calculations is
  'Historial privado RemPro de concretos, morteros, muros de mampostería, columnas y trabes de concreto armado; protegido por RLS y membresía.';
