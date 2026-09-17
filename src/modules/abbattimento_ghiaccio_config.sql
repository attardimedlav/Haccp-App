-- =====================================================================
-- Abbattimento prodotti cotti, macchina del ghiaccio, interruttori in
-- Configurazione (17/09/2026)
-- Aggiunge colonne a companies (non tocca i dati esistenti) e crea due
-- tabelle nuove. Incollare tutto insieme in SQL Editor e premere Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Interruttori in Configurazione
-- ---------------------------------------------------------------------
alter table public.companies
  add column if not exists active_traceability boolean not null default true,
  add column if not exists has_blast_chiller boolean not null default false,
  add column if not exists has_ice_machine boolean not null default false,
  add column if not exists ice_machine_cleaning_days integer not null default 30;

-- ---------------------------------------------------------------------
-- 2. Cicli di abbattimento dei prodotti cotti (positivo / negativo)
-- ---------------------------------------------------------------------
create table if not exists public.blast_chill_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  product_name text not null,
  preparation_id uuid references public.preparations(id) on delete set null,
  cycle_type text not null check (cycle_type in ('positivo','negativo')),
  target_temp numeric not null,   -- +3 positivo, -18 negativo
  max_minutes integer not null,   -- 90 positivo, 240 negativo
  start_time timestamptz not null,
  start_core_temp numeric,
  end_time timestamptz,
  end_core_temp numeric,
  outcome text check (outcome in ('conforme','non_conforme')),
  operator text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.blast_chill_cycles enable row level security;

drop policy if exists "blast_chill_cycles_company_access" on public.blast_chill_cycles;
create policy "blast_chill_cycles_company_access" on public.blast_chill_cycles
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

create index if not exists blast_chill_cycles_company_idx on public.blast_chill_cycles (company_id, start_time);

-- ---------------------------------------------------------------------
-- 3. Registro pulizia e sanificazione della macchina del ghiaccio
-- ---------------------------------------------------------------------
create table if not exists public.ice_machine_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  intervention_date date not null default current_date,
  intervention_type text not null,
  sanitizer text,
  operator text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.ice_machine_logs enable row level security;

drop policy if exists "ice_machine_logs_company_access" on public.ice_machine_logs;
create policy "ice_machine_logs_company_access" on public.ice_machine_logs
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

create index if not exists ice_machine_logs_company_idx on public.ice_machine_logs (company_id, intervention_date);

-- =====================================================================
-- Fine. Controllo: in Table Editor devono comparire blast_chill_cycles e
-- ice_machine_logs con il lucchetto della RLS.
-- =====================================================================
