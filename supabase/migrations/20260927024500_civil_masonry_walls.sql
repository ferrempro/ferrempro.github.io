-- Calculador de obra civil RemPro · Fase 2.
-- Amplía el historial existente para admitir muros de tabique/block.
-- No contiene datos operativos ni financieros.

alter table public.rempro_civil_calculations
  drop constraint if exists rempro_civil_calculations_calculation_type_check;

alter table public.rempro_civil_calculations
  add constraint rempro_civil_calculations_calculation_type_check
  check (calculation_type in ('concrete','mortar','masonry_wall'))
  not valid;

alter table public.rempro_civil_calculations
  validate constraint rempro_civil_calculations_calculation_type_check;

comment on table public.rempro_civil_calculations is
  'Historial privado RemPro de concretos, morteros y muros de mampostería; protegido por RLS y membresía.';
