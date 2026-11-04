-- BarberBooking: schema MVP (Supabase / Postgres 15+)
-- Multi-tenant: ogni riga di un salone ha tenant_id. Accesso con Row Level Security.
-- Tempi sempre timestamptz (UTC). Soldi sempre in centesimi interi + currency.
-- Le tabelle della fase 2 (cassa, magazzino, marketing, fidelity, coda) sono in fondo, commentate.

create extension if not exists btree_gist;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- piattaforma
-- ---------------------------------------------------------------------------

-- utente dell'app (cliente o staff): 1-1 con auth.users di Supabase
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,                       -- E.164, verificato con OTP
  email citext unique,
  locale text not null default 'it',
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  phone text,
  email citext,
  address_line text,
  city text,
  postal_code text,
  country text not null default 'IT',
  lat double precision,
  lng double precision,
  timezone text not null default 'Europe/Rome',
  currency char(3) not null default 'EUR',
  logo_path text,
  cover_path text,
  description text,
  -- regole prenotazione online (S32)
  booking_enabled boolean not null default true,
  slot_interval_min int not null default 15 check (slot_interval_min in (5,10,15,20,30,60)),
  min_notice_min int not null default 60 check (min_notice_min >= 0),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  cancel_window_min int not null default 120 check (cancel_window_min >= 0),
  requires_approval boolean not null default false,
  reminder_hour smallint not null default 18 check (reminder_hour between 0 and 23), -- ora locale del promemoria serale (F05)
  -- abbonamento SaaS (F12)
  plan text not null default 'trial' check (plan in ('trial','base','pro')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','read_only','suspended','deleted')),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenants_city_idx on tenants (city);
create index tenants_status_idx on tenants (status);

-- chi lavora nel salone e con quale ruolo (accesso al gestionale)
create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create or replace function is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where tenant_id = t and user_id = auth.uid())
$$;

create or replace function has_role(t uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where tenant_id = t and user_id = auth.uid() and role = any(roles))
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function tenant_is_public(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenants where id = t
                 and status in ('trialing','active','past_due') and booking_enabled)
$$;

-- ---------------------------------------------------------------------------
-- salone: staff, servizi, orari
-- ---------------------------------------------------------------------------

-- operatore visibile in agenda e ai clienti (puo non avere un login)
create table staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  membership_id uuid unique references memberships(id) on delete set null,
  display_name text not null,
  avatar_path text,
  color text,                              -- colore della colonna in agenda
  sort_order int not null default 0,
  bookable_online boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_members_tenant_idx on staff_members (tenant_id, sort_order);

create table service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index service_categories_tenant_idx on service_categories (tenant_id);

create table services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid references service_categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  duration_min int not null check (duration_min between 5 and 600),
  price_cents int not null check (price_cents >= 0),
  currency char(3) not null default 'EUR',
  bookable_online boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_tenant_idx on services (tenant_id, sort_order);
create index services_category_idx on services (category_id);

-- quali operatori fanno quale servizio
create table service_staff (
  service_id uuid not null references services(id) on delete cascade,
  staff_id uuid not null references staff_members(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  primary key (service_id, staff_id)
);
create index service_staff_staff_idx on service_staff (staff_id);
create index service_staff_tenant_idx on service_staff (tenant_id);

-- orari settimanali: del salone (staff_id null) o del singolo operatore
-- ora locale del salone (tenants.timezone), non UTC: e una regola, non un istante
create table working_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  staff_id uuid references staff_members(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),  -- ISO: 1 = lunedi
  opens time not null,
  closes time not null,
  check (closes > opens)
);
create index working_hours_tenant_idx on working_hours (tenant_id, weekday);
create index working_hours_staff_idx on working_hours (staff_id, weekday);

-- indisponibilita: chiusure del salone (staff_id null), pause, ferie
create table time_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  staff_id uuid references staff_members(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text not null default 'other' check (reason in ('break','holiday','closure','other')),
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index time_blocks_staff_idx on time_blocks (staff_id, start_at);
create index time_blocks_tenant_idx on time_blocks (tenant_id, start_at);

-- ---------------------------------------------------------------------------
-- clienti e appuntamenti
-- ---------------------------------------------------------------------------

-- cliente DEL SALONE (rubrica). profile_id se ha l'app; null se inserito a mano
create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email citext,
  birthday date,
  notes text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  no_show_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id),
  unique (tenant_id, phone)
);
create index customers_tenant_name_idx on customers (tenant_id, full_name);
create index customers_profile_idx on customers (profile_id);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  staff_id uuid not null references staff_members(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','completed','cancelled','no_show')),
  source text not null check (source in ('app','web','staff')),
  customer_note text,
  staff_note text,
  total_cents int not null default 0 check (total_cents >= 0),
  currency char(3) not null default 'EUR',
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer','staff','system')),
  reminder_sent_at timestamptz,
  idempotency_key uuid unique,             -- doppio tap sul "Conferma"
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  -- nessun operatore puo avere due appuntamenti attivi sovrapposti
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending','confirmed'))
);
create index appointments_tenant_start_idx on appointments (tenant_id, start_at);
create index appointments_staff_start_idx on appointments (staff_id, start_at);
create index appointments_customer_idx on appointments (customer_id, start_at desc);
create index appointments_reminder_idx on appointments (start_at)
  where status = 'confirmed' and reminder_sent_at is null;

-- servizi dell'appuntamento, con prezzo e durata congelati al momento della prenotazione
create table appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  name text not null,
  duration_min int not null check (duration_min > 0),
  price_cents int not null check (price_cents >= 0),
  position smallint not null default 0
);
create index appointment_services_appt_idx on appointment_services (appointment_id);
create index appointment_services_service_idx on appointment_services (service_id);

-- ---------------------------------------------------------------------------
-- notifiche
-- ---------------------------------------------------------------------------
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,              -- Expo push token
  app text not null check (app in ('client','business')),
  platform text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on push_tokens (user_id);

create table message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  channel text not null check (channel in ('whatsapp','sms','email','push')),
  template text not null,                  -- es. 'reminder_v1'
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','failed')),
  provider_message_id text unique,
  error text,
  cost_cents int,                          -- per fatturare i messaggi (S54)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_log_tenant_idx on message_log (tenant_id, created_at desc);
create index message_log_appt_idx on message_log (appointment_id);

-- ---------------------------------------------------------------------------
-- webhook in arrivo: idempotenza (Stripe e Meta ritentano)
-- ---------------------------------------------------------------------------
create table webhook_events (
  provider text not null check (provider in ('stripe','whatsapp')),
  event_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger t_profiles_upd before update on profiles for each row execute function set_updated_at();
create trigger t_tenants_upd before update on tenants for each row execute function set_updated_at();
create trigger t_staff_upd before update on staff_members for each row execute function set_updated_at();
create trigger t_services_upd before update on services for each row execute function set_updated_at();
create trigger t_customers_upd before update on customers for each row execute function set_updated_at();
create trigger t_appointments_upd before update on appointments for each row execute function set_updated_at();
create trigger t_message_log_upd before update on message_log for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- prenotazione atomica (F01, F02, F07): unica porta d'ingresso per creare appuntamenti
-- ---------------------------------------------------------------------------
create or replace function book_appointment(
  p_tenant_id uuid,
  p_staff_id uuid,
  p_service_ids uuid[],
  p_start_at timestamptz,
  p_customer_id uuid,          -- null = cliente app: usa/crea il customer del profilo
  p_source text,
  p_note text,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant tenants;
  v_is_staff boolean := is_member(p_tenant_id);
  v_customer uuid := p_customer_id;
  v_duration int;
  v_total int;
  v_end timestamptz;
  v_id uuid;
begin
  select id into v_id from appointments where idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select * into v_tenant from tenants where id = p_tenant_id;
  if v_tenant.id is null then raise exception 'tenant_not_found'; end if;

  if not v_is_staff then
    if auth.uid() is null then raise exception 'auth_required'; end if;
    if not tenant_is_public(p_tenant_id) then raise exception 'booking_closed'; end if;
    if p_source = 'staff' then raise exception 'forbidden'; end if;
    if p_start_at < now() + make_interval(mins => v_tenant.min_notice_min) then
      raise exception 'too_late';
    end if;
    if p_start_at > now() + make_interval(days => v_tenant.max_advance_days) then
      raise exception 'too_far';
    end if;
    -- il cliente app prenota sempre per se stesso
    insert into customers (tenant_id, profile_id, full_name, phone, email)
      select p_tenant_id, p.id, coalesce(p.full_name, 'Cliente'), p.phone, p.email
      from profiles p where p.id = auth.uid()
    on conflict (tenant_id, profile_id) do update set updated_at = now()
    returning id into v_customer;
  elsif v_customer is null then
    raise exception 'customer_required';
  end if;

  -- servizi validi, attivi, fatti da quell'operatore
  select sum(s.duration_min), sum(s.price_cents) into v_duration, v_total
  from services s
  join service_staff ss on ss.service_id = s.id and ss.staff_id = p_staff_id
  where s.id = any(p_service_ids) and s.tenant_id = p_tenant_id and s.active
    and (v_is_staff or s.bookable_online);
  if v_duration is null
     or (select count(*) from services s
         join service_staff ss on ss.service_id = s.id and ss.staff_id = p_staff_id
         where s.id = any(p_service_ids)) <> cardinality(p_service_ids) then
    raise exception 'invalid_services';
  end if;
  v_end := p_start_at + make_interval(mins => v_duration);

  -- serializza le prenotazioni per operatore, poi controlla i blocchi
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id::text, 0));
  if exists (select 1 from time_blocks b
             where b.tenant_id = p_tenant_id
               and (b.staff_id = p_staff_id or b.staff_id is null)
               and tstzrange(b.start_at, b.end_at) && tstzrange(p_start_at, v_end)) then
    raise exception 'slot_unavailable';
  end if;
  -- l'orario di lavoro lo verifica anche get_available_slots; qui e un controllo di sicurezza
  if not v_is_staff and not exists (
      select 1 from working_hours w
      where w.staff_id = p_staff_id
        and w.weekday = extract(isodow from p_start_at at time zone v_tenant.timezone)
        and (p_start_at at time zone v_tenant.timezone)::time >= w.opens
        and (v_end at time zone v_tenant.timezone)::time <= w.closes
        and (p_start_at at time zone v_tenant.timezone)::date
            = (v_end at time zone v_tenant.timezone)::date) then
    raise exception 'outside_hours';
  end if;

  begin
    insert into appointments (tenant_id, customer_id, staff_id, start_at, end_at, status,
                              source, customer_note, total_cents, currency,
                              idempotency_key, created_by)
    values (p_tenant_id, v_customer, p_staff_id, p_start_at, v_end,
            case when not v_is_staff and v_tenant.requires_approval then 'pending' else 'confirmed' end,
            p_source, p_note, v_total, v_tenant.currency, p_idempotency_key, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  insert into appointment_services (appointment_id, tenant_id, service_id, name, duration_min, price_cents, position)
  select v_id, p_tenant_id, s.id, s.name, s.duration_min, s.price_cents,
         array_position(p_service_ids, s.id)
  from services s where s.id = any(p_service_ids);

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table platform_admins enable row level security;
alter table tenants enable row level security;
alter table memberships enable row level security;
alter table staff_members enable row level security;
alter table service_categories enable row level security;
alter table services enable row level security;
alter table service_staff enable row level security;
alter table working_hours enable row level security;
alter table time_blocks enable row level security;
alter table customers enable row level security;
alter table appointments enable row level security;
alter table appointment_services enable row level security;
alter table push_tokens enable row level security;
alter table message_log enable row level security;
alter table webhook_events enable row level security;  -- nessuna policy: solo service role

-- profiles: ognuno il suo; lo staff vede i profili dei propri clienti tramite customers
create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on profiles for select using (is_platform_admin());

create policy platform_admins_read on platform_admins for select using (is_platform_admin());

-- tenants: pubblico in lettura se attivo (campi pubblici serviti dalla view public_tenants);
-- gestione al titolare/admin; console alla piattaforma
create policy tenants_member_read on tenants for select using (is_member(id) or is_platform_admin());
create policy tenants_owner_write on tenants for update using (has_role(id, array['owner','admin']))
  with check (has_role(id, array['owner','admin']));
-- creazione del tenant: edge function signup-tenant (service role), non dal client

create policy memberships_read on memberships for select using (is_member(tenant_id) or user_id = auth.uid() or is_platform_admin());
create policy memberships_owner on memberships for all using (has_role(tenant_id, array['owner']))
  with check (has_role(tenant_id, array['owner']));

-- dati del catalogo: leggibili da tutti se il salone e pubblico; scrivibili da owner/admin
create policy staff_public on staff_members for select using (tenant_is_public(tenant_id) and active and bookable_online);
create policy staff_member on staff_members for select using (is_member(tenant_id));
create policy staff_write on staff_members for all using (has_role(tenant_id, array['owner','admin']))
  with check (has_role(tenant_id, array['owner','admin']));

create policy cats_public on service_categories for select using (tenant_is_public(tenant_id) or is_member(tenant_id));
create policy cats_write on service_categories for all using (has_role(tenant_id, array['owner','admin']))
  with check (has_role(tenant_id, array['owner','admin']));

create policy services_public on services for select using ((tenant_is_public(tenant_id) and active and bookable_online) or is_member(tenant_id));
create policy services_write on services for all using (has_role(tenant_id, array['owner','admin']))
  with check (has_role(tenant_id, array['owner','admin']));

create policy service_staff_public on service_staff for select using (tenant_is_public(tenant_id) or is_member(tenant_id));
create policy service_staff_write on service_staff for all using (has_role(tenant_id, array['owner','admin']))
  with check (has_role(tenant_id, array['owner','admin']));

create policy hours_public on working_hours for select using (tenant_is_public(tenant_id) or is_member(tenant_id));
create policy hours_write on working_hours for all using (has_role(tenant_id, array['owner','admin']))
  with check (has_role(tenant_id, array['owner','admin']));

-- blocchi: lo staff li gestisce; il pubblico non li legge (gli slot arrivano da get_available_slots)
create policy blocks_member on time_blocks for all using (is_member(tenant_id)) with check (is_member(tenant_id));

-- clienti: solo lo staff del salone; il cliente vede la propria riga
create policy customers_member on customers for all using (is_member(tenant_id)) with check (is_member(tenant_id));
create policy customers_self on customers for select using (profile_id = auth.uid());

-- appuntamenti: staff tutto il salone; cliente solo i propri (creazione solo via book_appointment)
create policy appts_member on appointments for all using (is_member(tenant_id)) with check (is_member(tenant_id));
create policy appts_self on appointments for select using (
  exists (select 1 from customers c where c.id = customer_id and c.profile_id = auth.uid()));

create policy appt_services_member on appointment_services for all using (is_member(tenant_id)) with check (is_member(tenant_id));
create policy appt_services_self on appointment_services for select using (
  exists (select 1 from appointments a join customers c on c.id = a.customer_id
          where a.id = appointment_id and c.profile_id = auth.uid()));

create policy push_self on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy msg_member on message_log for select using (is_member(tenant_id) or is_platform_admin());

-- vista pubblica del salone: solo i campi da mostrare (niente stripe_*, niente email interne)
create view public_tenants with (security_invoker = false) as
  select id, slug, name, phone, address_line, city, postal_code, country, lat, lng,
         timezone, currency, logo_path, cover_path, description,
         slot_interval_min, min_notice_min, max_advance_days, cancel_window_min
  from tenants
  where status in ('trialing','active','past_due') and booking_enabled;
grant select on public_tenants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- FASE 2 (non nel MVP): da scrivere come migrazioni successive
-- ---------------------------------------------------------------------------
-- sales, sale_lines                    cassa (S33, S34)
-- products, stock_movements            magazzino (S35)
-- campaigns, campaign_recipients       marketing (S37)
-- vouchers, loyalty_accounts, referrals fidelity (S38)
-- waitlist_entries                     coda (S12, S39)
-- payments + tenants.stripe_account_id acconti con Stripe Connect (S41)
-- locations                            multi-sede
