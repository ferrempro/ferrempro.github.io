-- ============================================================================
-- RemPro Control V2
-- 001_initial_schema.sql
-- DRAFT 1.6 — NO EJECUTAR TODAVÍA
--
-- Arquitectura congelada:
-- Fernando -> RemPro -> Proyectos -> Comercial / Costos / Flujo / Avance / APU / Precios
--
-- Política monetaria definitiva:
--   * Toda la contabilidad, allocations, saldos y reportes se expresan en MXN.
--   * USD NO es una moneda contable del sistema.
--   * Cuando el origen físico de un cobro sea USD, cash_movements conserva:
--       source_amount_usd,
--       fx_rate_mxn_per_usd,
--       fx_rate_date,
--       fx_source,
--       fx_reference
--     y el ledger registra como importe financiero definitivo amount_mxn.
--   * amount_mxn queda congelado al registrar el pago y NUNCA se recalcula
--     por variaciones posteriores del dólar.
--   * Si posteriormente los USD físicos se convierten a pesos a una tasa
--     distinta, cualquier diferencia se registra como un movimiento separado
--     de ajuste; jamás modifica el pago original ni sus allocations.
--
-- Referencia de conversión prevista para CONTROL INTERNO:
--   Banco de México, FIX (serie SIE SF43718), consultado mediante backend /
--   Supabase Edge Function.
--   BANXICO_FIX se documenta únicamente como referencia interna de conversión.
--   NO debe etiquetarse ni asumirse como tipo de cambio fiscal y RemPro Control
--   NO sustituye las reglas fiscales de tipo de cambio aplicables a
--   contribuciones u obligaciones fiscales.
--   Ninguna credencial, token o secreto de Banxico debe residir en el
--   frontend público ni en este repositorio.
--
-- IMPORTANTE:
--   Este archivo es el primer borrador físico del esquema. No ha sido ejecutado.
--   Una vez aprobado y aplicado, toda modificación posterior deberá realizarse
--   mediante una nueva migración numerada.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- Internal implementation functions live outside the exposed API schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ============================================================================
-- 1. PERFIL Y ORGANIZACIÓN
-- ============================================================================

create table public.profiles (
    id uuid primary key references auth.users(id) on update restrict on delete restrict,
    display_name text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null unique references auth.users(id) on update restrict on delete restrict,
    trade_name text not null,
    legal_name text,
    tax_id text,
    base_currency_code text not null default 'MXN'
        check (base_currency_code = 'MXN'),
    timezone text not null default 'America/Mazatlan',

    client_mutation_id uuid not null unique,
    device_id uuid not null,

    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint organizations_soft_delete_pair_ck
        check ((deleted_at is null and deleted_by is null)
            or (deleted_at is not null and deleted_by is not null))
);

alter table public.organizations
    add constraint organizations_org_scope_uq unique (id, owner_user_id);


-- ============================================================================
-- 1B. LEDGER DE MUTACIONES / IDEMPOTENCIA
-- ============================================================================

create table public.sync_mutations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id)
        on update restrict on delete restrict deferrable initially deferred,
    client_mutation_id uuid not null,
    device_id uuid not null,
    request_id uuid not null,
    actor_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
    operation text not null check (operation in ('insert','update','soft_delete','delete','state_transition','reversal','allocation','transfer','work_package_set','import','other')),
    entity_type text not null,
    entity_id uuid,
    input_fingerprint text not null
        check (input_fingerprint ~ '^[0-9a-f]{64}$'),
    expected_version bigint,
    resulting_version bigint,
    result_ref jsonb,
    occurred_at timestamptz not null default now(),

    constraint sync_mutations_idempotency_uq unique (organization_id, client_mutation_id),
    constraint sync_mutations_version_ck check (
        (operation = 'update' and expected_version is not null and expected_version > 0)
        or operation <> 'update'
    )
);

comment on table public.sync_mutations is
'Append-only ledger de mutaciones cliente. Un client_mutation_id sólo es retry válido cuando organization, operación, entidad e input_fingerprint SHA-256 del payload canónico coinciden.';

-- ============================================================================
-- 2. CATÁLOGOS BASE
-- ============================================================================

create table public.units (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    code text not null,
    name text not null,
    symbol text not null,
    dimension text,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint units_code_uq unique (organization_id, code),
    constraint units_org_id_uq unique (organization_id, id),
    constraint units_mutation_uq unique (organization_id, client_mutation_id),
    constraint units_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.tax_rates (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    code text not null,
    name text not null,
    tax_type text not null default 'IVA',
    rate_pct numeric(9,4) not null check (rate_pct >= 0 and rate_pct <= 100),
    effective_from date not null,
    effective_to date,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint tax_rates_code_effective_uq unique (organization_id, code, effective_from),
    constraint tax_rates_org_id_uq unique (organization_id, id),
    constraint tax_rates_mutation_uq unique (organization_id, client_mutation_id),
    constraint tax_rates_dates_ck check (effective_to is null or effective_to >= effective_from),
    constraint tax_rates_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.payment_methods (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    code text not null,
    name text not null,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint payment_methods_code_uq unique (organization_id, code),
    constraint payment_methods_org_id_uq unique (organization_id, id),
    constraint payment_methods_mutation_uq unique (organization_id, client_mutation_id),
    constraint payment_methods_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.cost_categories (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    code text not null,
    name text not null,
    default_class text not null check (default_class in ('direct','indirect')),
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint cost_categories_code_uq unique (organization_id, code),
    constraint cost_categories_org_id_uq unique (organization_id, id),
    constraint cost_categories_mutation_uq unique (organization_id, client_mutation_id),
    constraint cost_categories_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.document_types (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    code text not null,
    name text not null,
    effect text not null check (effect in ('increase','decrease','neutral')),
    affects_contract_value boolean not null default false,
    affects_receivable boolean not null default false,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint document_types_code_uq unique (organization_id, code),
    constraint document_types_org_id_uq unique (organization_id, id),
    constraint document_types_mutation_uq unique (organization_id, client_mutation_id),
    constraint document_types_effect_ck check (
        ((affects_contract_value or affects_receivable) and effect in ('increase','decrease'))
        or
        ((not affects_contract_value and not affects_receivable) and effect = 'neutral')
    ),
    constraint document_types_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

-- ============================================================================
-- 3. PRESENTACIÓN, CLIENTES, PROVEEDORES Y PROYECTOS
-- ============================================================================

create table public.presentation_profiles (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    name text not null,
    show_tax_separately boolean not null default true,
    tax_inclusive_when_hidden boolean not null default true,
    show_unit_prices boolean not null default true,
    show_cost_breakdown boolean not null default false,
    show_internal_indirects boolean not null default false,
    show_internal_profit boolean not null default false,
    rounding_decimals smallint not null default 2 check (rounding_decimals between 0 and 4),
    commercial_notes text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint presentation_profiles_name_uq unique (organization_id, name),
    constraint presentation_profiles_org_id_uq unique (organization_id, id),
    constraint presentation_profiles_mutation_uq unique (organization_id, client_mutation_id),
    constraint presentation_profiles_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.clients (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    presentation_profile_id uuid,
    name text not null,
    legal_name text,
    tax_id text,
    phone text,
    email text,
    notes text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint clients_org_id_uq unique (organization_id, id),
    constraint clients_mutation_uq unique (organization_id, client_mutation_id),
    constraint clients_presentation_fk foreign key (organization_id, presentation_profile_id)
        references public.presentation_profiles(organization_id, id)
        on update restrict on delete restrict,
    constraint clients_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.suppliers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    name text not null,
    tax_id text,
    phone text,
    email text,
    notes text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint suppliers_org_id_uq unique (organization_id, id),
    constraint suppliers_mutation_uq unique (organization_id, client_mutation_id),
    constraint suppliers_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.projects (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    client_id uuid not null,
    code text not null,
    name text not null,
    status text not null check (status in ('quotation','active','paused','completed','archived','cancelled')),
    location text,
    start_date date,
    planned_end_date date,
    actual_end_date date,
    notes text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint projects_code_uq unique (organization_id, code),
    constraint projects_org_id_uq unique (organization_id, id),
    constraint projects_mutation_uq unique (organization_id, client_mutation_id),
    constraint projects_client_fk foreign key (organization_id, client_id)
        references public.clients(organization_id, id)
        on update restrict on delete restrict,
    constraint projects_dates_ck check (
        actual_end_date is null or start_date is null or actual_end_date >= start_date
    ),
    constraint projects_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.project_work_packages (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    code text not null,
    name text not null,
    weight_pct numeric(9,4) not null check (weight_pct > 0 and weight_pct <= 100),
    sort_order integer not null default 0,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint project_work_packages_code_uq unique (organization_id, project_id, code),
    constraint project_work_packages_org_id_uq unique (organization_id, id),
    constraint project_work_packages_mutation_uq unique (organization_id, client_mutation_id),
    constraint project_work_packages_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint project_work_packages_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

-- ============================================================================
-- 4. COMERCIAL
-- ============================================================================

create table public.commercial_documents (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    client_id uuid not null,
    document_type_id uuid not null,

    folio text not null,
    revision_no integer not null default 1 check (revision_no > 0),
    supersedes_document_id uuid,
    status text not null default 'draft'
        check (status in ('draft','issued','approved','rejected','cancelled','superseded')),
    issue_date date,
    valid_until date,

    -- Snapshots calculados por servidor; todos en MXN.
    subtotal_mxn numeric(18,2) not null default 0 check (subtotal_mxn >= 0),
    discount_mxn numeric(18,2) not null default 0 check (discount_mxn >= 0),
    tax_mxn numeric(18,2) not null default 0 check (tax_mxn >= 0),
    amount_mxn numeric(18,2) not null default 0 check (amount_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,

    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint commercial_documents_folio_revision_uq unique (organization_id, folio, revision_no),
    constraint commercial_documents_org_id_uq unique (organization_id, id),
    constraint commercial_documents_mutation_uq unique (organization_id, client_mutation_id),

    constraint commercial_documents_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_documents_client_fk foreign key (organization_id, client_id)
        references public.clients(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_documents_type_fk foreign key (organization_id, document_type_id)
        references public.document_types(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_documents_supersedes_fk foreign key (organization_id, supersedes_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,

    constraint commercial_documents_total_ck check (
        amount_mxn = round(subtotal_mxn - discount_mxn + tax_mxn, 2)
    ),
    constraint commercial_documents_issue_ck check (
        status in ('draft','cancelled')
        or issue_date is not null
    ),
    constraint commercial_documents_valid_until_ck check (
        valid_until is null or issue_date is null or valid_until >= issue_date
    )
);

create unique index commercial_documents_superseded_once_uq
    on public.commercial_documents (supersedes_document_id)
    where supersedes_document_id is not null;

create table public.commercial_document_lines (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    commercial_document_id uuid not null,
    line_number integer not null check (line_number > 0),
    work_package_id uuid,
    apu_revision_id uuid,

    description text not null,
    quantity numeric(18,4) not null check (quantity > 0),
    unit_id uuid not null,
    unit_price_mxn numeric(18,4) not null check (unit_price_mxn >= 0),
    subtotal_mxn numeric(18,2)
        generated always as (round(quantity * unit_price_mxn, 2)) stored,
    discount_mxn numeric(18,2) not null default 0 check (discount_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint commercial_document_lines_number_uq unique (commercial_document_id, line_number),
    constraint commercial_document_lines_org_id_uq unique (organization_id, id),
    constraint commercial_document_lines_mutation_uq unique (organization_id, client_mutation_id),
    constraint commercial_document_lines_document_fk foreign key (organization_id, commercial_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_lines_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_lines_work_package_fk foreign key (organization_id, work_package_id)
        references public.project_work_packages(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_lines_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_lines_discount_ck check (
        discount_mxn <= subtotal_mxn
    )
);

create table public.commercial_line_taxes (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    commercial_document_line_id uuid not null,
    tax_rate_id uuid not null,

    taxable_base_mxn numeric(18,2) not null check (taxable_base_mxn >= 0),
    rate_snapshot numeric(9,4) not null check (rate_snapshot >= 0 and rate_snapshot <= 100),
    tax_amount_mxn numeric(18,2) not null check (tax_amount_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint commercial_line_taxes_rate_uq unique (commercial_document_line_id, tax_rate_id),
    constraint commercial_line_taxes_org_id_uq unique (organization_id, id),
    constraint commercial_line_taxes_mutation_uq unique (organization_id, client_mutation_id),
    constraint commercial_line_taxes_line_fk foreign key (organization_id, commercial_document_line_id)
        references public.commercial_document_lines(organization_id, id)
        on update restrict on delete cascade,
    constraint commercial_line_taxes_tax_rate_fk foreign key (organization_id, tax_rate_id)
        references public.tax_rates(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_line_taxes_arithmetic_ck check (
        tax_amount_mxn = round(taxable_base_mxn * rate_snapshot / 100.0, 2)
    )
);

create table public.commercial_line_pricing (
    commercial_document_line_id uuid primary key,
    organization_id uuid not null,
    project_id uuid not null,

    direct_cost_mxn numeric(18,4) not null default 0 check (direct_cost_mxn >= 0),
    indirect_amount_mxn numeric(18,4) not null default 0 check (indirect_amount_mxn >= 0),
    risk_amount_mxn numeric(18,4) not null default 0 check (risk_amount_mxn >= 0),
    profit_amount_mxn numeric(18,4) not null default 0 check (profit_amount_mxn >= 0),
    commercial_net_mxn numeric(18,4) not null default 0 check (commercial_net_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint commercial_line_pricing_org_id_uq unique (organization_id, commercial_document_line_id),
    constraint commercial_line_pricing_mutation_uq unique (organization_id, client_mutation_id),
    constraint commercial_line_pricing_line_fk foreign key (organization_id, commercial_document_line_id)
        references public.commercial_document_lines(organization_id, id)
        on update restrict on delete cascade,
    constraint commercial_line_pricing_total_ck check (
        commercial_net_mxn = round(
            direct_cost_mxn + indirect_amount_mxn + risk_amount_mxn + profit_amount_mxn, 4
        )
    )
);

create table public.commercial_document_presentations (
    commercial_document_id uuid primary key,
    organization_id uuid not null,
    presentation_profile_id uuid not null,

    show_tax_separately boolean not null,
    tax_inclusive_when_hidden boolean not null,
    show_unit_prices boolean not null,
    show_cost_breakdown boolean not null,
    show_internal_indirects boolean not null,
    show_internal_profit boolean not null,
    rounding_decimals smallint not null check (rounding_decimals between 0 and 4),
    commercial_notes text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint commercial_document_presentations_org_id_uq
        unique (organization_id, commercial_document_id),
    constraint commercial_document_presentations_mutation_uq
        unique (organization_id, client_mutation_id),
    constraint commercial_document_presentations_document_fk
        foreign key (organization_id, commercial_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_presentations_profile_fk
        foreign key (organization_id, presentation_profile_id)
        references public.presentation_profiles(organization_id, id)
        on update restrict on delete restrict
);

create table public.commercial_document_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    commercial_document_id uuid not null,
    event_type text not null
        check (event_type in ('created','issued','approved','rejected','cancelled','superseded','adjusted')),
    related_document_id uuid,
    reason text,
    occurred_at timestamptz not null default now(),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint commercial_document_events_org_id_uq unique (organization_id, id),
    constraint commercial_document_events_mutation_uq unique (organization_id, client_mutation_id),
    constraint commercial_document_events_document_fk foreign key (organization_id, commercial_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_events_related_fk foreign key (organization_id, related_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,
    constraint commercial_document_events_reason_ck check (
        event_type not in ('cancelled','superseded','adjusted') or reason is not null
    )
);

-- ============================================================================
-- 5. COSTOS
-- ============================================================================

create table public.cost_entries (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    supplier_id uuid,
    cost_category_id uuid not null,
    work_package_id uuid,

    incurred_date date not null,
    description text not null,
    cost_class text not null check (cost_class in ('direct','indirect')),
    entry_kind text not null check (entry_kind in ('original','adjustment','reversal')),
    effect text not null check (effect in ('increase','decrease')),
    related_cost_entry_id uuid,

    quantity numeric(18,4),
    unit_id uuid,
    unit_cost_mxn numeric(18,4),

    net_amount_mxn numeric(18,2) not null check (net_amount_mxn >= 0),
    tax_amount_mxn numeric(18,2) not null default 0 check (tax_amount_mxn >= 0),
    amount_mxn numeric(18,2)
        generated always as (round(net_amount_mxn + tax_amount_mxn, 2)) stored,

    source_reference text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint cost_entries_org_id_uq unique (organization_id, id),
    constraint cost_entries_mutation_uq unique (organization_id, client_mutation_id),
    constraint cost_entries_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entries_supplier_fk foreign key (organization_id, supplier_id)
        references public.suppliers(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entries_category_fk foreign key (organization_id, cost_category_id)
        references public.cost_categories(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entries_work_package_fk foreign key (organization_id, work_package_id)
        references public.project_work_packages(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entries_related_fk foreign key (organization_id, related_cost_entry_id)
        references public.cost_entries(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entries_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,

    constraint cost_entries_quantity_block_ck check (
        (quantity is null and unit_id is null and unit_cost_mxn is null)
        or
        (quantity is not null and quantity > 0 and unit_id is not null
             and unit_cost_mxn is not null and unit_cost_mxn >= 0)
    ),
    constraint cost_entries_kind_ck check (
        (entry_kind = 'original' and effect = 'increase' and related_cost_entry_id is null)
        or
        (entry_kind in ('adjustment','reversal') and related_cost_entry_id is not null)
    ),
    constraint cost_entries_positive_amount_ck check (amount_mxn > 0)
);

create table public.cost_entry_taxes (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    cost_entry_id uuid not null,
    tax_rate_id uuid not null,
    taxable_base_mxn numeric(18,2) not null check (taxable_base_mxn >= 0),
    rate_snapshot numeric(9,4) not null check (rate_snapshot >= 0 and rate_snapshot <= 100),
    tax_amount_mxn numeric(18,2) not null check (tax_amount_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint cost_entry_taxes_rate_uq unique (cost_entry_id, tax_rate_id),
    constraint cost_entry_taxes_org_id_uq unique (organization_id, id),
    constraint cost_entry_taxes_mutation_uq unique (organization_id, client_mutation_id),
    constraint cost_entry_taxes_cost_fk foreign key (organization_id, cost_entry_id)
        references public.cost_entries(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entry_taxes_rate_fk foreign key (organization_id, tax_rate_id)
        references public.tax_rates(organization_id, id)
        on update restrict on delete restrict,
    constraint cost_entry_taxes_arithmetic_ck check (
        tax_amount_mxn = round(taxable_base_mxn * rate_snapshot / 100.0, 2)
    )
);

-- ============================================================================
-- 6. FLUJO DE EFECTIVO — TODO EL LEDGER EN MXN
-- ============================================================================

create table public.cash_accounts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
    name text not null,
    account_type text not null
        check (account_type in ('bank','cash','other')),
    institution text,
    masked_reference text,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint cash_accounts_org_id_uq unique (organization_id, id),
    constraint cash_accounts_mutation_uq unique (organization_id, client_mutation_id),
    constraint cash_accounts_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.cash_movements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid,
    cash_account_id uuid not null,
    client_id uuid,
    supplier_id uuid,

    movement_kind text not null
        check (movement_kind in ('receipt','payment','transfer','adjustment','reversal')),
    direction text not null check (direction in ('inflow','outflow')),
    effect text not null check (effect in ('increase','decrease')),
    related_movement_id uuid,
    transfer_group_id uuid,

    payment_method_id uuid,
    occurred_at timestamptz not null,

    -- Valor contable definitivo, siempre MXN.
    amount_mxn numeric(18,2) not null check (amount_mxn > 0),

    -- Metadatos opcionales cuando el COBRO se recibe originalmente en USD.
    -- No convierten el sistema en multimoneda: sólo preservan evidencia.
    source_amount_usd numeric(18,2),
    fx_rate_mxn_per_usd numeric(18,8),
    fx_rate_date date,
    fx_source text,
    fx_reference text,

    reference text,
    description text not null,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint cash_movements_org_id_uq unique (organization_id, id),
    constraint cash_movements_mutation_uq unique (organization_id, client_mutation_id),
    constraint cash_movements_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_movements_account_fk foreign key (organization_id, cash_account_id)
        references public.cash_accounts(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_movements_client_fk foreign key (organization_id, client_id)
        references public.clients(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_movements_supplier_fk foreign key (organization_id, supplier_id)
        references public.suppliers(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_movements_payment_method_fk foreign key (organization_id, payment_method_id)
        references public.payment_methods(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_movements_related_fk foreign key (organization_id, related_movement_id)
        references public.cash_movements(organization_id, id)
        on update restrict on delete restrict,

    constraint cash_movements_counterparty_ck check (
        num_nonnulls(client_id, supplier_id) <= 1
    ),
    constraint cash_movements_kind_direction_ck check (
        (movement_kind = 'receipt' and direction = 'inflow')
        or (movement_kind = 'payment' and direction = 'outflow')
        or movement_kind in ('transfer','adjustment','reversal')
    ),
    constraint cash_movements_usd_conversion_ck check (
        (
            source_amount_usd is null
            and fx_rate_mxn_per_usd is null
            and fx_rate_date is null
            and fx_source is null
            and fx_reference is null
        )
        or
        (
            source_amount_usd is not null
            and source_amount_usd > 0
            and fx_rate_mxn_per_usd is not null
            and fx_rate_mxn_per_usd > 0
            and fx_rate_date is not null
            and fx_source is not null
            and btrim(fx_source) <> ''
            and movement_kind in ('receipt','reversal')
            and direction = 'inflow'
            and amount_mxn = round(source_amount_usd * fx_rate_mxn_per_usd, 2)
        )
    ),
    constraint cash_movements_entry_kind_ck check (
        (movement_kind in ('receipt','payment','transfer')
            and related_movement_id is null and effect = 'increase')
        or
        (movement_kind = 'adjustment' and related_movement_id is not null)
        or
        (movement_kind = 'reversal' and related_movement_id is not null and effect = 'decrease')
    ),
    constraint cash_movements_transfer_ck check (
        (movement_kind = 'transfer' and transfer_group_id is not null)
        or
        (movement_kind <> 'transfer' and transfer_group_id is null)
    )
);

create table public.cash_allocations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    cash_movement_id uuid not null,

    commercial_document_id uuid,
    cost_entry_id uuid,

    entry_kind text not null default 'original'
        check (entry_kind in ('original','adjustment','reversal')),
    effect text not null default 'increase'
        check (effect in ('increase','decrease')),
    related_allocation_id uuid,

    -- Toda asignación es MXN porque todo el ledger ya está valorizado en MXN.
    amount_mxn numeric(18,2) not null check (amount_mxn > 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint cash_allocations_org_id_uq unique (organization_id, id),
    constraint cash_allocations_mutation_uq unique (organization_id, client_mutation_id),
    constraint cash_allocations_movement_fk foreign key (organization_id, cash_movement_id)
        references public.cash_movements(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_allocations_document_fk foreign key (organization_id, commercial_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_allocations_cost_fk foreign key (organization_id, cost_entry_id)
        references public.cost_entries(organization_id, id)
        on update restrict on delete restrict,
    constraint cash_allocations_related_fk foreign key (organization_id, related_allocation_id)
        references public.cash_allocations(organization_id, id)
        on update restrict on delete restrict,

    constraint cash_allocations_target_xor_ck check (
        num_nonnulls(commercial_document_id, cost_entry_id) = 1
    ),
    constraint cash_allocations_kind_ck check (
        (entry_kind = 'original' and effect = 'increase' and related_allocation_id is null)
        or
        (entry_kind in ('adjustment','reversal') and related_allocation_id is not null)
    )
);

-- ============================================================================
-- 7. AVANCE
-- ============================================================================

create table public.physical_progress_entries (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    work_package_id uuid,
    as_of_date date not null,
    progress_pct numeric(9,4) not null check (progress_pct >= 0 and progress_pct <= 100),
    measured_quantity numeric(18,4),
    unit_id uuid,
    notes text,
    supersedes_entry_id uuid,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint physical_progress_org_id_uq unique (organization_id, id),
    constraint physical_progress_mutation_uq unique (organization_id, client_mutation_id),
    constraint physical_progress_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint physical_progress_package_fk foreign key (organization_id, work_package_id)
        references public.project_work_packages(organization_id, id)
        on update restrict on delete restrict,
    constraint physical_progress_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,
    constraint physical_progress_supersedes_fk foreign key (organization_id, supersedes_entry_id)
        references public.physical_progress_entries(organization_id, id)
        on update restrict on delete restrict,
    constraint physical_progress_quantity_unit_ck check (
        (measured_quantity is null and unit_id is null)
        or
        (measured_quantity is not null and measured_quantity >= 0 and unit_id is not null)
    )
);

create table public.financial_progress_entries (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    commercial_document_id uuid,
    as_of_date date not null,
    basis text not null
        check (basis in ('earned_value','certified_value','estimated_value','contract_value')),
    progress_pct numeric(9,4) not null check (progress_pct >= 0 and progress_pct <= 100),
    earned_amount_mxn numeric(18,2) not null check (earned_amount_mxn >= 0),
    notes text,
    supersedes_entry_id uuid,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint financial_progress_org_id_uq unique (organization_id, id),
    constraint financial_progress_mutation_uq unique (organization_id, client_mutation_id),
    constraint financial_progress_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint financial_progress_document_fk foreign key (organization_id, commercial_document_id)
        references public.commercial_documents(organization_id, id)
        on update restrict on delete restrict,
    constraint financial_progress_supersedes_fk foreign key (organization_id, supersedes_entry_id)
        references public.financial_progress_entries(organization_id, id)
        on update restrict on delete restrict
);

-- ============================================================================
-- 8. CATÁLOGO E HISTÓRICO DE PRECIOS — MXN
-- ============================================================================

create table public.catalog_items (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    code text not null,
    name text not null,
    description text,
    default_unit_id uuid not null,
    category text,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint catalog_items_code_uq unique (organization_id, code),
    constraint catalog_items_org_id_uq unique (organization_id, id),
    constraint catalog_items_mutation_uq unique (organization_id, client_mutation_id),
    constraint catalog_items_unit_fk foreign key (organization_id, default_unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,
    constraint catalog_items_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.supplier_item_refs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    catalog_item_id uuid not null,
    supplier_id uuid not null,
    supplier_sku text not null,
    description text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint supplier_item_refs_sku_uq unique (organization_id, supplier_id, supplier_sku),
    constraint supplier_item_refs_org_id_uq unique (organization_id, id),
    constraint supplier_item_refs_mutation_uq unique (organization_id, client_mutation_id),
    constraint supplier_item_refs_item_fk foreign key (organization_id, catalog_item_id)
        references public.catalog_items(organization_id, id)
        on update restrict on delete restrict,
    constraint supplier_item_refs_supplier_fk foreign key (organization_id, supplier_id)
        references public.suppliers(organization_id, id)
        on update restrict on delete restrict,
    constraint supplier_item_refs_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.price_history (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    catalog_item_id uuid not null,
    supplier_id uuid,
    unit_id uuid not null,
    tax_rate_id uuid,

    verified_at timestamptz not null,
    region text not null,
    unit_price_net_mxn numeric(18,4) not null check (unit_price_net_mxn >= 0),
    tax_rate_snapshot numeric(9,4),
    tax_amount_mxn numeric(18,4) not null default 0 check (tax_amount_mxn >= 0),
    amount_mxn numeric(18,4)
        generated always as (round(unit_price_net_mxn + tax_amount_mxn, 4)) stored,
    source_type text not null,
    source_reference text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint price_history_org_id_uq unique (organization_id, id),
    constraint price_history_mutation_uq unique (organization_id, client_mutation_id),
    constraint price_history_item_fk foreign key (organization_id, catalog_item_id)
        references public.catalog_items(organization_id, id)
        on update restrict on delete restrict,
    constraint price_history_supplier_fk foreign key (organization_id, supplier_id)
        references public.suppliers(organization_id, id)
        on update restrict on delete restrict,
    constraint price_history_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,
    constraint price_history_tax_fk foreign key (organization_id, tax_rate_id)
        references public.tax_rates(organization_id, id)
        on update restrict on delete restrict,
    constraint price_history_tax_snapshot_ck check (
        (tax_rate_id is null and tax_rate_snapshot is null and tax_amount_mxn = 0)
        or
        (tax_rate_id is not null and tax_rate_snapshot is not null
             and tax_rate_snapshot >= 0 and tax_rate_snapshot <= 100)
    ),
    constraint price_history_source_ck check (
        supplier_id is not null or source_reference is not null
    ),
    constraint price_history_tax_arithmetic_ck check (
        tax_rate_snapshot is null
        or tax_amount_mxn = round(unit_price_net_mxn * tax_rate_snapshot / 100.0, 4)
    )
);

-- ============================================================================
-- 9. APU — MXN
-- ============================================================================

create table public.apus (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid,
    code text not null,
    name text not null,
    output_unit_id uuid not null,
    description text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint apus_code_uq unique (organization_id, code),
    constraint apus_org_id_uq unique (organization_id, id),
    constraint apus_mutation_uq unique (organization_id, client_mutation_id),
    constraint apus_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint apus_unit_fk foreign key (organization_id, output_unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,
    constraint apus_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.apu_revisions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    apu_id uuid not null,
    revision_no integer not null check (revision_no > 0),
    status text not null default 'draft'
        check (status in ('draft','approved','superseded','archived')),

    direct_cost_total_mxn numeric(18,4) not null default 0 check (direct_cost_total_mxn >= 0),
    indirect_total_mxn numeric(18,4) not null default 0 check (indirect_total_mxn >= 0),
    risk_total_mxn numeric(18,4) not null default 0 check (risk_total_mxn >= 0),
    profit_total_mxn numeric(18,4) not null default 0 check (profit_total_mxn >= 0),
    commercial_net_total_mxn numeric(18,4) not null default 0 check (commercial_net_total_mxn >= 0),
    tax_total_mxn numeric(18,4) not null default 0 check (tax_total_mxn >= 0),
    gross_total_mxn numeric(18,4) not null default 0 check (gross_total_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint apu_revisions_revision_uq unique (apu_id, revision_no),
    constraint apu_revisions_org_id_uq unique (organization_id, id),
    constraint apu_revisions_mutation_uq unique (organization_id, client_mutation_id),
    constraint apu_revisions_apu_fk foreign key (organization_id, apu_id)
        references public.apus(organization_id, id)
        on update restrict on delete restrict,
    constraint apu_revisions_commercial_total_ck check (
        commercial_net_total_mxn =
            round(direct_cost_total_mxn + indirect_total_mxn + risk_total_mxn + profit_total_mxn, 4)
    ),
    constraint apu_revisions_gross_total_ck check (
        gross_total_mxn = round(commercial_net_total_mxn + tax_total_mxn, 4)
    )
);

alter table public.commercial_document_lines
    add constraint commercial_document_lines_apu_revision_fk
    foreign key (organization_id, apu_revision_id)
    references public.apu_revisions(organization_id, id)
    on update restrict on delete restrict;

create table public.apu_items (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    apu_revision_id uuid not null,
    item_type text not null
        check (item_type in ('material','labor','equipment','tool','subcontract','other')),
    catalog_item_id uuid,
    description text not null,
    quantity numeric(18,4) not null check (quantity > 0),
    unit_id uuid not null,
    unit_cost_mxn numeric(18,4) not null check (unit_cost_mxn >= 0),
    amount_mxn numeric(18,4)
        generated always as (round(quantity * unit_cost_mxn, 4)) stored,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint apu_items_org_id_uq unique (organization_id, id),
    constraint apu_items_mutation_uq unique (organization_id, client_mutation_id),
    constraint apu_items_revision_fk foreign key (organization_id, apu_revision_id)
        references public.apu_revisions(organization_id, id)
        on update restrict on delete restrict,
    constraint apu_items_catalog_fk foreign key (organization_id, catalog_item_id)
        references public.catalog_items(organization_id, id)
        on update restrict on delete restrict,
    constraint apu_items_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict
);

create table public.apu_factors (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    apu_revision_id uuid not null,
    factor_type text not null check (factor_type in ('indirect','risk','profit')),
    basis text not null check (basis in ('direct_cost','direct_plus_indirect_risk')),
    rate_pct numeric(9,4) not null check (rate_pct >= 0),
    amount_mxn numeric(18,4) not null check (amount_mxn >= 0),
    sequence integer not null check (sequence > 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint apu_factors_sequence_uq unique (apu_revision_id, sequence),
    constraint apu_factors_org_id_uq unique (organization_id, id),
    constraint apu_factors_mutation_uq unique (organization_id, client_mutation_id),
    constraint apu_factors_revision_fk foreign key (organization_id, apu_revision_id)
        references public.apu_revisions(organization_id, id)
        on update restrict on delete restrict,
    constraint apu_factors_basis_ck check (
        (factor_type in ('indirect','risk') and basis = 'direct_cost')
        or (factor_type = 'profit' and basis = 'direct_plus_indirect_risk')
    )
);

create table public.apu_taxes (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    apu_revision_id uuid not null,
    tax_rate_id uuid not null,
    taxable_base_mxn numeric(18,4) not null check (taxable_base_mxn >= 0),
    rate_snapshot numeric(9,4) not null check (rate_snapshot >= 0 and rate_snapshot <= 100),
    tax_amount_mxn numeric(18,4) not null check (tax_amount_mxn >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint apu_taxes_rate_uq unique (apu_revision_id, tax_rate_id),
    constraint apu_taxes_org_id_uq unique (organization_id, id),
    constraint apu_taxes_mutation_uq unique (organization_id, client_mutation_id),
    constraint apu_taxes_revision_fk foreign key (organization_id, apu_revision_id)
        references public.apu_revisions(organization_id, id)
        on update restrict on delete restrict,
    constraint apu_taxes_tax_rate_fk foreign key (organization_id, tax_rate_id)
        references public.tax_rates(organization_id, id)
        on update restrict on delete restrict,
    constraint apu_taxes_arithmetic_ck check (
        tax_amount_mxn = round(taxable_base_mxn * rate_snapshot / 100.0, 4)
    )
);

-- ============================================================================
-- 10. REGLAS Y CALCULADORA
-- ============================================================================

create table public.rule_sets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    name text not null,
    domain text not null,
    version_no integer not null check (version_no > 0),
    status text not null check (status in ('draft','active','superseded','archived')),
    effective_from date not null,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint rule_sets_version_uq unique (organization_id, domain, version_no),
    constraint rule_sets_org_id_uq unique (organization_id, id),
    constraint rule_sets_mutation_uq unique (organization_id, client_mutation_id),
    constraint rule_sets_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.rule_values (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    rule_set_id uuid not null,
    rule_key text not null,
    value_numeric numeric(18,6),
    value_text text,
    value_boolean boolean,
    unit_id uuid,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint rule_values_key_uq unique (rule_set_id, rule_key),
    constraint rule_values_org_id_uq unique (organization_id, id),
    constraint rule_values_mutation_uq unique (organization_id, client_mutation_id),
    constraint rule_values_rule_set_fk foreign key (organization_id, rule_set_id)
        references public.rule_sets(organization_id, id)
        on update restrict on delete restrict,
    constraint rule_values_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict,
    constraint rule_values_one_value_ck check (
        num_nonnulls(value_numeric, value_text, value_boolean) = 1
    )
);

create table public.material_systems (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    code text not null,
    name text not null,
    description text,
    active boolean not null default true,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),
    deleted_at timestamptz,
    deleted_by uuid references auth.users(id) on update restrict on delete restrict,

    constraint material_systems_code_uq unique (organization_id, code),
    constraint material_systems_org_id_uq unique (organization_id, id),
    constraint material_systems_mutation_uq unique (organization_id, client_mutation_id),
    constraint material_systems_soft_delete_pair_ck check (
        (deleted_at is null and deleted_by is null) or
        (deleted_at is not null and deleted_by is not null)
    )
);

create table public.material_calculations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid,
    material_system_id uuid not null,
    rule_set_id uuid not null,
    inputs jsonb not null,
    calculated_area numeric(18,4) not null check (calculated_area >= 0),
    waste_pct numeric(9,4) not null default 0 check (waste_pct >= 0),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint material_calculations_org_id_uq unique (organization_id, id),
    constraint material_calculations_mutation_uq unique (organization_id, client_mutation_id),
    constraint material_calculations_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint material_calculations_system_fk foreign key (organization_id, material_system_id)
        references public.material_systems(organization_id, id)
        on update restrict on delete restrict,
    constraint material_calculations_rule_set_fk foreign key (organization_id, rule_set_id)
        references public.rule_sets(organization_id, id)
        on update restrict on delete restrict
);

create table public.material_calculation_items (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    material_calculation_id uuid not null,
    catalog_item_id uuid,
    description text not null,
    quantity numeric(18,4) not null check (quantity >= 0),
    unit_id uuid,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint material_calculation_items_org_id_uq unique (organization_id, id),
    constraint material_calculation_items_mutation_uq unique (organization_id, client_mutation_id),
    constraint material_calculation_items_calc_fk foreign key (organization_id, material_calculation_id)
        references public.material_calculations(organization_id, id)
        on update restrict on delete restrict,
    constraint material_calculation_items_catalog_fk foreign key (organization_id, catalog_item_id)
        references public.catalog_items(organization_id, id)
        on update restrict on delete restrict,
    constraint material_calculation_items_unit_fk foreign key (organization_id, unit_id)
        references public.units(organization_id, id)
        on update restrict on delete restrict
);

-- ============================================================================
-- 11. AUDITORÍA Y MIGRACIÓN V1
-- ============================================================================

create table public.audit_log (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid,
    actor_user_id uuid references auth.users(id) on update restrict on delete restrict,
    occurred_at timestamptz not null default now(),

    schema_name text not null,
    table_name text not null,
    record_id uuid,
    record_pk jsonb not null,
    action text not null check (action in ('insert','update','delete','event')),
    business_action text not null,

    old_data jsonb,
    new_data jsonb,
    changed_fields text[],
    reason text,

    request_id uuid not null default gen_random_uuid(),
    client_mutation_id uuid,
    device_id uuid,
    app_version text,
    source text not null default 'database',
    db_txid bigint not null default txid_current(),

    constraint audit_log_org_id_uq unique (organization_id, id),
    constraint audit_log_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict
);

create table public.import_batches (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    source text not null,
    source_version text not null,
    device_id uuid not null,
    client_mutation_id uuid not null,
    file_hash text not null,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    status text not null
        check (status in ('pending','processing','completed','failed')),
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint import_batches_hash_uq unique (organization_id, file_hash),
    constraint import_batches_mutation_uq unique (organization_id, client_mutation_id),
    constraint import_batches_org_id_uq unique (organization_id, id),
    constraint import_batches_status_ck check (
        (status in ('pending','processing') and completed_at is null)
        or
        (status in ('completed','failed') and completed_at is not null)
    )
);

create table public.import_records (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    import_batch_id uuid not null,
    source_entity text not null,
    source_key text not null,
    raw_payload jsonb not null,
    target_table text,
    target_id uuid,
    migration_status text not null
        check (migration_status in ('pending','migrated','skipped','failed')),
    error_message text,

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    updated_at timestamptz not null default now(),
    updated_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,
    version bigint not null default 1 check (version > 0),

    constraint import_records_source_uq unique (import_batch_id, source_entity, source_key),
    constraint import_records_mutation_uq unique (organization_id, client_mutation_id),
    constraint import_records_org_id_uq unique (organization_id, id),
    constraint import_records_batch_fk foreign key (organization_id, import_batch_id)
        references public.import_batches(organization_id, id)
        on update restrict on delete restrict,
    constraint import_records_target_pair_ck check (
        (target_table is null and target_id is null)
        or
        (target_table is not null and target_id is not null)
    )
);

create table public.legacy_v1_project_snapshots (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    project_id uuid not null,
    import_record_id uuid not null unique,

    contract_amount_mxn numeric(18,2) not null default 0 check (contract_amount_mxn >= 0),
    collected_amount_mxn numeric(18,2) not null default 0 check (collected_amount_mxn >= 0),
    cost_amount_mxn numeric(18,2) not null default 0 check (cost_amount_mxn >= 0),
    progress_pct numeric(9,4) not null default 0 check (progress_pct >= 0 and progress_pct <= 100),
    captured_at timestamptz not null,
    reconciliation_status text not null default 'pending'
        check (reconciliation_status in ('pending','partial','reconciled')),

    client_mutation_id uuid not null,
    device_id uuid not null,
    created_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id) on update restrict on delete restrict,

    constraint legacy_v1_project_snapshots_org_id_uq unique (organization_id, id),
    constraint legacy_v1_project_snapshots_mutation_uq unique (organization_id, client_mutation_id),
    constraint legacy_v1_project_snapshots_project_fk foreign key (organization_id, project_id)
        references public.projects(organization_id, id)
        on update restrict on delete restrict,
    constraint legacy_v1_project_snapshots_import_fk foreign key (organization_id, import_record_id)
        references public.import_records(organization_id, id)
        on update restrict on delete restrict
);

-- ============================================================================
-- 12. ÍNDICES OPERATIVOS
-- ============================================================================

create index idx_projects_org_status
    on public.projects (organization_id, status)
    where deleted_at is null;

create index idx_commercial_documents_project_date
    on public.commercial_documents (organization_id, project_id, issue_date desc);

create index idx_cost_entries_project_date
    on public.cost_entries (organization_id, project_id, incurred_date desc);

create index idx_cash_movements_account_date
    on public.cash_movements (organization_id, cash_account_id, occurred_at desc);

create index idx_cash_movements_project_date
    on public.cash_movements (organization_id, project_id, occurred_at desc)
    where project_id is not null;

create index idx_cash_allocations_movement
    on public.cash_allocations (organization_id, cash_movement_id);

create index idx_physical_progress_project_date
    on public.physical_progress_entries (organization_id, project_id, as_of_date desc);

create index idx_financial_progress_project_date
    on public.financial_progress_entries (organization_id, project_id, as_of_date desc);

create index idx_price_history_item_date
    on public.price_history (organization_id, catalog_item_id, verified_at desc);

create index idx_price_history_supplier_date
    on public.price_history (organization_id, supplier_id, verified_at desc)
    where supplier_id is not null;

create index idx_audit_log_org_time
    on public.audit_log (organization_id, occurred_at desc);

create index idx_audit_log_record
    on public.audit_log (table_name, record_id, occurred_at desc);

-- ============================================================================
-- 12B. INTEGRIDAD ORGANIZACIÓN / PROYECTO Y CONCURRENCIA FINANCIERA
-- ============================================================================

-- FK explícita a la organización en toda tabla de negocio dependiente.
alter table public.project_work_packages add constraint project_work_packages_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.commercial_documents add constraint commercial_documents_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.commercial_document_lines add constraint commercial_document_lines_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.commercial_line_taxes add constraint commercial_line_taxes_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.commercial_line_pricing add constraint commercial_line_pricing_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.commercial_document_presentations add constraint commercial_document_presentations_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.commercial_document_events add constraint commercial_document_events_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.cost_entries add constraint cost_entries_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.cost_entry_taxes add constraint cost_entry_taxes_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.cash_movements add constraint cash_movements_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.cash_allocations add constraint cash_allocations_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.physical_progress_entries add constraint physical_progress_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.financial_progress_entries add constraint financial_progress_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.catalog_items add constraint catalog_items_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.supplier_item_refs add constraint supplier_item_refs_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.price_history add constraint price_history_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.apus add constraint apus_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.apu_revisions add constraint apu_revisions_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.apu_items add constraint apu_items_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.apu_factors add constraint apu_factors_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.apu_taxes add constraint apu_taxes_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.rule_sets add constraint rule_sets_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.rule_values add constraint rule_values_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.material_systems add constraint material_systems_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.material_calculations add constraint material_calculations_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.material_calculation_items add constraint material_calculation_items_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.audit_log add constraint audit_log_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.import_batches add constraint import_batches_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.import_records add constraint import_records_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;
alter table public.legacy_v1_project_snapshots add constraint legacy_v1_project_snapshots_org_fk
    foreign key (organization_id) references public.organizations(id) on update restrict on delete restrict;

alter table public.presentation_profiles add constraint presentation_profiles_tax_hidden_ck
    check (show_tax_separately or tax_inclusive_when_hidden);
alter table public.commercial_document_presentations add constraint commercial_document_presentations_tax_hidden_ck
    check (show_tax_separately or tax_inclusive_when_hidden);

-- Claves compuestas que hacen imposible enlazar hijos con otra obra.
alter table public.projects add constraint projects_org_id_client_uq
    unique (organization_id, id, client_id);
alter table public.project_work_packages add constraint project_work_packages_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.commercial_documents add constraint commercial_documents_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.commercial_document_lines add constraint commercial_document_lines_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.cost_entries add constraint cost_entries_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.cash_movements add constraint cash_movements_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.cash_allocations add constraint cash_allocations_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.physical_progress_entries add constraint physical_progress_org_project_id_uq
    unique (organization_id, project_id, id);
alter table public.financial_progress_entries add constraint financial_progress_org_project_id_uq
    unique (organization_id, project_id, id);

-- El cliente del documento debe ser el cliente del proyecto.
alter table public.commercial_documents add constraint commercial_documents_project_client_fk
    foreign key (organization_id, project_id, client_id)
    references public.projects(organization_id, id, client_id)
    on update restrict on delete restrict;
alter table public.commercial_documents add constraint commercial_documents_project_supersedes_fk
    foreign key (organization_id, project_id, supersedes_document_id)
    references public.commercial_documents(organization_id, project_id, id)
    on update restrict on delete restrict;

-- Documento y work package de una línea pertenecen a la misma obra de la línea.
alter table public.commercial_document_lines add constraint commercial_document_lines_project_document_fk
    foreign key (organization_id, project_id, commercial_document_id)
    references public.commercial_documents(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.commercial_document_lines add constraint commercial_document_lines_project_work_package_fk
    foreign key (organization_id, project_id, work_package_id)
    references public.project_work_packages(organization_id, project_id, id)
    on update restrict on delete restrict;

alter table public.commercial_line_taxes add constraint commercial_line_taxes_project_line_fk
    foreign key (organization_id, project_id, commercial_document_line_id)
    references public.commercial_document_lines(organization_id, project_id, id)
    on update restrict on delete cascade;
alter table public.commercial_line_pricing add constraint commercial_line_pricing_project_line_fk
    foreign key (organization_id, project_id, commercial_document_line_id)
    references public.commercial_document_lines(organization_id, project_id, id)
    on update restrict on delete cascade;
alter table public.commercial_document_events add constraint commercial_document_events_project_document_fk
    foreign key (organization_id, project_id, commercial_document_id)
    references public.commercial_documents(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.commercial_document_events add constraint commercial_document_events_project_related_fk
    foreign key (organization_id, project_id, related_document_id)
    references public.commercial_documents(organization_id, project_id, id)
    on update restrict on delete restrict;

alter table public.cost_entries add constraint cost_entries_project_work_package_fk
    foreign key (organization_id, project_id, work_package_id)
    references public.project_work_packages(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.cost_entries add constraint cost_entries_project_related_fk
    foreign key (organization_id, project_id, related_cost_entry_id)
    references public.cost_entries(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.cost_entry_taxes add constraint cost_entry_taxes_project_cost_fk
    foreign key (organization_id, project_id, cost_entry_id)
    references public.cost_entries(organization_id, project_id, id)
    on update restrict on delete restrict;

-- Una allocation exige que el movimiento ya esté asociado a la misma obra.
alter table public.cash_movements add constraint cash_movements_project_related_fk
    foreign key (organization_id, project_id, related_movement_id)
    references public.cash_movements(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.cash_allocations add constraint cash_allocations_project_movement_fk
    foreign key (organization_id, project_id, cash_movement_id)
    references public.cash_movements(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.cash_allocations add constraint cash_allocations_project_document_fk
    foreign key (organization_id, project_id, commercial_document_id)
    references public.commercial_documents(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.cash_allocations add constraint cash_allocations_project_cost_fk
    foreign key (organization_id, project_id, cost_entry_id)
    references public.cost_entries(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.cash_allocations add constraint cash_allocations_project_related_fk
    foreign key (organization_id, project_id, related_allocation_id)
    references public.cash_allocations(organization_id, project_id, id)
    on update restrict on delete restrict;

alter table public.physical_progress_entries add constraint physical_progress_project_package_fk
    foreign key (organization_id, project_id, work_package_id)
    references public.project_work_packages(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.physical_progress_entries add constraint physical_progress_project_supersedes_fk
    foreign key (organization_id, project_id, supersedes_entry_id)
    references public.physical_progress_entries(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.financial_progress_entries add constraint financial_progress_project_document_fk
    foreign key (organization_id, project_id, commercial_document_id)
    references public.commercial_documents(organization_id, project_id, id)
    on update restrict on delete restrict;
alter table public.financial_progress_entries add constraint financial_progress_project_supersedes_fk
    foreign key (organization_id, project_id, supersedes_entry_id)
    references public.financial_progress_entries(organization_id, project_id, id)
    on update restrict on delete restrict;

-- Un reversal completo sólo puede existir una vez, incluso bajo concurrencia.
create unique index cost_entries_one_reversal_uq
    on public.cost_entries (organization_id, related_cost_entry_id)
    where entry_kind = 'reversal';
create unique index cash_movements_one_reversal_uq
    on public.cash_movements (organization_id, related_movement_id)
    where movement_kind = 'reversal';
create unique index cash_allocations_one_reversal_uq
    on public.cash_allocations (organization_id, related_allocation_id)
    where entry_kind = 'reversal';

-- Cada transferencia atómica contiene como máximo una entrada y una salida.
create unique index cash_transfer_direction_uq
    on public.cash_movements (organization_id, transfer_group_id, direction)
    where movement_kind = 'transfer';

-- ============================================================================
-- 13. FUNCIONES INTERNAS DE SEGURIDAD, IDEMPOTENCIA Y AUDITORÍA
-- ============================================================================

create or replace function private.setting_uuid(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v text;
begin
    v := pg_catalog.current_setting(p_name, true);
    if v is null or v = '' then return null; end if;
    return v::uuid;
exception when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.setting_bool(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select coalesce(pg_catalog.current_setting(p_name, true), '0') = '1';
$$;

create or replace function private.assert_owner(p_organization_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if not exists (
        select 1 from public.organizations o
        where o.id = p_organization_id
          and o.owner_user_id = auth.uid()
          and o.deleted_at is null
    ) then
        raise exception 'Not authorized for organization %', p_organization_id;
    end if;
end;
$$;

create or replace function private.set_operation_context(
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid,
    p_business_action text,
    p_internal_rpc boolean default false,
    p_derived boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    perform pg_catalog.set_config('rempro.client_mutation_id', p_client_mutation_id::text, true);
    perform pg_catalog.set_config('rempro.device_id', p_device_id::text, true);
    perform pg_catalog.set_config('rempro.request_id', p_request_id::text, true);
    perform pg_catalog.set_config('rempro.business_action', coalesce(p_business_action,'operation'), true);
    perform pg_catalog.set_config('rempro.internal_rpc', case when p_internal_rpc then '1' else '0' end, true);
    perform pg_catalog.set_config('rempro.derived', case when p_derived then '1' else '0' end, true);
end;
$$;


create or replace function private.payload_fingerprint(p_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
    select pg_catalog.encode(
        pg_catalog.sha256(
            pg_catalog.convert_to(coalesce(p_payload,'null'::jsonb)::text,'UTF8')
        ),
        'hex'
    );
$$;

create or replace function private.get_sync_mutation_result(
    p_organization_id uuid,
    p_client_mutation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    select result_ref
      into v_result
      from public.sync_mutations
     where organization_id=p_organization_id
       and client_mutation_id=p_client_mutation_id;
    if not found then
        raise exception 'sync mutation not found';
    end if;
    return v_result;
end;
$$;

create or replace function private.reserve_sync_mutation(
    p_organization_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid,
    p_operation text,
    p_entity_type text,
    p_entity_id uuid,
    p_expected_version bigint,
    p_resulting_version bigint,
    p_result_ref jsonb,
    p_input_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_existing public.sync_mutations%rowtype;
    v_fingerprint text;
begin
    perform private.assert_owner(p_organization_id);
    if p_input_payload is null then
        raise exception 'input payload is required for idempotent mutation';
    end if;
    v_fingerprint := private.payload_fingerprint(p_input_payload);

    begin
        insert into public.sync_mutations (
            organization_id, client_mutation_id, device_id, request_id,
            actor_user_id, operation, entity_type, entity_id, input_fingerprint,
            expected_version, resulting_version, result_ref
        ) values (
            p_organization_id, p_client_mutation_id, p_device_id, p_request_id,
            auth.uid(), p_operation, p_entity_type, p_entity_id, v_fingerprint,
            p_expected_version, p_resulting_version, p_result_ref
        );
        return true;
    exception when unique_violation then
        select * into v_existing
          from public.sync_mutations
         where organization_id = p_organization_id
           and client_mutation_id = p_client_mutation_id;

        if v_existing.entity_type = p_entity_type
           and v_existing.entity_id is not distinct from p_entity_id
           and v_existing.operation = p_operation
           and v_existing.input_fingerprint = v_fingerprint then
            return false;
        end if;

        raise exception
            'client_mutation_id % reused with a different payload/operation/entity',
            p_client_mutation_id;
    end;
end;
$$;

-- Direct INSERTs reserve a mutation unless they are children of an already
-- reserved RPC operation.
create or replace function private.register_insert_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_request uuid;
    v_reserved boolean;
    v_row jsonb := pg_catalog.to_jsonb(new);
    v_entity_id uuid;
    v_result_version bigint;
    v_input_payload jsonb;
    v_fingerprint text;
    v_existing public.sync_mutations%rowtype;
begin
    if private.setting_bool('rempro.internal_rpc') then
        return new;
    end if;

    if new.client_mutation_id is null or new.device_id is null then
        raise exception 'client_mutation_id and device_id are required';
    end if;

    v_entity_id := coalesce(
        nullif(v_row->>'id','')::uuid,
        nullif(v_row->>'commercial_document_line_id','')::uuid,
        nullif(v_row->>'commercial_document_id','')::uuid
    );
    v_result_version := case when v_row ? 'version' then nullif(v_row->>'version','')::bigint else null end;
    v_request := gen_random_uuid();

    -- Exclude server-maintained/sync metadata from the semantic payload.
    v_input_payload := v_row - array[
        'client_mutation_id','device_id',
        'created_at','created_by','updated_at','updated_by','version'
    ]::text[];
    v_fingerprint := private.payload_fingerprint(v_input_payload);

    if tg_table_name = 'organizations' then
        if new.owner_user_id <> auth.uid() then
            raise exception 'Organization owner must be auth.uid()';
        end if;
        begin
            insert into public.sync_mutations(
                organization_id,client_mutation_id,device_id,request_id,actor_user_id,
                operation,entity_type,entity_id,input_fingerprint,resulting_version,result_ref
            ) values (
                new.id,new.client_mutation_id,new.device_id,v_request,auth.uid(),
                'insert',tg_table_name,new.id,v_fingerprint,v_result_version,
                pg_catalog.jsonb_build_object('id',new.id)
            );
            v_reserved := true;
        exception when unique_violation then
            select * into v_existing
              from public.sync_mutations
             where organization_id=new.id
               and client_mutation_id=new.client_mutation_id;

            if v_existing.entity_type=tg_table_name
               and v_existing.entity_id is not distinct from new.id
               and v_existing.operation='insert'
               and v_existing.input_fingerprint=v_fingerprint then
                v_reserved := false;
            else
                raise exception
                    'client_mutation_id % reused with a different organization payload',
                    new.client_mutation_id;
            end if;
        end;
    else
        v_reserved := private.reserve_sync_mutation(
            new.organization_id,new.client_mutation_id,new.device_id,v_request,
            'insert',tg_table_name,v_entity_id,null,v_result_version,
            pg_catalog.jsonb_build_object('id',v_entity_id),
            v_input_payload
        );
    end if;

    if not v_reserved then
        return null;
    end if;
    perform private.set_operation_context(
        new.client_mutation_id,new.device_id,v_request,'insert',false,false
    );
    return new;
end;
$$;

-- Real UPDATE idempotency: each update mutation receives its own immutable
-- sync_mutations row. The entity only keeps the most recent mutation for trace.
create or replace function private.before_versioned_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_mutation uuid;
    v_device uuid;
    v_request uuid;
    v_operation text;
    v_reserved boolean;
    v_old jsonb := pg_catalog.to_jsonb(old);
    v_new jsonb := pg_catalog.to_jsonb(new);
    v_entity_id uuid;
    v_org uuid;
    v_input_payload jsonb;
    v_expected_version bigint;
begin
    -- Historical creation provenance is immutable in every versioned entity.
    if new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by then
        raise exception 'created_at and created_by are immutable on %',tg_table_name;
    end if;

    v_entity_id := coalesce(
        nullif(v_new->>'id','')::uuid,
        nullif(v_new->>'commercial_document_line_id','')::uuid,
        nullif(v_new->>'commercial_document_id','')::uuid
    );
    v_org := case when tg_table_name='organizations'
                  then nullif(v_new->>'id','')::uuid
                  else nullif(v_new->>'organization_id','')::uuid end;

    if private.setting_bool('rempro.derived') then
        new.client_mutation_id := old.client_mutation_id;
        new.device_id := old.device_id;
        new.created_at := old.created_at;
        new.created_by := old.created_by;
        new.updated_at := pg_catalog.now();
        new.updated_by := coalesce(auth.uid(),old.updated_by);
        new.version := old.version + 1;
        return new;
    end if;

    v_mutation := new.client_mutation_id;
    v_device := new.device_id;
    v_expected_version := new.version;

    if v_mutation is null or v_device is null then
        raise exception 'Every update requires client_mutation_id and device_id';
    end if;

    v_operation:=case
        when (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null
        then 'soft_delete'
        else 'update'
    end;
    v_request:=gen_random_uuid();

    -- The fingerprint uses the version expected by the ORIGINAL request.
    -- Therefore the same network retry is recognized before the current row
    -- version is tested, while a reused mutation id with a different payload
    -- raises an idempotency error.
    v_input_payload := pg_catalog.jsonb_build_object(
        'expected_version',v_expected_version,
        'row',v_new - array[
            'client_mutation_id','device_id',
            'created_at','created_by','updated_at','updated_by','version'
        ]::text[]
    );

    v_reserved:=private.reserve_sync_mutation(
        v_org,v_mutation,v_device,v_request,v_operation,tg_table_name,v_entity_id,
        v_expected_version,v_expected_version+1,
        pg_catalog.jsonb_build_object('id',v_entity_id,'version',v_expected_version+1),
        v_input_payload
    );
    if not v_reserved then
        -- Semantic retry of the exact same UPDATE: cancel the duplicate write.
        return null;
    end if;

    if v_expected_version<>old.version then
        -- The reservation is part of this transaction, so the exception rolls
        -- it back together with the conflicting UPDATE.
        raise exception
            'Optimistic concurrency conflict on %. Expected version %, got %',
            tg_table_name,v_expected_version,old.version;
    end if;

    perform private.set_operation_context(
        v_mutation,v_device,v_request,v_operation,false,false
    );
    new.created_at:=old.created_at;
    new.created_by:=old.created_by;
    new.updated_at:=pg_catalog.now();
    new.updated_by:=auth.uid();
    new.version:=old.version+1;
    return new;
end;
$$;

create or replace function private.guard_immutable_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    i integer;
    v_old jsonb := pg_catalog.to_jsonb(old);
    v_new jsonb := pg_catalog.to_jsonb(new);
begin
    for i in 0..tg_nargs-1 loop
        if (v_old -> tg_argv[i]) is distinct from (v_new -> tg_argv[i]) then
            raise exception 'Column % is immutable on %', tg_argv[i], tg_table_name;
        end if;
    end loop;
    return new;
end;
$$;

create or replace function private.prevent_update_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    raise exception '% is append-only; corrections require a new event/reversal', tg_table_name;
end;
$$;

-- Audit always prefers the operation context. This is essential for derived
-- header/tax changes caused by a single user mutation.
create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_old jsonb;
    v_new jsonb;
    v_row jsonb;
    v_org uuid;
    v_project uuid;
    v_record_id uuid;
    v_mutation uuid;
    v_device uuid;
    v_request uuid;
    v_action text;
    v_changed text[];
begin
    v_old := case when tg_op in ('UPDATE','DELETE') then pg_catalog.to_jsonb(old) else null end;
    v_new := case when tg_op in ('INSERT','UPDATE') then pg_catalog.to_jsonb(new) else null end;
    v_row := coalesce(v_new, v_old);

    v_org := case when tg_table_name='organizations'
                  then nullif(v_row->>'id','')::uuid
                  else nullif(v_row->>'organization_id','')::uuid end;
    v_project := nullif(v_row->>'project_id','')::uuid;
    v_record_id := coalesce(
        nullif(v_row->>'id','')::uuid,
        nullif(v_row->>'commercial_document_line_id','')::uuid,
        nullif(v_row->>'commercial_document_id','')::uuid
    );
    v_mutation := coalesce(private.setting_uuid('rempro.client_mutation_id'), nullif(v_row->>'client_mutation_id','')::uuid);
    v_device := coalesce(private.setting_uuid('rempro.device_id'), nullif(v_row->>'device_id','')::uuid);
    v_request := coalesce(private.setting_uuid('rempro.request_id'), gen_random_uuid());
    v_action := coalesce(nullif(pg_catalog.current_setting('rempro.business_action', true),''), lower(tg_op));

    if tg_op = 'UPDATE' then
        select pg_catalog.array_agg(key order by key)
          into v_changed
          from pg_catalog.jsonb_each(v_new)
         where (v_old -> key) is distinct from value;
    end if;

    if v_org is not null then
        insert into public.audit_log (
            organization_id, project_id, actor_user_id, occurred_at,
            schema_name, table_name, record_id, record_pk,
            action, business_action, old_data, new_data, changed_fields,
            request_id, client_mutation_id, device_id, source, db_txid
        ) values (
            v_org, v_project, auth.uid(), pg_catalog.now(),
            tg_table_schema, tg_table_name, v_record_id,
            pg_catalog.jsonb_build_object('id', v_record_id),
            lower(tg_op), v_action, v_old, v_new, v_changed,
            v_request, v_mutation, v_device,
            case when private.setting_bool('rempro.internal_rpc') then 'rpc' else 'client' end,
            pg_catalog.txid_current()
        );
    end if;

    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

-- auth.users -> profiles. The frontend never inserts its own profile.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    insert into public.profiles (id, display_name, active)
    values (
        new.id,
        coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(new.email,''), 'Fernando Díaz Flores'),
        true
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create or replace function private.touch_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    new.id := old.id;
    new.active := old.active;
    new.created_at := old.created_at;
    new.updated_at := pg_catalog.now();
    return new;
end;
$$;

-- ============================================================================
-- 14. VALIDACIÓN TRANSACCIONAL DE WORK PACKAGES
-- ============================================================================

create or replace function private.validate_work_package_weights()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_org uuid;
    v_project uuid;
    v_count integer;
    v_total numeric(12,4);
begin
    if tg_op='DELETE' then
        v_org:=old.organization_id; v_project:=old.project_id;
    else
        v_org:=new.organization_id; v_project:=new.project_id;
    end if;
    select count(*), coalesce(sum(weight_pct),0)
      into v_count, v_total
      from public.project_work_packages
     where organization_id = v_org
       and project_id = v_project
       and active = true
       and deleted_at is null;

    if v_count > 0 and v_total <> 100.0000 then
        raise exception 'Active work package weights for project % must total 100%%; current total=%',
            v_project, v_total;
    end if;
    return null;
end;
$$;

-- ============================================================================
-- 15. DOCUMENTOS COMERCIALES: ESTADO, CÁLCULOS Y PRESENTACIÓN GUILLERMO
-- ============================================================================

create or replace function private.guard_commercial_document_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if new.status <> 'draft' then
        raise exception 'Commercial documents must be created as draft';
    end if;
    return new;
end;
$$;

create or replace function private.guard_commercial_document_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if new.organization_id <> old.organization_id or new.project_id <> old.project_id
       or new.folio <> old.folio or new.revision_no <> old.revision_no
       or new.supersedes_document_id is distinct from old.supersedes_document_id then
        raise exception 'Document identity / parent keys are immutable';
    end if;

    if new.status is distinct from old.status and not private.setting_bool('rempro.state_rpc') then
        raise exception 'Document state transitions require rpc_transition_commercial_document';
    end if;

    if old.status <> 'draft' and not private.setting_bool('rempro.state_rpc') then
        raise exception 'Non-draft commercial documents cannot be updated directly';
    end if;

    if old.status <> 'draft' and (
        new.client_id is distinct from old.client_id
        or new.document_type_id is distinct from old.document_type_id
        or new.issue_date is distinct from old.issue_date
        or new.valid_until is distinct from old.valid_until
        or new.subtotal_mxn is distinct from old.subtotal_mxn
        or new.discount_mxn is distinct from old.discount_mxn
        or new.tax_mxn is distinct from old.tax_mxn
        or new.amount_mxn is distinct from old.amount_mxn
    ) then
        raise exception 'Issued/approved/rejected/cancelled/superseded document is economically immutable';
    end if;
    return new;
end;
$$;

create or replace function private.assert_document_draft_by_id(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_status text;
begin
    select status into v_status from public.commercial_documents where id = p_document_id;
    if v_status is distinct from 'draft' then
        raise exception 'Commercial document % is immutable because status=%', p_document_id, v_status;
    end if;
end;
$$;

create or replace function private.assert_document_child_is_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_document_id uuid; v_parent_id uuid;
begin
    if tg_table_name = 'commercial_document_lines' then
        v_document_id := case when tg_op='DELETE' then old.commercial_document_id else new.commercial_document_id end;
    elsif tg_table_name = 'commercial_document_presentations' then
        v_document_id := case when tg_op='DELETE' then old.commercial_document_id else new.commercial_document_id end;
    elsif tg_table_name = 'commercial_line_taxes' then
        v_parent_id := case when tg_op='DELETE' then old.commercial_document_line_id else new.commercial_document_line_id end;
        select l.commercial_document_id into v_document_id from public.commercial_document_lines l where l.id=v_parent_id;
    elsif tg_table_name = 'commercial_line_pricing' then
        v_parent_id := case when tg_op='DELETE' then old.commercial_document_line_id else new.commercial_document_line_id end;
        select l.commercial_document_id into v_document_id from public.commercial_document_lines l where l.id=v_parent_id;
    end if;
    perform private.assert_document_draft_by_id(v_document_id);
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create or replace function private.normalize_commercial_line_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_base numeric(18,2); v_rate numeric(9,4);
begin
    select round(l.subtotal_mxn - l.discount_mxn,2)
      into v_base
      from public.commercial_document_lines l
     where l.organization_id = new.organization_id
       and l.project_id = new.project_id
       and l.id = new.commercial_document_line_id;
    if not found then raise exception 'Commercial line not found'; end if;
    select tr.rate_pct into v_rate from public.tax_rates tr
     where tr.organization_id=new.organization_id and tr.id=new.tax_rate_id;
    if not found then raise exception 'Tax rate not found'; end if;

    new.rate_snapshot := v_rate;
    new.taxable_base_mxn := v_base;
    new.tax_amount_mxn := round(v_base * v_rate / 100.0, 2);
    return new;
end;
$$;

create or replace function private.validate_commercial_line_pricing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_line_net numeric(18,4);
begin
    select round(l.subtotal_mxn - l.discount_mxn,4)
      into v_line_net
      from public.commercial_document_lines l
     where l.organization_id = new.organization_id
       and l.project_id = new.project_id
       and l.id = new.commercial_document_line_id;
    if not found then raise exception 'Commercial line not found'; end if;

    -- All pricing amounts are TOTALS for the complete commercial line, not unit values.
    if new.commercial_net_mxn <> v_line_net then
        raise exception 'commercial_line_pricing.commercial_net_mxn must equal the line commercial net total';
    end if;
    if new.commercial_net_mxn <> round(
        new.direct_cost_mxn + new.indirect_amount_mxn + new.risk_amount_mxn + new.profit_amount_mxn, 4
    ) then
        raise exception 'Pricing components do not reconcile with the line commercial net total';
    end if;
    return new;
end;
$$;

create or replace function private.recalculate_commercial_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_prev_derived text := current_setting('rempro.derived', true);
    v_subtotal numeric(18,2);
    v_discount numeric(18,2);
    v_tax numeric(18,2);
begin
    perform set_config('rempro.derived', '1', true);

    select
        coalesce(sum(l.subtotal_mxn),0),
        coalesce(sum(l.discount_mxn),0)
    into v_subtotal, v_discount
    from public.commercial_document_lines l
    where l.commercial_document_id = p_document_id;

    select coalesce(sum(t.tax_amount_mxn),0)
      into v_tax
      from public.commercial_line_taxes t
      join public.commercial_document_lines l
        on l.id = t.commercial_document_line_id
     where l.commercial_document_id = p_document_id;

    update public.commercial_documents
       set subtotal_mxn = round(v_subtotal,2),
           discount_mxn = round(v_discount,2),
           tax_mxn = round(v_tax,2),
           amount_mxn = round(v_subtotal - v_discount + v_tax,2)
     where id = p_document_id
       and status = 'draft';

    perform set_config('rempro.derived', coalesce(v_prev_derived,''), true);
exception
    when others then
        perform set_config('rempro.derived', coalesce(v_prev_derived,''), true);
        raise;
end;
$$;

-- If line economics change, taxes are recalculated and internal pricing is
-- invalidated; stale pricing is never left attached to a changed commercial line.
create or replace function private.after_commercial_line_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_prev_derived text := current_setting('rempro.derived', true);
    v_prev_line_recalc text := current_setting('rempro.line_recalc', true);
    v_document_id uuid;
    v_line_id uuid;
begin
    if coalesce(current_setting('rempro.line_recalc', true), '') = '1' then
        return coalesce(new, old);
    end if;

    perform set_config('rempro.line_recalc', '1', true);
    perform set_config('rempro.derived', '1', true);

    v_line_id := coalesce(new.id, old.id);
    v_document_id := coalesce(new.commercial_document_id, old.commercial_document_id);

    -- Taxes are derived from the current line net amount.
    if tg_op <> 'DELETE' then
        update public.commercial_line_taxes t
           set taxable_base_mxn = round(new.subtotal_mxn - new.discount_mxn, 2),
               tax_amount_mxn = round(
                   (new.subtotal_mxn - new.discount_mxn) * t.rate_snapshot / 100.0, 2
               )
         where t.commercial_document_line_id = v_line_id;

        -- Pricing becomes stale whenever commercial line economics change.
        delete from public.commercial_line_pricing p
         where p.commercial_document_line_id = v_line_id;
    end if;

    perform private.recalculate_commercial_document(v_document_id);

    perform set_config('rempro.line_recalc', coalesce(v_prev_line_recalc,''), true);
    perform set_config('rempro.derived', coalesce(v_prev_derived,''), true);

    return coalesce(new, old);
exception
    when others then
        perform set_config('rempro.line_recalc', coalesce(v_prev_line_recalc,''), true);
        perform set_config('rempro.derived', coalesce(v_prev_derived,''), true);
        raise;
end;
$$;

create or replace function private.after_commercial_tax_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_line_id uuid; v_document_id uuid;
begin
    v_line_id := case when tg_op='DELETE' then old.commercial_document_line_id else new.commercial_document_line_id end;
    select commercial_document_id into v_document_id from public.commercial_document_lines where id = v_line_id;
    if v_document_id is not null and not private.setting_bool('rempro.line_recalc') then
        perform private.recalculate_commercial_document(v_document_id);
    end if;
    return null;
end;
$$;

create or replace function public.rpc_transition_commercial_document(
    p_organization_id uuid,
    p_document_id uuid,
    p_to_status text,
    p_reason text,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns public.commercial_documents
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_doc public.commercial_documents%rowtype;
    v_reserved boolean;
    v_active_alloc numeric(18,2);
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    v_reserved := private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'state_transition','commercial_documents',p_document_id,null,null,
        pg_catalog.jsonb_build_object('id',p_document_id,'to_status',p_to_status),
        pg_catalog.jsonb_build_object(
            'document_id',p_document_id,'to_status',p_to_status,'reason',p_reason
        )
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_doc
          from public.commercial_documents
         where organization_id=p_organization_id
           and id=(v_result->>'id')::uuid;
        return v_doc;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'state_transition',true,true);
    select * into v_doc from public.commercial_documents
     where organization_id=p_organization_id and id=p_document_id for update;
    if not found then raise exception 'Document not found'; end if;

    if not (
        (v_doc.status='draft' and p_to_status in ('issued','cancelled'))
        or (v_doc.status='issued' and p_to_status in ('approved','rejected','cancelled','superseded'))
        or (v_doc.status='approved' and p_to_status in ('cancelled','superseded'))
    ) then
        raise exception 'Invalid document transition % -> %', v_doc.status, p_to_status;
    end if;

    if p_to_status in ('issued','approved') then
        if not exists (select 1 from public.commercial_document_lines where commercial_document_id=p_document_id) then
            raise exception 'Document requires at least one line';
        end if;
        if not exists (select 1 from public.commercial_document_presentations where commercial_document_id=p_document_id) then
            raise exception 'Document requires a presentation snapshot before issue/approval';
        end if;
        perform private.recalculate_commercial_document(p_document_id);
    end if;

    if p_to_status in ('rejected','cancelled','superseded') then
        select coalesce(sum(case when a.effect='increase' then a.amount_mxn else -a.amount_mxn end),0)
          into v_active_alloc
          from public.cash_allocations a
         where a.commercial_document_id=p_document_id;
        if v_active_alloc <> 0 then
            raise exception 'Reverse/reassign active allocations before % document', p_to_status;
        end if;
    end if;

    perform pg_catalog.set_config('rempro.state_rpc','1',true);
    update public.commercial_documents
       set status=p_to_status,
           issue_date=case when p_to_status='issued' then coalesce(issue_date,current_date) else issue_date end,
           client_mutation_id=p_client_mutation_id,
           device_id=p_device_id
     where id=p_document_id
     returning * into v_doc;
    perform pg_catalog.set_config('rempro.state_rpc','0',true);

    insert into public.commercial_document_events(
        organization_id,project_id,commercial_document_id,event_type,reason,occurred_at,
        client_mutation_id,device_id
    ) values (
        v_doc.organization_id,v_doc.project_id,v_doc.id,p_to_status,p_reason,pg_catalog.now(),
        gen_random_uuid(),p_device_id
    );
    return v_doc;
end;
$$;

-- ============================================================================
-- 16. COSTOS: CONSISTENCIA FISCAL Y REVERSALS
-- ============================================================================

create or replace function private.normalize_cost_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_rate numeric(9,4); v_kind text;
begin
    select c.entry_kind into v_kind from public.cost_entries c
     where c.organization_id=new.organization_id and c.id=new.cost_entry_id;
    if private.setting_bool('rempro.internal_rpc') and v_kind='reversal' then
        return new; -- exact historical tax snapshot is copied from the original
    end if;
    select tr.rate_pct into v_rate from public.tax_rates tr
     where tr.organization_id=new.organization_id and tr.id=new.tax_rate_id;
    if not found then raise exception 'Tax rate not found'; end if;
    new.rate_snapshot:=v_rate;
    new.tax_amount_mxn:=round(new.taxable_base_mxn*v_rate/100.0,2);
    return new;
end;
$$;

create or replace function private.normalize_price_history_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_rate numeric(9,4);
begin
    if new.tax_rate_id is null then
        new.tax_rate_snapshot:=null;
        new.tax_amount_mxn:=0;
    else
        select tr.rate_pct into v_rate from public.tax_rates tr
         where tr.organization_id=new.organization_id and tr.id=new.tax_rate_id;
        if not found then raise exception 'Tax rate not found'; end if;
        new.tax_rate_snapshot:=v_rate;
        new.tax_amount_mxn:=round(new.unit_price_net_mxn*v_rate/100.0,4);
    end if;
    return new;
end;
$$;

create or replace function private.validate_cost_tax_total()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_cost_id uuid; v_header numeric(18,2); v_detail numeric(18,2);
begin
    if tg_table_name='cost_entries' then
        if tg_op='DELETE' then
            v_cost_id := old.id;
        else
            v_cost_id := new.id;
        end if;
    elsif tg_table_name='cost_entry_taxes' then
        if tg_op='DELETE' then
            v_cost_id := old.cost_entry_id;
        else
            v_cost_id := new.cost_entry_id;
        end if;
    else
        raise exception 'Unexpected table % for validate_cost_tax_total()',tg_table_name;
    end if;

    select tax_amount_mxn into v_header from public.cost_entries where id=v_cost_id;
    if not found then return null; end if;
    select coalesce(sum(tax_amount_mxn),0) into v_detail from public.cost_entry_taxes where cost_entry_id=v_cost_id;
    if v_header <> round(v_detail,2) then
        raise exception 'Cost header tax % differs from tax detail %',v_header,v_detail;
    end if;
    return null;
end;
$$;

create or replace function private.guard_cost_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_related_kind text;
begin
    if new.entry_kind='reversal' and not private.setting_bool('rempro.internal_rpc') then
        raise exception 'Cost reversals must use rpc_reverse_cost_entry';
    end if;
    if new.related_cost_entry_id is not null then
        select entry_kind into v_related_kind from public.cost_entries
         where organization_id=new.organization_id and id=new.related_cost_entry_id;
        if not found then raise exception 'Related cost entry not found'; end if;
        if v_related_kind='reversal' then raise exception 'A reversal cannot be adjusted/reversed again'; end if;
    end if;
    return new;
end;
$$;

create or replace function public.rpc_reverse_cost_entry(
    p_organization_id uuid,
    p_original_cost_entry_id uuid,
    p_reversal_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_reason text,
    p_request_id uuid default gen_random_uuid()
)
returns public.cost_entries
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_original public.cost_entries%rowtype;
    v_reversal public.cost_entries%rowtype;
    v_reserved boolean;
    v_alloc numeric(18,2);
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    v_reserved := private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'reversal','cost_entries',p_original_cost_entry_id,null,null,
        pg_catalog.jsonb_build_object('reversal_id',p_reversal_id),
        pg_catalog.jsonb_build_object(
            'original_cost_entry_id',p_original_cost_entry_id,
            'reversal_id',p_reversal_id,
            'reason',p_reason
        )
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_reversal
          from public.cost_entries
         where organization_id=p_organization_id
           and id=(v_result->>'reversal_id')::uuid;
        return v_reversal;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'cost_reversal',true,false);
    select * into v_original from public.cost_entries
     where organization_id=p_organization_id and id=p_original_cost_entry_id for update;
    if not found then raise exception 'Original cost entry not found'; end if;
    if v_original.entry_kind='reversal' then raise exception 'Cannot reverse a reversal'; end if;

    select coalesce(sum(case when effect='increase' then amount_mxn else -amount_mxn end),0)
      into v_alloc from public.cash_allocations where cost_entry_id=v_original.id;
    if v_alloc <> 0 then raise exception 'Reverse related cash allocations before reversing cost'; end if;

    insert into public.cost_entries(
        id,organization_id,project_id,supplier_id,cost_category_id,work_package_id,
        incurred_date,description,cost_class,entry_kind,effect,related_cost_entry_id,
        quantity,unit_id,unit_cost_mxn,net_amount_mxn,tax_amount_mxn,source_reference,
        client_mutation_id,device_id
    ) values (
        p_reversal_id,v_original.organization_id,v_original.project_id,v_original.supplier_id,
        v_original.cost_category_id,v_original.work_package_id,current_date,
        'REVERSAL: '||v_original.description||' — '||coalesce(p_reason,''),v_original.cost_class,
        'reversal',case when v_original.effect='increase' then 'decrease' else 'increase' end,v_original.id,
        v_original.quantity,v_original.unit_id,v_original.unit_cost_mxn,
        v_original.net_amount_mxn,v_original.tax_amount_mxn,v_original.source_reference,
        gen_random_uuid(),p_device_id
    ) returning * into v_reversal;

    insert into public.cost_entry_taxes(
        organization_id,project_id,cost_entry_id,tax_rate_id,taxable_base_mxn,rate_snapshot,tax_amount_mxn,
        client_mutation_id,device_id
    )
    select t.organization_id,t.project_id,p_reversal_id,t.tax_rate_id,t.taxable_base_mxn,t.rate_snapshot,t.tax_amount_mxn,
           gen_random_uuid(),p_device_id
      from public.cost_entry_taxes t
     where t.cost_entry_id=v_original.id;

    return v_reversal;
end;
$$;

-- ============================================================================
-- 17. CASH MOVEMENTS, TRANSFERS Y ALLOCATIONS
-- ============================================================================

create or replace function private.guard_cash_movement_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_related public.cash_movements%rowtype;
    v_action text;
begin
    v_action:=pg_catalog.current_setting('rempro.business_action',true);

    -- Transfer and reversal rows are compound financial events and only their
    -- controlled RPCs may create them.
    if new.movement_kind in ('reversal','transfer')
       and not private.setting_bool('rempro.internal_rpc') then
        raise exception '% movements must be created through their RPC',new.movement_kind;
    end if;

    if new.movement_kind='receipt' and new.direction<>'inflow' then
        raise exception 'receipt must be an inflow';
    end if;
    if new.movement_kind='payment' and new.direction<>'outflow' then
        raise exception 'payment must be an outflow';
    end if;

    if new.related_movement_id is not null then
        select * into v_related
          from public.cash_movements
         where organization_id=new.organization_id
           and id=new.related_movement_id
         for share;

        if not found then
            raise exception 'Related cash movement not found';
        end if;

        -- MATCH SIMPLE on the composite FK does not protect NULL project_id.
        if new.project_id is distinct from v_related.project_id then
            raise exception 'Related cash movement must have the same project, including NULL';
        end if;

        if new.cash_account_id<>v_related.cash_account_id then
            raise exception 'Related cash movement must use the same cash account';
        end if;
        if new.direction<>v_related.direction then
            raise exception 'Related cash movement must preserve original direction';
        end if;

        if new.movement_kind='adjustment' then
            if v_related.movement_kind not in ('receipt','payment') then
                raise exception 'Adjustment may only relate directly to a receipt or payment';
            end if;
            if new.client_id is distinct from v_related.client_id
               or new.supplier_id is distinct from v_related.supplier_id then
                raise exception 'Adjustment must preserve original counterparty';
            end if;
        elsif new.movement_kind='reversal' then
            if v_related.movement_kind='reversal' then
                raise exception 'A reversal cannot reverse another reversal';
            end if;
            if v_related.movement_kind='transfer'
               and v_action is distinct from 'transfer_reversal' then
                raise exception 'Transfer legs may only be reversed by rpc_reverse_transfer';
            end if;
            if new.effect<>'decrease' or new.amount_mxn<>v_related.amount_mxn then
                raise exception 'Reversal must preserve amount and use effect=decrease';
            end if;
        end if;
    end if;

    return new;
end;
$$;

create or replace function private.validate_transfer_group()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_org uuid;
    v_group uuid;
    v_count int; v_in int; v_out int; v_min numeric(18,2); v_max numeric(18,2); v_accounts int; v_effects int;
    v_projects uuid[];
begin
    if tg_op='DELETE' then
        v_org:=old.organization_id; v_group:=old.transfer_group_id;
    else
        v_org:=new.organization_id; v_group:=new.transfer_group_id;
    end if;
    if v_group is null then return null; end if;
    select count(*),
           count(*) filter(where direction='inflow'),
           count(*) filter(where direction='outflow'),
           min(amount_mxn),max(amount_mxn),count(distinct cash_account_id),
           count(*) filter(where effect='increase'),
           array_agg(project_id order by direction)
      into v_count,v_in,v_out,v_min,v_max,v_accounts,v_effects,v_projects
      from public.cash_movements
     where organization_id=v_org and transfer_group_id=v_group and movement_kind='transfer';
    if v_count<>2 or v_in<>1 or v_out<>1 or v_min<>v_max or v_accounts<>2 or v_effects<>2
       or v_projects[1] is distinct from v_projects[2] then
        raise exception 'Transfer group % must be one atomic outflow + one inflow, same amount/project, distinct accounts',v_group;
    end if;
    return null;
end;
$$;

create or replace function public.rpc_create_transfer(
    p_organization_id uuid,
    p_project_id uuid,
    p_from_account_id uuid,
    p_to_account_id uuid,
    p_amount_mxn numeric,
    p_occurred_at timestamptz,
    p_out_movement_id uuid,
    p_in_movement_id uuid,
    p_transfer_group_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_description text,
    p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_reserved boolean;
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    if p_from_account_id=p_to_account_id then raise exception 'Transfer accounts must be different'; end if;
    if p_amount_mxn<=0 then raise exception 'Transfer amount must be positive'; end if;

    v_reserved := private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'transfer','cash_movements',p_transfer_group_id,null,null,
        pg_catalog.jsonb_build_object(
            'group_id',p_transfer_group_id,'out_id',p_out_movement_id,'in_id',p_in_movement_id
        ),
        pg_catalog.jsonb_build_object(
            'project_id',p_project_id,'from_account_id',p_from_account_id,
            'to_account_id',p_to_account_id,'amount_mxn',round(p_amount_mxn,2),
            'occurred_at',p_occurred_at,'out_movement_id',p_out_movement_id,
            'in_movement_id',p_in_movement_id,'transfer_group_id',p_transfer_group_id,
            'description',p_description
        )
    );
    if not v_reserved then
        return private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'cash_transfer',true,false);
    if not exists(select 1 from public.cash_accounts where organization_id=p_organization_id and id=p_from_account_id and deleted_at is null) or
       not exists(select 1 from public.cash_accounts where organization_id=p_organization_id and id=p_to_account_id and deleted_at is null) then
        raise exception 'Transfer account not found';
    end if;

    insert into public.cash_movements(
        id,organization_id,project_id,cash_account_id,movement_kind,direction,effect,transfer_group_id,
        occurred_at,amount_mxn,description,client_mutation_id,device_id
    ) values
    (p_out_movement_id,p_organization_id,p_project_id,p_from_account_id,'transfer','outflow','increase',p_transfer_group_id,
     p_occurred_at,round(p_amount_mxn,2),p_description,gen_random_uuid(),p_device_id),
    (p_in_movement_id,p_organization_id,p_project_id,p_to_account_id,'transfer','inflow','increase',p_transfer_group_id,
     p_occurred_at,round(p_amount_mxn,2),p_description,gen_random_uuid(),p_device_id);

    return pg_catalog.jsonb_build_object('group_id',p_transfer_group_id,'out_id',p_out_movement_id,'in_id',p_in_movement_id);
end;
$$;

create or replace function public.rpc_reverse_cash_movement(
    p_organization_id uuid,
    p_original_movement_id uuid,
    p_reversal_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_reason text,
    p_request_id uuid default gen_random_uuid()
)
returns public.cash_movements
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_original public.cash_movements%rowtype;
    v_row public.cash_movements%rowtype;
    v_reserved boolean;
    v_alloc numeric(18,2);
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    v_reserved := private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'reversal','cash_movements',p_original_movement_id,null,null,
        pg_catalog.jsonb_build_object('reversal_id',p_reversal_id),
        pg_catalog.jsonb_build_object(
            'original_movement_id',p_original_movement_id,
            'reversal_id',p_reversal_id,'reason',p_reason
        )
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_row
          from public.cash_movements
         where organization_id=p_organization_id
           and id=(v_result->>'reversal_id')::uuid;
        return v_row;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'cash_reversal',true,false);
    select * into v_original from public.cash_movements
     where organization_id=p_organization_id and id=p_original_movement_id for update;
    if not found then raise exception 'Original cash movement not found'; end if;
    if v_original.movement_kind in ('reversal','transfer') then
        raise exception 'Cannot reverse this movement directly';
    end if;
    select coalesce(sum(case when effect='increase' then amount_mxn else -amount_mxn end),0)
      into v_alloc from public.cash_allocations where cash_movement_id=v_original.id;
    if v_alloc<>0 then raise exception 'Reverse allocations before reversing cash movement'; end if;

    insert into public.cash_movements(
        id,organization_id,project_id,cash_account_id,client_id,supplier_id,
        movement_kind,direction,effect,related_movement_id,payment_method_id,occurred_at,
        amount_mxn,source_amount_usd,fx_rate_mxn_per_usd,fx_rate_date,fx_source,fx_reference,
        reference,description,client_mutation_id,device_id
    ) values (
        p_reversal_id,v_original.organization_id,v_original.project_id,v_original.cash_account_id,
        v_original.client_id,v_original.supplier_id,'reversal',v_original.direction,'decrease',v_original.id,
        v_original.payment_method_id,pg_catalog.now(),v_original.amount_mxn,v_original.source_amount_usd,
        v_original.fx_rate_mxn_per_usd,v_original.fx_rate_date,v_original.fx_source,v_original.fx_reference,
        v_original.reference,'REVERSAL: '||v_original.description||' — '||coalesce(p_reason,''),gen_random_uuid(),p_device_id
    ) returning * into v_row;
    return v_row;
end;
$$;

create or replace function public.rpc_create_cash_allocation(
    p_id uuid,
    p_organization_id uuid,
    p_project_id uuid,
    p_cash_movement_id uuid,
    p_commercial_document_id uuid,
    p_cost_entry_id uuid,
    p_amount_mxn numeric,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns public.cash_allocations
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_movement public.cash_movements%rowtype;
    v_row public.cash_allocations%rowtype;
    v_reserved boolean;
    v_used numeric(18,2);
    v_target_used numeric(18,2);
    v_target_amount numeric(18,2);
    v_doc_effect text;
    v_doc_receivable boolean;
    v_doc_status text;
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    v_reserved := private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'allocation','cash_allocations',p_id,null,null,
        pg_catalog.jsonb_build_object('allocation_id',p_id),
        pg_catalog.jsonb_build_object(
            'id',p_id,'project_id',p_project_id,'cash_movement_id',p_cash_movement_id,
            'commercial_document_id',p_commercial_document_id,'cost_entry_id',p_cost_entry_id,
            'amount_mxn',round(p_amount_mxn,2)
        )
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_row
          from public.cash_allocations
         where organization_id=p_organization_id
           and id=(v_result->>'allocation_id')::uuid;
        return v_row;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'cash_allocation',true,false);
    if pg_catalog.num_nonnulls(p_commercial_document_id,p_cost_entry_id)<>1 then
        raise exception 'Allocation must target exactly one document or cost entry';
    end if;

    select * into v_movement from public.cash_movements
     where organization_id=p_organization_id and project_id=p_project_id and id=p_cash_movement_id for update;
    if not found then raise exception 'Cash movement not found in project'; end if;
    if v_movement.effect<>'increase' or v_movement.movement_kind in ('transfer','reversal') then
        raise exception 'Movement is not allocatable';
    end if;

    select coalesce(sum(case when effect='increase' then amount_mxn else -amount_mxn end),0)
      into v_used from public.cash_allocations
     where organization_id=p_organization_id and cash_movement_id=p_cash_movement_id;
    if p_amount_mxn<=0 or v_used+round(p_amount_mxn,2)>v_movement.amount_mxn then
        raise exception 'Allocation exceeds available movement amount';
    end if;

    if p_commercial_document_id is not null then
        select d.amount_mxn,d.status,dt.effect,dt.affects_receivable
          into v_target_amount,v_doc_status,v_doc_effect,v_doc_receivable
          from public.commercial_documents d
          join public.document_types dt on dt.organization_id=d.organization_id and dt.id=d.document_type_id
         where d.organization_id=p_organization_id and d.project_id=p_project_id and d.id=p_commercial_document_id
         for update of d;
        if not found then raise exception 'Commercial document not found'; end if;
        if v_movement.direction<>'inflow' or not v_doc_receivable or v_doc_effect<>'increase' or v_doc_status not in ('issued','approved') then
            raise exception 'Commercial document is not eligible for receipt allocation';
        end if;
        select coalesce(sum(case when effect='increase' then amount_mxn else -amount_mxn end),0)
          into v_target_used from public.cash_allocations
         where commercial_document_id=p_commercial_document_id;
    else
        select c.amount_mxn into v_target_amount from public.cost_entries c
         where c.organization_id=p_organization_id and c.project_id=p_project_id and c.id=p_cost_entry_id and c.effect='increase'
         for update;
        if not found then raise exception 'Cost entry not found/eligible'; end if;
        if v_movement.direction<>'outflow' then raise exception 'Cost allocations require an outflow'; end if;
        select coalesce(sum(case when effect='increase' then amount_mxn else -amount_mxn end),0)
          into v_target_used from public.cash_allocations where cost_entry_id=p_cost_entry_id;
    end if;

    if v_target_used+round(p_amount_mxn,2)>v_target_amount then
        raise exception 'Allocation exceeds target outstanding amount';
    end if;

    insert into public.cash_allocations(
        id,organization_id,project_id,cash_movement_id,commercial_document_id,cost_entry_id,
        entry_kind,effect,amount_mxn,client_mutation_id,device_id
    ) values (
        p_id,p_organization_id,p_project_id,p_cash_movement_id,p_commercial_document_id,p_cost_entry_id,
        'original','increase',round(p_amount_mxn,2),gen_random_uuid(),p_device_id
    ) returning * into v_row;
    return v_row;
end;
$$;

create or replace function public.rpc_reverse_cash_allocation(
    p_organization_id uuid,
    p_original_allocation_id uuid,
    p_reversal_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns public.cash_allocations
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_original public.cash_allocations%rowtype;
    v_row public.cash_allocations%rowtype;
    v_reserved boolean;
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    -- Mutation is checked/reserved BEFORE checking whether the original was
    -- already reversed. A network retry therefore returns its existing result.
    v_reserved := private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'reversal','cash_allocations',p_original_allocation_id,null,null,
        pg_catalog.jsonb_build_object('reversal_id',p_reversal_id),
        pg_catalog.jsonb_build_object(
            'original_allocation_id',p_original_allocation_id,
            'reversal_id',p_reversal_id
        )
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_row
          from public.cash_allocations
         where organization_id=p_organization_id
           and id=(v_result->>'reversal_id')::uuid;
        return v_row;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'allocation_reversal',true,false);
    select * into v_original from public.cash_allocations
     where organization_id=p_organization_id and id=p_original_allocation_id for update;
    if not found then raise exception 'Original allocation not found'; end if;
    if v_original.entry_kind='reversal' then raise exception 'Cannot reverse a reversal'; end if;

    insert into public.cash_allocations(
        id,organization_id,project_id,cash_movement_id,commercial_document_id,cost_entry_id,
        entry_kind,effect,related_allocation_id,amount_mxn,client_mutation_id,device_id
    ) values (
        p_reversal_id,v_original.organization_id,v_original.project_id,v_original.cash_movement_id,
        v_original.commercial_document_id,v_original.cost_entry_id,'reversal','decrease',v_original.id,
        v_original.amount_mxn,gen_random_uuid(),p_device_id
    ) returning * into v_row;
    return v_row;
end;
$$;

-- ============================================================================
-- 18. APU: CÁLCULO, TAX BASE E INMUTABILIDAD
-- ============================================================================

create or replace function private.guard_apu_revision_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if new.status<>'draft' then raise exception 'APU revisions must be created as draft'; end if;
    return new;
end;
$$;

create or replace function private.guard_apu_revision_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if new.organization_id<>old.organization_id or new.apu_id<>old.apu_id or new.revision_no<>old.revision_no then
        raise exception 'APU revision identity is immutable';
    end if;
    if new.status is distinct from old.status and not private.setting_bool('rempro.state_rpc') then
        raise exception 'APU state transitions require rpc_transition_apu_revision';
    end if;
    if old.status<>'draft' and not private.setting_bool('rempro.state_rpc') then
        raise exception 'Non-draft APU revisions cannot be updated directly';
    end if;
    if old.status<>'draft' and (
        new.direct_cost_total_mxn is distinct from old.direct_cost_total_mxn
        or new.indirect_total_mxn is distinct from old.indirect_total_mxn
        or new.risk_total_mxn is distinct from old.risk_total_mxn
        or new.profit_total_mxn is distinct from old.profit_total_mxn
        or new.commercial_net_total_mxn is distinct from old.commercial_net_total_mxn
        or new.tax_total_mxn is distinct from old.tax_total_mxn
        or new.gross_total_mxn is distinct from old.gross_total_mxn
    ) then raise exception 'Approved/superseded/archived APU revision is immutable'; end if;
    return new;
end;
$$;

create or replace function private.assert_apu_child_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_revision uuid; v_status text;
begin
    v_revision := case when tg_op='DELETE' then old.apu_revision_id else new.apu_revision_id end;
    select status into v_status from public.apu_revisions where id=v_revision;
    if v_status is distinct from 'draft' then raise exception 'APU revision % is immutable',v_revision; end if;
    if tg_op='DELETE' then return old; end if;
    return new;
end;
$$;

create or replace function private.normalize_apu_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_base numeric(18,4); v_rate numeric(9,4);
begin
    if private.setting_bool('rempro.apu_recalc') then
        v_base := new.taxable_base_mxn;
    else
        select commercial_net_total_mxn into v_base from public.apu_revisions where id=new.apu_revision_id;
    end if;
    select tr.rate_pct into v_rate from public.tax_rates tr
     where tr.organization_id=new.organization_id and tr.id=new.tax_rate_id;
    if not found then raise exception 'Tax rate not found'; end if;
    new.rate_snapshot := v_rate;
    new.taxable_base_mxn := v_base;
    new.tax_amount_mxn := round(v_base*v_rate/100.0,4);
    return new;
end;
$$;

create or replace function private.recalculate_apu_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_prev_derived text := current_setting('rempro.derived', true);
    v_prev_apu_recalc text := current_setting('rempro.apu_recalc', true);
    v_direct numeric(18,4);
    v_indirect numeric(18,4);
    v_risk numeric(18,4);
    v_profit numeric(18,4);
    v_commercial numeric(18,4);
    v_tax numeric(18,4);
begin
    if coalesce(current_setting('rempro.apu_recalc', true), '') = '1' then
        return;
    end if;

    perform set_config('rempro.apu_recalc', '1', true);
    perform set_config('rempro.derived', '1', true);

    -- a) Costo directo desde los insumos APU.
    select coalesce(sum(amount_mxn),0)
      into v_direct
      from public.apu_items
     where apu_revision_id = p_revision_id;

    -- b) Indirectos y riesgo se recalculan sobre costo directo.
    update public.apu_factors
       set amount_mxn = round(v_direct * rate_pct / 100.0, 4)
     where apu_revision_id = p_revision_id
       and factor_type in ('indirect','risk');

    -- c) Sumar indirectos y riesgo ya recalculados.
    select
        coalesce(sum(amount_mxn) filter (where factor_type='indirect'),0),
        coalesce(sum(amount_mxn) filter (where factor_type='risk'),0)
      into v_indirect, v_risk
      from public.apu_factors
     where apu_revision_id = p_revision_id;

    -- d) Utilidad sobre directo + indirectos + riesgo.
    update public.apu_factors
       set amount_mxn = round(
           (v_direct + v_indirect + v_risk) * rate_pct / 100.0,
           4
       )
     where apu_revision_id = p_revision_id
       and factor_type = 'profit';

    -- e) Sumar utilidad recalculada.
    select coalesce(sum(amount_mxn),0)
      into v_profit
      from public.apu_factors
     where apu_revision_id = p_revision_id
       and factor_type = 'profit';

    -- f) Precio comercial neto.
    v_commercial := round(v_direct + v_indirect + v_risk + v_profit, 4);

    -- g) Recalcular impuestos APU desde la base comercial vigente.
    update public.apu_taxes
       set taxable_base_mxn = v_commercial,
           tax_amount_mxn = round(v_commercial * rate_snapshot / 100.0, 4)
     where apu_revision_id = p_revision_id;

    select coalesce(sum(tax_amount_mxn),0)
      into v_tax
      from public.apu_taxes
     where apu_revision_id = p_revision_id;

    -- h) Snapshots de la revisión.
    update public.apu_revisions
       set direct_cost_total_mxn = round(v_direct,4),
           indirect_total_mxn = round(v_indirect,4),
           risk_total_mxn = round(v_risk,4),
           profit_total_mxn = round(v_profit,4),
           commercial_net_total_mxn = v_commercial,
           tax_total_mxn = round(v_tax,4),
           gross_total_mxn = round(v_commercial + v_tax,4)
     where id = p_revision_id;

    perform set_config('rempro.apu_recalc', coalesce(v_prev_apu_recalc,''), true);
    perform set_config('rempro.derived', coalesce(v_prev_derived,''), true);
exception
    when others then
        perform set_config('rempro.apu_recalc', coalesce(v_prev_apu_recalc,''), true);
        perform set_config('rempro.derived', coalesce(v_prev_derived,''), true);
        raise;
end;
$$;

create or replace function private.after_apu_child_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if not private.setting_bool('rempro.apu_recalc') then
        perform private.recalculate_apu_revision(case when tg_op='DELETE' then old.apu_revision_id else new.apu_revision_id end);
    end if;
    return null;
end;
$$;

create or replace function public.rpc_transition_apu_revision(
    p_organization_id uuid,
    p_revision_id uuid,
    p_to_status text,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns public.apu_revisions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_row public.apu_revisions%rowtype;
    v_reserved boolean;
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    v_reserved:=private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'state_transition','apu_revisions',p_revision_id,null,null,
        pg_catalog.jsonb_build_object('id',p_revision_id,'to_status',p_to_status),
        pg_catalog.jsonb_build_object('revision_id',p_revision_id,'to_status',p_to_status)
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_row
          from public.apu_revisions
         where organization_id=p_organization_id
           and id=(v_result->>'id')::uuid;
        return v_row;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'apu_state_transition',true,true);
    select * into v_row from public.apu_revisions where organization_id=p_organization_id and id=p_revision_id for update;
    if not found then raise exception 'APU revision not found'; end if;
    if not ((v_row.status='draft' and p_to_status in ('approved','archived'))
         or (v_row.status='approved' and p_to_status in ('superseded','archived'))) then
        raise exception 'Invalid APU transition % -> %',v_row.status,p_to_status;
    end if;
    if p_to_status='approved' then
        if not exists(select 1 from public.apu_items where apu_revision_id=p_revision_id) then raise exception 'APU requires items'; end if;
        perform private.recalculate_apu_revision(p_revision_id);
    end if;
    perform pg_catalog.set_config('rempro.state_rpc','1',true);
    update public.apu_revisions set status=p_to_status,client_mutation_id=p_client_mutation_id,device_id=p_device_id
     where id=p_revision_id returning * into v_row;
    perform pg_catalog.set_config('rempro.state_rpc','0',true);
    return v_row;
end;
$$;

-- ============================================================================
-- 19. CONSISTENCIA CONDICIONAL DE PROYECTO / APU / CASH
-- ============================================================================

create or replace function private.validate_line_apu_project()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_apu_project uuid;
begin
    if new.apu_revision_id is null then return new; end if;
    select a.project_id into v_apu_project
      from public.apu_revisions r join public.apus a on a.organization_id=r.organization_id and a.id=r.apu_id
     where r.organization_id=new.organization_id and r.id=new.apu_revision_id;
    if not found then raise exception 'APU revision not found'; end if;
    if v_apu_project is not null and v_apu_project<>new.project_id then raise exception 'APU belongs to another project'; end if;
    return new;
end;
$$;

create or replace function private.validate_cash_project_client()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_client uuid;
begin
    if new.project_id is not null and new.client_id is not null then
        select client_id into v_client from public.projects where organization_id=new.organization_id and id=new.project_id;
        if v_client is distinct from new.client_id then raise exception 'Cash movement client does not match project client'; end if;
    end if;
    return new;
end;
$$;

-- ============================================================================
-- 20. TRIGGERS
-- ============================================================================

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function private.handle_new_auth_user();
create trigger trg_profiles_touch
    before update on public.profiles
    for each row execute function private.touch_profile();

-- Backfill del usuario ya existente al aplicar la migración en un proyecto de prueba.
insert into public.profiles(id,display_name,active)
select u.id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.email,''),'Fernando Díaz Flores'),true
from auth.users u
on conflict(id) do nothing;

create constraint trigger trg_validate_work_package_weights
    after insert or update or delete on public.project_work_packages
    deferrable initially deferred
    for each row execute function private.validate_work_package_weights();

create trigger trg_commercial_document_insert_guard before insert on public.commercial_documents
    for each row execute function private.guard_commercial_document_insert();
create trigger trg_commercial_document_update_guard before update on public.commercial_documents
    for each row execute function private.guard_commercial_document_update();
create trigger trg_apu_revision_insert_guard before insert on public.apu_revisions
    for each row execute function private.guard_apu_revision_insert();
create trigger trg_apu_revision_update_guard before update on public.apu_revisions
    for each row execute function private.guard_apu_revision_update();

create trigger trg_normalize_commercial_tax before insert or update on public.commercial_line_taxes
    for each row execute function private.normalize_commercial_line_tax();
create trigger trg_validate_commercial_pricing before insert or update on public.commercial_line_pricing
    for each row execute function private.validate_commercial_line_pricing();
create trigger trg_line_apu_project before insert or update of apu_revision_id,project_id on public.commercial_document_lines
    for each row execute function private.validate_line_apu_project();
create trigger trg_cash_project_client before insert on public.cash_movements
    for each row execute function private.validate_cash_project_client();

create trigger trg_cost_entry_insert_guard before insert on public.cost_entries
    for each row execute function private.guard_cost_entry_insert();
create trigger trg_normalize_cost_tax before insert on public.cost_entry_taxes
    for each row execute function private.normalize_cost_tax();
create trigger trg_normalize_price_history_tax before insert on public.price_history
    for each row execute function private.normalize_price_history_tax();
create trigger trg_cash_movement_insert_guard before insert on public.cash_movements
    for each row execute function private.guard_cash_movement_insert();

create constraint trigger trg_validate_transfer_group
    after insert or update or delete on public.cash_movements
    deferrable initially deferred
    for each row execute function private.validate_transfer_group();

create constraint trigger trg_validate_cost_tax_from_entry
    after insert on public.cost_entries
    deferrable initially deferred
    for each row execute function private.validate_cost_tax_total();
create constraint trigger trg_validate_cost_tax_from_detail
    after insert on public.cost_entry_taxes
    deferrable initially deferred
    for each row execute function private.validate_cost_tax_total();

-- Child parent FKs cannot be changed after creation.
create trigger trg_immutable_work_package_parent before update on public.project_work_packages
    for each row execute function private.guard_immutable_columns('organization_id','project_id');
create trigger trg_immutable_apu_parent before update on public.apus
    for each row execute function private.guard_immutable_columns('organization_id','project_id');
create trigger trg_immutable_line_parent before update on public.commercial_document_lines
    for each row execute function private.guard_immutable_columns('organization_id','project_id','commercial_document_id');
create trigger trg_immutable_tax_parent before update on public.commercial_line_taxes
    for each row execute function private.guard_immutable_columns('organization_id','project_id','commercial_document_line_id');
create trigger trg_immutable_pricing_parent before update on public.commercial_line_pricing
    for each row execute function private.guard_immutable_columns('organization_id','project_id','commercial_document_line_id');
create trigger trg_immutable_cost_tax_parent before update on public.cost_entry_taxes
    for each row execute function private.guard_immutable_columns('organization_id','project_id','cost_entry_id');
create trigger trg_immutable_apu_item_parent before update on public.apu_items
    for each row execute function private.guard_immutable_columns('organization_id','apu_revision_id');
create trigger trg_immutable_apu_factor_parent before update on public.apu_factors
    for each row execute function private.guard_immutable_columns('organization_id','apu_revision_id');
create trigger trg_immutable_apu_tax_parent before update on public.apu_taxes
    for each row execute function private.guard_immutable_columns('organization_id','apu_revision_id');

-- Children are editable only while parent is draft.
create trigger trg_guard_document_lines before insert or update or delete on public.commercial_document_lines
    for each row execute function private.assert_document_child_is_draft();
create trigger trg_guard_document_taxes before insert or update or delete on public.commercial_line_taxes
    for each row execute function private.assert_document_child_is_draft();
create trigger trg_guard_document_pricing before insert or update or delete on public.commercial_line_pricing
    for each row execute function private.assert_document_child_is_draft();
create trigger trg_guard_document_presentation before insert or update or delete on public.commercial_document_presentations
    for each row execute function private.assert_document_child_is_draft();
create trigger trg_guard_apu_items before insert or update or delete on public.apu_items
    for each row execute function private.assert_apu_child_draft();
create trigger trg_guard_apu_factors before insert or update or delete on public.apu_factors
    for each row execute function private.assert_apu_child_draft();
create trigger trg_guard_apu_taxes before insert or update or delete on public.apu_taxes
    for each row execute function private.assert_apu_child_draft();
create trigger trg_normalize_apu_tax before insert or update on public.apu_taxes
    for each row execute function private.normalize_apu_tax();

create trigger trg_line_dependencies after insert or update or delete on public.commercial_document_lines
    for each row execute function private.after_commercial_line_change();
create trigger trg_tax_dependencies after insert or update or delete on public.commercial_line_taxes
    for each row execute function private.after_commercial_tax_change();
create trigger trg_recalculate_apu_items after insert or update or delete on public.apu_items
    for each row execute function private.after_apu_child_change();
create trigger trg_recalculate_apu_factors after insert or update or delete on public.apu_factors
    for each row execute function private.after_apu_child_change();
create trigger trg_recalculate_apu_taxes after insert or update or delete on public.apu_taxes
    for each row execute function private.after_apu_child_change();

-- Append-only ledgers.
do $$
declare t text;
begin
    foreach t in array array[
        'sync_mutations','cost_entries','cost_entry_taxes','cash_movements','cash_allocations',
        'commercial_document_events','physical_progress_entries','financial_progress_entries',
        'price_history','material_calculations','material_calculation_items','audit_log',
        'legacy_v1_project_snapshots'
    ] loop
        execute pg_catalog.format(
            'create trigger %I before update or delete on public.%I for each row execute function private.prevent_update_delete()',
            'trg_append_only_'||t,t
        );
    end loop;
end $$;

-- Versioned tables: UPDATE idempotency is backed by sync_mutations.
do $$
declare t text;
begin
    foreach t in array array[
        'organizations','units','tax_rates','payment_methods','cost_categories','document_types',
        'presentation_profiles','clients','suppliers','projects','project_work_packages','cash_accounts',
        'catalog_items','supplier_item_refs','apus','apu_revisions','apu_items','apu_factors','apu_taxes',
        'rule_sets','rule_values','material_systems','commercial_documents','commercial_document_lines',
        'commercial_line_taxes','commercial_line_pricing','import_batches','import_records'
    ] loop
        execute pg_catalog.format(
            'create trigger %I before update on public.%I for each row execute function private.before_versioned_update()',
            'trg_version_'||t,t
        );
    end loop;
end $$;

-- Direct inserts with client mutation fields are also registered in the mutation ledger.
do $$
declare t text;
begin
    foreach t in array array[
        'organizations','units','tax_rates','payment_methods','cost_categories','document_types',
        'presentation_profiles','clients','suppliers','projects','project_work_packages',
        'commercial_documents','commercial_document_lines','commercial_line_taxes','commercial_line_pricing',
        'commercial_document_presentations','commercial_document_events','cost_entries','cost_entry_taxes',
        'cash_accounts','cash_movements','physical_progress_entries','financial_progress_entries',
        'catalog_items','supplier_item_refs','price_history','apus','apu_revisions','apu_items','apu_factors','apu_taxes',
        'rule_sets','rule_values','material_systems','material_calculations','material_calculation_items',
        'import_batches','import_records','legacy_v1_project_snapshots'
    ] loop
        execute pg_catalog.format(
            'create trigger %I before insert on public.%I for each row execute function private.register_insert_mutation()',
            'trg_mutation_insert_'||t,t
        );
    end loop;
end $$;

-- Audit all business tables. audit_log is intentionally excluded to prevent recursion.
do $$
declare t text;
begin
    foreach t in array array[
        'organizations','units','tax_rates','payment_methods','cost_categories','document_types',
        'presentation_profiles','clients','suppliers','projects','project_work_packages',
        'commercial_documents','commercial_document_lines','commercial_line_taxes','commercial_line_pricing',
        'commercial_document_presentations','commercial_document_events','cost_entries','cost_entry_taxes',
        'cash_accounts','cash_movements','cash_allocations','physical_progress_entries','financial_progress_entries',
        'catalog_items','supplier_item_refs','price_history','apus','apu_revisions','apu_items','apu_factors','apu_taxes',
        'rule_sets','rule_values','material_systems','material_calculations','material_calculation_items',
        'import_batches','import_records','legacy_v1_project_snapshots'
    ] loop
        execute pg_catalog.format(
            'create trigger %I after insert or update or delete on public.%I for each row execute function private.write_audit_log()',
            'trg_audit_'||t,t
        );
    end loop;
end $$;

-- ============================================================================
-- 21. PRESENTACIÓN COMERCIAL TAX-INCLUSIVE (REGLA GUILLERMO)
-- ============================================================================

create or replace view public.commercial_line_display_v
with (security_invoker = true)
as
select
    l.organization_id,
    l.project_id,
    l.commercial_document_id,
    l.id as commercial_document_line_id,
    l.line_number,
    l.description,
    l.quantity,
    l.unit_id,
    round(l.subtotal_mxn-l.discount_mxn,2) as internal_net_mxn,
    coalesce(tx.tax_mxn,0)::numeric(18,2) as internal_tax_mxn,
    round(l.subtotal_mxn-l.discount_mxn+coalesce(tx.tax_mxn,0),2) as internal_total_mxn,
    p.show_tax_separately,
    p.tax_inclusive_when_hidden,
    case
        when not p.show_tax_separately and p.tax_inclusive_when_hidden
            then round((l.subtotal_mxn-l.discount_mxn+coalesce(tx.tax_mxn,0))/l.quantity,4)
        else round((l.subtotal_mxn-l.discount_mxn)/l.quantity,4)
    end as displayed_unit_price_mxn,
    case
        when not p.show_tax_separately and p.tax_inclusive_when_hidden
            then round(l.subtotal_mxn-l.discount_mxn+coalesce(tx.tax_mxn,0),2)
        else round(l.subtotal_mxn-l.discount_mxn,2)
    end as displayed_amount_mxn,
    case when p.show_tax_separately then coalesce(tx.tax_mxn,0)::numeric(18,2) else null end as displayed_tax_mxn,
    d.amount_mxn as displayed_document_total_mxn
from public.commercial_document_lines l
join public.commercial_documents d on d.id=l.commercial_document_id
join public.commercial_document_presentations p on p.commercial_document_id=d.id
left join lateral (
    select sum(t.tax_amount_mxn) as tax_mxn
    from public.commercial_line_taxes t
    where t.commercial_document_line_id=l.id
) tx on true;

comment on view public.commercial_line_display_v is
'Presentación comercial: neto e IVA permanecen separados internamente. Si show_tax_separately=false, P.U. e importe mostrados son tax-inclusive y el total mostrado sigue siendo el precio final pactado amount_mxn.';

-- ============================================================================
-- 21A. RPC TRANSACCIONAL PARA COSTOS
-- ============================================================================

create or replace function public.rpc_create_cost_entry(
    p_id uuid,
    p_organization_id uuid,
    p_project_id uuid,
    p_supplier_id uuid,
    p_cost_category_id uuid,
    p_work_package_id uuid,
    p_incurred_date date,
    p_description text,
    p_cost_class text,
    p_entry_kind text,
    p_effect text,
    p_related_cost_entry_id uuid,
    p_quantity numeric,
    p_unit_id uuid,
    p_unit_cost_mxn numeric,
    p_net_amount_mxn numeric,
    p_tax_rate_id uuid,
    p_source_reference text,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns public.cost_entries
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_reserved boolean;
    v_row public.cost_entries%rowtype;
    v_rate numeric(9,4);
    v_tax numeric(18,2):=0;
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    if p_entry_kind not in ('original','adjustment') then
        raise exception 'rpc_create_cost_entry supports only original/adjustment; use rpc_reverse_cost_entry for reversals';
    end if;
    if p_entry_kind='original' and (p_related_cost_entry_id is not null or p_effect<>'increase') then
        raise exception 'Original cost entry requires increase and no related entry';
    end if;
    if p_entry_kind='adjustment' and p_related_cost_entry_id is null then
        raise exception 'Adjustment requires related cost entry';
    end if;

    v_reserved:=private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'insert','cost_entries',p_id,null,null,
        pg_catalog.jsonb_build_object('cost_entry_id',p_id),
        pg_catalog.jsonb_build_object(
            'id',p_id,'project_id',p_project_id,'supplier_id',p_supplier_id,
            'cost_category_id',p_cost_category_id,'work_package_id',p_work_package_id,
            'incurred_date',p_incurred_date,'description',p_description,
            'cost_class',p_cost_class,'entry_kind',p_entry_kind,'effect',p_effect,
            'related_cost_entry_id',p_related_cost_entry_id,'quantity',p_quantity,
            'unit_id',p_unit_id,'unit_cost_mxn',p_unit_cost_mxn,
            'net_amount_mxn',p_net_amount_mxn,'tax_rate_id',p_tax_rate_id,
            'source_reference',p_source_reference
        )
    );
    if not v_reserved then
        v_result:=private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
        select * into v_row
          from public.cost_entries
         where organization_id=p_organization_id
           and id=(v_result->>'cost_entry_id')::uuid;
        return v_row;
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,
        case when p_entry_kind='adjustment' then 'cost_adjustment' else 'cost_insert' end,true,false);

    if p_tax_rate_id is not null then
        select rate_pct into v_rate from public.tax_rates
         where organization_id=p_organization_id and id=p_tax_rate_id and deleted_at is null;
        if not found then raise exception 'Tax rate not found'; end if;
        v_tax:=round(p_net_amount_mxn*v_rate/100.0,2);
    end if;

    insert into public.cost_entries(
        id,organization_id,project_id,supplier_id,cost_category_id,work_package_id,
        incurred_date,description,cost_class,entry_kind,effect,related_cost_entry_id,
        quantity,unit_id,unit_cost_mxn,net_amount_mxn,tax_amount_mxn,source_reference,
        client_mutation_id,device_id
    ) values (
        p_id,p_organization_id,p_project_id,p_supplier_id,p_cost_category_id,p_work_package_id,
        p_incurred_date,p_description,p_cost_class,p_entry_kind,p_effect,p_related_cost_entry_id,
        p_quantity,p_unit_id,p_unit_cost_mxn,round(p_net_amount_mxn,2),v_tax,p_source_reference,
        gen_random_uuid(),p_device_id
    ) returning * into v_row;

    if p_tax_rate_id is not null then
        insert into public.cost_entry_taxes(
            organization_id,project_id,cost_entry_id,tax_rate_id,taxable_base_mxn,rate_snapshot,tax_amount_mxn,
            client_mutation_id,device_id
        ) values (
            p_organization_id,p_project_id,p_id,p_tax_rate_id,round(p_net_amount_mxn,2),v_rate,v_tax,
            gen_random_uuid(),p_device_id
        );
    end if;
    return v_row;
end;
$$;

-- ============================================================================
-- 21B. RPCs DE CORRECCIÓN DRAFT / TRANSFERENCIA
-- ============================================================================

create or replace function public.rpc_reverse_transfer(
    p_organization_id uuid,
    p_original_transfer_group_id uuid,
    p_out_reversal_id uuid,
    p_in_reversal_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_reason text,
    p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_reserved boolean;
    v_out public.cash_movements%rowtype;
    v_in public.cash_movements%rowtype;
    v_result jsonb;
begin
    perform private.assert_owner(p_organization_id);
    v_reserved:=private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'reversal','cash_movements',p_original_transfer_group_id,null,null,
        pg_catalog.jsonb_build_object(
            'transfer_group_id',p_original_transfer_group_id,
            'out_reversal_id',p_out_reversal_id,'in_reversal_id',p_in_reversal_id
        ),
        pg_catalog.jsonb_build_object(
            'original_transfer_group_id',p_original_transfer_group_id,
            'out_reversal_id',p_out_reversal_id,'in_reversal_id',p_in_reversal_id,
            'reason',p_reason
        )
    );
    if not v_reserved then
        return private.get_sync_mutation_result(p_organization_id,p_client_mutation_id);
    end if;

    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'transfer_reversal',true,false);

    select * into v_out from public.cash_movements
     where organization_id=p_organization_id and transfer_group_id=p_original_transfer_group_id
       and movement_kind='transfer' and direction='outflow' for update;
    select * into v_in from public.cash_movements
     where organization_id=p_organization_id and transfer_group_id=p_original_transfer_group_id
       and movement_kind='transfer' and direction='inflow' for update;
    if v_out.id is null or v_in.id is null then raise exception 'Complete transfer pair not found'; end if;
    if v_out.amount_mxn<>v_in.amount_mxn then raise exception 'Transfer pair is inconsistent'; end if;

    insert into public.cash_movements(
        id,organization_id,project_id,cash_account_id,movement_kind,direction,effect,related_movement_id,
        occurred_at,amount_mxn,reference,description,client_mutation_id,device_id
    ) values
    (p_out_reversal_id,p_organization_id,v_out.project_id,v_out.cash_account_id,'reversal','outflow','decrease',v_out.id,
     pg_catalog.now(),v_out.amount_mxn,v_out.reference,'REVERSAL TRANSFER: '||coalesce(p_reason,''),gen_random_uuid(),p_device_id),
    (p_in_reversal_id,p_organization_id,v_in.project_id,v_in.cash_account_id,'reversal','inflow','decrease',v_in.id,
     pg_catalog.now(),v_in.amount_mxn,v_in.reference,'REVERSAL TRANSFER: '||coalesce(p_reason,''),gen_random_uuid(),p_device_id);

    return pg_catalog.jsonb_build_object('transfer_group_id',p_original_transfer_group_id,'out_reversal_id',p_out_reversal_id,'in_reversal_id',p_in_reversal_id);
end;
$$;

-- Deletes físicos sólo se permiten para hijos de un DRAFT, y siempre mediante
-- esta RPC para que mutation/device reales queden en sync_mutations/audit_log.
create or replace function public.rpc_delete_draft_child(
    p_organization_id uuid,
    p_entity_type text,
    p_entity_id uuid,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_reserved boolean;
    v_deleted bigint;
begin
    perform private.assert_owner(p_organization_id);
    if p_entity_type not in (
        'commercial_document_lines','commercial_line_taxes','commercial_line_pricing',
        'commercial_document_presentations','apu_items','apu_factors','apu_taxes'
    ) then raise exception 'Unsupported draft child type'; end if;

    v_reserved:=private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'delete',p_entity_type,p_entity_id,null,null,
        pg_catalog.jsonb_build_object('deleted_id',p_entity_id),
        pg_catalog.jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id)
    );
    if not v_reserved then return true; end if;
    perform private.set_operation_context(p_client_mutation_id,p_device_id,p_request_id,'draft_child_delete',true,false);

    case p_entity_type
        when 'commercial_document_lines' then
            delete from public.commercial_document_lines where organization_id=p_organization_id and id=p_entity_id;
        when 'commercial_line_taxes' then
            delete from public.commercial_line_taxes where organization_id=p_organization_id and id=p_entity_id;
        when 'commercial_line_pricing' then
            delete from public.commercial_line_pricing where organization_id=p_organization_id and commercial_document_line_id=p_entity_id;
        when 'commercial_document_presentations' then
            delete from public.commercial_document_presentations where organization_id=p_organization_id and commercial_document_id=p_entity_id;
        when 'apu_items' then
            delete from public.apu_items where organization_id=p_organization_id and id=p_entity_id;
        when 'apu_factors' then
            delete from public.apu_factors where organization_id=p_organization_id and id=p_entity_id;
        when 'apu_taxes' then
            delete from public.apu_taxes where organization_id=p_organization_id and id=p_entity_id;
    end case;
    get diagnostics v_deleted = row_count;
    if v_deleted<>1 then raise exception 'Draft child not found or not deletable'; end if;
    return true;
end;
$$;


-- Transacción única para crear/reponderar/activar/desactivar paquetes.
-- p_packages es un arreglo JSONB de cambios. Cada elemento debe incluir id.
-- Para INSERT: code, name, weight_pct; expected_version debe omitirse.
-- Para UPDATE: expected_version es obligatorio. Campos omitidos conservan valor.
-- Opcional: deleted=true realiza soft delete dentro de la misma transacción.
create or replace function public.rpc_set_work_packages(
    p_organization_id uuid,
    p_project_id uuid,
    p_packages jsonb,
    p_client_mutation_id uuid,
    p_device_id uuid,
    p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_reserved boolean;
    v_input jsonb;
    v_result jsonb;
    v_item jsonb;
    v_id uuid;
    v_existing public.project_work_packages%rowtype;
    v_expected bigint;
    v_active_count integer;
    v_total numeric(12,4);
    v_input_count integer;
    v_distinct_count integer;
begin
    perform private.assert_owner(p_organization_id);

    if p_packages is null or pg_catalog.jsonb_typeof(p_packages)<>'array' then
        raise exception 'p_packages must be a JSON array';
    end if;

    select count(*),count(distinct value->>'id')
      into v_input_count,v_distinct_count
      from pg_catalog.jsonb_array_elements(p_packages);
    if v_input_count<>v_distinct_count then
        raise exception 'p_packages contains duplicate ids';
    end if;

    v_input:=pg_catalog.jsonb_build_object(
        'project_id',p_project_id,
        'packages',coalesce((
            select pg_catalog.jsonb_agg(value order by value->>'id')
              from pg_catalog.jsonb_array_elements(p_packages)
        ),'[]'::jsonb)
    );
    v_result:=pg_catalog.jsonb_build_object(
        'project_id',p_project_id,
        'package_ids',coalesce((
            select pg_catalog.jsonb_agg((value->>'id')::uuid order by value->>'id')
              from pg_catalog.jsonb_array_elements(p_packages)
        ),'[]'::jsonb)
    );

    v_reserved:=private.reserve_sync_mutation(
        p_organization_id,p_client_mutation_id,p_device_id,p_request_id,
        'work_package_set','project_work_packages',p_project_id,null,null,
        v_result,v_input
    );
    if not v_reserved then
        return private.get_sync_mutation_result(
            p_organization_id,p_client_mutation_id
        );
    end if;

    perform private.set_operation_context(
        p_client_mutation_id,p_device_id,p_request_id,
        'work_package_set',true,true
    );

    -- Serialize changes to the project package set.
    perform 1
      from public.projects
     where organization_id=p_organization_id
       and id=p_project_id
       and deleted_at is null
     for update;
    if not found then
        raise exception 'Project not found';
    end if;

    for v_item in
        select value
          from pg_catalog.jsonb_array_elements(p_packages)
         order by value->>'id'
    loop
        if nullif(v_item->>'id','') is null then
            raise exception 'Every work package change requires id';
        end if;
        v_id:=(v_item->>'id')::uuid;

        select *
          into v_existing
          from public.project_work_packages
         where organization_id=p_organization_id
           and project_id=p_project_id
           and id=v_id
         for update;

        if found then
            v_expected:=nullif(v_item->>'expected_version','')::bigint;
            if v_expected is null or v_expected<>v_existing.version then
                raise exception
                    'Work package % version conflict. Expected %, current %',
                    v_id,v_expected,v_existing.version;
            end if;

            update public.project_work_packages
               set code=coalesce(v_item->>'code',code),
                   name=coalesce(v_item->>'name',name),
                   weight_pct=coalesce(
                       nullif(v_item->>'weight_pct','')::numeric,weight_pct
                   ),
                   sort_order=coalesce(
                       nullif(v_item->>'sort_order','')::integer,sort_order
                   ),
                   active=case
                       when v_item ? 'active' then (v_item->>'active')::boolean
                       else active
                   end,
                   deleted_at=case
                       when coalesce((v_item->>'deleted')::boolean,false)
                       then pg_catalog.now()
                       when v_item ? 'deleted' and not (v_item->>'deleted')::boolean
                       then null
                       else deleted_at
                   end,
                   deleted_by=case
                       when coalesce((v_item->>'deleted')::boolean,false)
                       then auth.uid()
                       when v_item ? 'deleted' and not (v_item->>'deleted')::boolean
                       then null
                       else deleted_by
                   end,
                   client_mutation_id=client_mutation_id,
                   device_id=device_id
             where organization_id=p_organization_id
               and project_id=p_project_id
               and id=v_id;
        else
            if nullif(v_item->>'expected_version','') is not null then
                raise exception 'New work package % cannot have expected_version',v_id;
            end if;
            if coalesce((v_item->>'deleted')::boolean,false) then
                raise exception 'New work package % cannot be inserted deleted',v_id;
            end if;
            if nullif(v_item->>'code','') is null
               or nullif(v_item->>'name','') is null
               or nullif(v_item->>'weight_pct','') is null then
                raise exception
                    'New work package % requires code, name and weight_pct',v_id;
            end if;

            insert into public.project_work_packages(
                id,organization_id,project_id,code,name,weight_pct,sort_order,active,
                client_mutation_id,device_id
            ) values (
                v_id,p_organization_id,p_project_id,
                v_item->>'code',v_item->>'name',
                (v_item->>'weight_pct')::numeric,
                coalesce(nullif(v_item->>'sort_order','')::integer,0),
                coalesce((v_item->>'active')::boolean,true),
                gen_random_uuid(),p_device_id
            );
        end if;
    end loop;

    select count(*),coalesce(sum(weight_pct),0)
      into v_active_count,v_total
      from public.project_work_packages
     where organization_id=p_organization_id
       and project_id=p_project_id
       and active=true
       and deleted_at is null;

    if v_active_count>0 and v_total<>100.0000 then
        raise exception
            'Active work package weights must total 100%%; current total=%',
            v_total;
    end if;

    return v_result;
end;
$$;

-- ============================================================================
-- 22. HARDENING SECURITY DEFINER
-- ============================================================================

-- Default EXECUTE is PUBLIC in PostgreSQL. Revoke it explicitly from every
-- function in private and every SECURITY DEFINER public RPC; authenticated
-- receives only the public RPCs granted explicitly below.
do $$
declare r record;
begin
    for r in
        select n.nspname as schema_name,p.proname,
               pg_catalog.pg_get_function_identity_arguments(p.oid) as args
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='private'
           or (n.nspname='public' and p.prosecdef and p.proname like 'rpc_%')
    loop
        execute pg_catalog.format('revoke all on function %I.%I(%s) from public, anon, authenticated',
            r.schema_name,r.proname,r.args);
    end loop;
end $$;

-- Only these public RPCs are callable from the authenticated PWA.
grant execute on function public.rpc_transition_commercial_document(uuid,uuid,text,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_reverse_cost_entry(uuid,uuid,uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.rpc_create_cost_entry(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text,text,text,uuid,numeric,uuid,numeric,numeric,uuid,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_create_transfer(uuid,uuid,uuid,uuid,numeric,timestamptz,uuid,uuid,uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.rpc_reverse_cash_movement(uuid,uuid,uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.rpc_create_cash_allocation(uuid,uuid,uuid,uuid,uuid,uuid,numeric,uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_reverse_cash_allocation(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_transition_apu_revision(uuid,uuid,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_reverse_transfer(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.rpc_delete_draft_child(uuid,text,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.rpc_set_work_packages(uuid,uuid,jsonb,uuid,uuid,uuid) to authenticated;


-- ============================================================================
-- 23. ROW LEVEL SECURITY — PROPIETARIO ÚNICO
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;

create policy profiles_owner_select
    on public.profiles for select to authenticated
    using (id = auth.uid());

create policy profiles_owner_update
    on public.profiles for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

create policy organizations_owner_all
    on public.organizations for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

do $$
declare t text;
begin
    foreach t in array array[
        'sync_mutations','units','tax_rates','payment_methods','cost_categories','document_types',
        'presentation_profiles','clients','suppliers','projects','project_work_packages',
        'commercial_documents','commercial_document_lines','commercial_line_taxes','commercial_line_pricing',
        'commercial_document_presentations','commercial_document_events','cost_entries','cost_entry_taxes',
        'cash_accounts','cash_movements','cash_allocations','physical_progress_entries','financial_progress_entries',
        'catalog_items','supplier_item_refs','price_history','apus','apu_revisions','apu_items','apu_factors','apu_taxes',
        'rule_sets','rule_values','material_systems','material_calculations','material_calculation_items',
        'audit_log','import_batches','import_records','legacy_v1_project_snapshots'
    ] loop
        execute pg_catalog.format('alter table public.%I enable row level security',t);
        execute pg_catalog.format(
            'create policy %I on public.%I for all to authenticated '
            'using (exists (select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=auth.uid() and o.deleted_at is null)) '
            'with check (exists (select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=auth.uid() and o.deleted_at is null))',
            t||'_owner_policy',t
        );
    end loop;
end $$;

-- ============================================================================
-- 24. GRANTS — PRINCIPIO DE MÍNIMO PRIVILEGIO
-- ============================================================================

-- Reset explícito de privilegios sobre las tablas de RemPro. anon no recibe nada.
do $$
declare t text;
begin
    foreach t in array array[
        'profiles','organizations','sync_mutations','units','tax_rates','payment_methods','cost_categories','document_types',
        'presentation_profiles','clients','suppliers','projects','project_work_packages',
        'commercial_documents','commercial_document_lines','commercial_line_taxes','commercial_line_pricing',
        'commercial_document_presentations','commercial_document_events','cost_entries','cost_entry_taxes',
        'cash_accounts','cash_movements','cash_allocations','physical_progress_entries','financial_progress_entries',
        'catalog_items','supplier_item_refs','price_history','apus','apu_revisions','apu_items','apu_factors','apu_taxes',
        'rule_sets','rule_values','material_systems','material_calculations','material_calculation_items',
        'audit_log','import_batches','import_records','legacy_v1_project_snapshots'
    ] loop
        execute pg_catalog.format('revoke all on table public.%I from public, anon, authenticated',t);
    end loop;
end $$;

-- Perfil: creado por trigger de auth.users; el frontend sólo lee y cambia nombre.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Lectura general; RLS limita todo al único owner de RemPro.
grant select on
    public.organizations,
    public.sync_mutations,
    public.units,
    public.tax_rates,
    public.payment_methods,
    public.cost_categories,
    public.document_types,
    public.presentation_profiles,
    public.clients,
    public.suppliers,
    public.projects,
    public.project_work_packages,
    public.commercial_documents,
    public.commercial_document_lines,
    public.commercial_line_taxes,
    public.commercial_line_pricing,
    public.commercial_document_presentations,
    public.commercial_document_events,
    public.cost_entries,
    public.cost_entry_taxes,
    public.cash_accounts,
    public.cash_movements,
    public.cash_allocations,
    public.physical_progress_entries,
    public.financial_progress_entries,
    public.catalog_items,
    public.supplier_item_refs,
    public.price_history,
    public.apus,
    public.apu_revisions,
    public.apu_items,
    public.apu_factors,
    public.apu_taxes,
    public.rule_sets,
    public.rule_values,
    public.material_systems,
    public.material_calculations,
    public.material_calculation_items,
    public.audit_log,
    public.import_batches,
    public.import_records,
    public.legacy_v1_project_snapshots
to authenticated;

revoke all on public.commercial_line_display_v from public, anon, authenticated;
grant select on public.commercial_line_display_v to authenticated;

-- Maestros y borradores editables. DELETE no se concede: maestros usan soft
-- delete y los hijos draft se eliminan exclusivamente mediante RPC auditada.
grant insert, update on
    public.organizations,
    public.units,
    public.tax_rates,
    public.payment_methods,
    public.cost_categories,
    public.document_types,
    public.presentation_profiles,
    public.clients,
    public.suppliers,
    public.projects,
    public.cash_accounts,
    public.catalog_items,
    public.supplier_item_refs,
    public.apus,
    public.apu_revisions,
    public.apu_items,
    public.apu_factors,
    public.apu_taxes,
    public.rule_sets,
    public.rule_values,
    public.material_systems,
    public.commercial_documents,
    public.commercial_document_lines,
    public.commercial_line_taxes,
    public.commercial_line_pricing,
    public.import_batches,
    public.import_records
to authenticated;

-- Snapshot comercial: insertable mientras el documento sea draft; cambios se
-- hacen como delete auditado + nuevo insert para evitar UPDATE ambiguo.
grant insert on public.commercial_document_presentations to authenticated;

-- Ledgers que admiten creación directa de hechos originales. Los triggers
-- bloquean transfer/reversal cuando corresponda y UPDATE/DELETE no se conceden.
grant insert on
    public.cash_movements,
    public.physical_progress_entries,
    public.financial_progress_entries,
    public.price_history,
    public.material_calculations,
    public.material_calculation_items,
    public.legacy_v1_project_snapshots
to authenticated;

-- Sin privilegios de escritura desde frontend:
-- sync_mutations, audit_log, cash_allocations y commercial_document_events.
-- Se escriben exclusivamente desde triggers/RPC SECURITY DEFINER controladas.


-- ============================================================================
-- 25. NOTAS DE IMPLEMENTACIÓN (NO SON DDL)
-- ============================================================================

-- 7) Invariant obligatorio de sincronización offline:
--    Toda entidad sincronizable creada offline DEBE recibir y persistir su UUID
--    en el dispositivo ANTES del primer intento de INSERT y antes de entrar a
--    la outbox.
--
--    Un retry de la misma operación debe reutilizar EXACTAMENTE:
--      * entity id
--      * client_mutation_id
--      * payload semántico / input_fingerprint
--
--    Los defaults gen_random_uuid() permanecen como respaldo del esquema para
--    operaciones servidor-side, pero la PWA NO debe depender de ellos para
--    entidades creadas offline.

--
-- 1) USD / referencia interna:
--    La PWA no debe consultar Banxico con secretos embebidos.
--    Implementar posteriormente una Supabase Edge Function que consulte:
--      Banco de México SIE / FIX / SF43718
--    y retorne, para CONTROL INTERNO:
--      source_amount_usd,
--      fx_rate_mxn_per_usd,
--      fx_rate_date,
--      fx_source='BANXICO_FIX',
--      fx_reference,
--      amount_mxn
--    BANXICO_FIX NO es etiquetado ni tratado por RemPro Control como tipo de
--    cambio fiscal. Esta referencia interna no sustituye las disposiciones
--    fiscales aplicables al tipo de cambio para contribuciones.
--    El movimiento sólo se confirma cuando la referencia de conversión esté
--    resuelta y amount_mxn haya sido calculado y congelado.
--
-- 2) Fin de semana / día inhábil:
--    usar la referencia interna disponible conforme a la política operativa
--    aprobada y conservar SIEMPRE fx_rate_date real de la tasa utilizada.
--
-- 3) Conversión física posterior de USD:
--    Si posteriormente los USD físicos se convierten realmente a MXN con una
--    tasa diferente, NO modificar cash_movements del pago original y NO
--    modificar sus cash_allocations.
--    Registrar la diferencia económica como un cash_movement separado:
--      movement_kind = 'adjustment'
--      related_movement_id = <pago USD original>
--      effect = 'increase' o 'decrease' según corresponda
--      amount_mxn = valor absoluto de la diferencia
--    La descripción debe identificar que se trata de diferencia por conversión
--    física posterior de USD.
--
-- 4) Guillermo / presentación tax-inclusive:
--    usar presentation_profiles.show_tax_separately = false y
--    tax_inclusive_when_hidden = true.
--    Internamente se conservan SIEMPRE:
--      neto interno = subtotal_mxn - discount_mxn
--      impuesto interno = tax_mxn / commercial_line_taxes
--      total comercial pactado = amount_mxn
--    Cuando el IVA se oculta, displayed_unit_price_mxn y displayed_amount_mxn
--    incluyen el impuesto y displayed_document_total_mxn sigue siendo amount_mxn.
--    Nunca se suma visualmente un IVA adicional al precio final pactado.
--
-- 5) Seguridad frontend / Edge Functions:
--    La service_role / secret key de Supabase y cualquier token Banxico NUNCA
--    deben incluirse en GitHub Pages, app.js, IndexedDB ni localStorage.
--    Las Edge Functions mantienen secretos exclusivamente del lado servidor.
--
-- 6) V1:
--    no reinterpretar contract/collected/cost como movimientos V2.
--    Importarlos primero como legacy_v1_project_snapshots pendientes de
--    conciliación.
--
-- 7) Idempotencia semántica:
--    sync_mutations.input_fingerprint conserva SHA-256 del payload canónico.
--    Un client_mutation_id sólo puede repetirse cuando organización, operación,
--    entidad y fingerprint coinciden. Las RPC devuelven result_ref persistido
--    del primer intento y nunca confían en IDs distintos enviados por un retry.
--
-- 8) Work packages:
--    La suma activa/no eliminada permanece exactamente en 100%.
--    La PWA debe usar rpc_set_work_packages para crear/reponderar/activar/
--    desactivar paquetes en una única transacción; no existen grants directos
--    INSERT/UPDATE para project_work_packages.
--
-- 9) A partir de la primera aplicación efectiva de esta migración:
--    NUNCA editar este archivo para corregir producción.
--    Todo cambio futuro debe vivir en 002_*.sql, 003_*.sql, etc.
--
-- ============================================================================

commit;
-- El ROLLBACK intencional refuerza que este archivo es un BORRADOR NO EJECUTABLE
-- mientras esté en revisión. En la versión aprobada para despliegue se sustituirá
-- por COMMIT después de validación en un proyecto Supabase de prueba.
