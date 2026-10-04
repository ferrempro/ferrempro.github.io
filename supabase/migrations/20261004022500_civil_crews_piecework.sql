alter table public.rempro_civil_calculations
  drop constraint if exists rempro_civil_calculations_calculation_type_check;

alter table public.rempro_civil_calculations
  add constraint rempro_civil_calculations_calculation_type_check
  check (
    calculation_type in (
      'concrete',
      'mortar',
      'masonry_wall',
      'column',
      'beam',
      'footing',
      'stone_masonry',
      'reinforced_wall',
      'reinforced_slab',
      'crew_work'
    )
  ) not valid;

alter table public.rempro_civil_calculations
  validate constraint rempro_civil_calculations_calculation_type_check;

comment on table public.rempro_civil_calculations is
  'Historial privado RemPro de materiales, elementos estructurales, destajos y cuadrillas; protegido por RLS y membresía.';
