-- BarberBooking: configurazione del progetto Supabase della DEMO (generato da supabase/build-demo-sql.mjs: non modificare a mano).
-- Incollalo tutto nello SQL Editor di un progetto VUOTO e premi Run. Poi esegui supabase/demo-staff.sql (vedi README).

-- ===== migrations/20261104000000_init.sql
-- BarberBooking: schema MVP (Supabase / Postgres 15+). Migrazione iniziale.
-- Test: supabase/tests (vedi l'intestazione di schema.test.sql).
-- SINGLE-TENANT: ogni installazione (un progetto Supabase) serve UN solo salone,
-- personalizzato per quel barbiere. Niente tenant_id: il salone e la riga unica di `salon`.
-- Accesso con Row Level Security. Tempi sempre timestamptz (UTC). Soldi in centesimi interi.
-- Le tabelle della fase 2 (cassa, magazzino, marketing, fidelity, coda) sono in fondo, commentate.

create extension if not exists btree_gist;
create extension if not exists citext;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- persone
-- ---------------------------------------------------------------------------

-- utente dell'app (cliente o staff): 1-1 con auth.users di Supabase
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,                              -- E.164; NON verificato (lo scrive l'utente): mai usarlo per dare accesso
  email citext unique,
  locale text not null default 'it',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- chi entra nel gestionale e con quale ruolo
create table staff_users (
  user_id uuid primary key references profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now()
);

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_users where user_id = auth.uid())
$$;

create or replace function has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_users where user_id = auth.uid() and role = any(roles))
$$;

-- ---------------------------------------------------------------------------
-- il salone (riga unica)
-- ---------------------------------------------------------------------------
create table salon (
  id boolean primary key default true check (id),   -- impone una sola riga
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
  instagram_url text,
  -- regole prenotazione online (S32)
  booking_enabled boolean not null default true,
  slot_interval_min int not null default 15 check (slot_interval_min in (5,10,15,20,30,60)),
  min_notice_min int not null default 60 check (min_notice_min >= 0),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  cancel_window_min int not null default 120 check (cancel_window_min >= 0),
  requires_approval boolean not null default false,
  reminder_hour smallint not null default 18 check (reminder_hour between 0 and 23), -- ora locale promemoria serale (F05)
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staff, servizi, orari
-- ---------------------------------------------------------------------------

-- operatore visibile in agenda e ai clienti (puo non avere un login)
create table staff_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references staff_users(user_id) on delete set null,
  display_name text not null,
  avatar_path text,
  color text not null default '1' check (color in ('1','2','3','4','5','6')), -- token staff-N dell'agenda
  sort_order int not null default 0,
  bookable_online boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_members_sort_idx on staff_members (sort_order);

create table service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
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
create index services_sort_idx on services (sort_order);
create index services_category_idx on services (category_id);

-- quali operatori fanno quale servizio
create table service_staff (
  service_id uuid not null references services(id) on delete cascade,
  staff_id uuid not null references staff_members(id) on delete cascade,
  primary key (service_id, staff_id)
);
create index service_staff_staff_idx on service_staff (staff_id);

-- orari settimanali: del salone (staff_id null) o del singolo operatore.
-- ora locale del salone (salon.timezone), non UTC: e una regola, non un istante
create table working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_members(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),  -- ISO: 1 = lunedi
  opens time not null,
  closes time not null,
  check (closes > opens)
);
create index working_hours_staff_idx on working_hours (staff_id, weekday);

-- indisponibilita: chiusure del salone (staff_id null), pause, ferie
create table time_blocks (
  id uuid primary key default gen_random_uuid(),
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
create index time_blocks_start_idx on time_blocks (start_at);

-- ---------------------------------------------------------------------------
-- clienti e appuntamenti
-- ---------------------------------------------------------------------------

-- scheda cliente del salone. profile_id se ha l'app; null se inserito a mano dal barbiere
create table customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  full_name text not null,
  phone text,                              -- non unico: due schede possono avere lo stesso numero
  email citext,
  birthday date,
  notes text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  no_show_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on customers (full_name);
create index customers_phone_idx on customers (phone);

create table appointments (
  id uuid primary key default gen_random_uuid(),
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
create index appointments_start_idx on appointments (start_at);
create index appointments_staff_start_idx on appointments (staff_id, start_at);
create index appointments_customer_idx on appointments (customer_id, start_at desc);
create index appointments_reminder_idx on appointments (start_at)
  where status = 'confirmed' and reminder_sent_at is null;

-- servizi dell'appuntamento, con prezzo e durata congelati al momento della prenotazione
create table appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
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
  appointment_id uuid references appointments(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  channel text not null check (channel in ('whatsapp','sms','email','push')),
  template text not null,                  -- es. 'reminder_v1'
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','failed')),
  provider_message_id text unique,
  error text,
  cost_cents int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_log_created_idx on message_log (created_at desc);
create index message_log_appt_idx on message_log (appointment_id);

-- webhook in arrivo: idempotenza (Stripe e Meta ritentano)
create table webhook_events (
  provider text not null check (provider in ('stripe','whatsapp')),
  event_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

create trigger t_profiles_upd before update on profiles for each row execute function set_updated_at();
create trigger t_salon_upd before update on salon for each row execute function set_updated_at();
create trigger t_staff_upd before update on staff_members for each row execute function set_updated_at();
create trigger t_services_upd before update on services for each row execute function set_updated_at();
create trigger t_customers_upd before update on customers for each row execute function set_updated_at();
create trigger t_appointments_upd before update on appointments for each row execute function set_updated_at();
create trigger t_message_log_upd before update on message_log for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- prenotazione atomica (F01, F02, F07): unica porta d'ingresso per creare appuntamenti
-- ---------------------------------------------------------------------------
create or replace function book_appointment(
  p_staff_id uuid,
  p_service_ids uuid[],
  p_start_at timestamptz,
  p_customer_id uuid,          -- null = cliente app: usa/crea la scheda del suo profilo
  p_source text,
  p_note text,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_salon salon;
  v_is_staff boolean := is_staff();
  v_customer uuid := p_customer_id;
  v_duration int;
  v_total int;
  v_end timestamptz;
  v_id uuid;
begin
  select id into v_id from appointments where idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select * into v_salon from salon limit 1;
  if v_salon.id is null then raise exception 'salon_not_configured'; end if;

  if not v_is_staff then
    if auth.uid() is null then raise exception 'auth_required'; end if;
    if not v_salon.booking_enabled then raise exception 'booking_closed'; end if;
    if p_source = 'staff' then raise exception 'forbidden'; end if;
    if p_start_at < now() + make_interval(mins => v_salon.min_notice_min) then
      raise exception 'too_late';
    end if;
    if p_start_at > now() + make_interval(days => v_salon.max_advance_days) then
      raise exception 'too_far';
    end if;
    -- il cliente app prenota sempre per se stesso. Se il barbiere lo aveva gia in rubrica
    -- con lo stesso telefono, la scheda si collega al profilo, MA solo se il telefono e
    -- verificato da Supabase Auth (OTP): altrimenti chiunque scrivendo un numero
    -- vedrebbe lo storico di un altro.
    select id into v_customer from customers where profile_id = auth.uid();
    if v_customer is null then
      update customers set profile_id = auth.uid()
       where id = (select c.id from customers c join auth.users u on u.id = auth.uid()
                    where u.phone_confirmed_at is not null and coalesce(u.phone, '') <> ''
                      and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(u.phone, '\D', '', 'g')
                      and c.profile_id is null
                    order by c.created_at limit 1)   -- piu schede con lo stesso numero: la piu vecchia
      returning id into v_customer;
    end if;
    if v_customer is null then
      insert into customers (profile_id, full_name, phone, email)
        select p.id, coalesce(p.full_name, 'Cliente'), p.phone, p.email
        from profiles p where p.id = auth.uid()
      returning id into v_customer;
    end if;
  elsif v_customer is null then
    raise exception 'customer_required';
  end if;

  -- servizi validi, attivi, fatti da quell'operatore
  select sum(s.duration_min), sum(s.price_cents) into v_duration, v_total
  from services s
  join service_staff ss on ss.service_id = s.id and ss.staff_id = p_staff_id
  where s.id = any(p_service_ids) and s.active and (v_is_staff or s.bookable_online);
  if v_duration is null or (select count(*) from services s
        join service_staff ss on ss.service_id = s.id and ss.staff_id = p_staff_id
        where s.id = any(p_service_ids) and s.active and (v_is_staff or s.bookable_online))
        <> cardinality(p_service_ids) then
    raise exception 'invalid_services';
  end if;
  v_end := p_start_at + make_interval(mins => v_duration);

  -- serializza le prenotazioni per operatore, poi controlla i blocchi
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id::text, 0));
  if exists (select 1 from time_blocks b
             where (b.staff_id = p_staff_id or b.staff_id is null)
               and tstzrange(b.start_at, b.end_at) && tstzrange(p_start_at, v_end)) then
    raise exception 'slot_unavailable';
  end if;
  -- l'orario di lavoro lo verifica anche fn/availability; qui e un controllo di sicurezza
  if not v_is_staff and not exists (
      select 1 from working_hours w
      where w.staff_id = p_staff_id
        and w.weekday = extract(isodow from p_start_at at time zone v_salon.timezone)
        and (p_start_at at time zone v_salon.timezone)::time >= w.opens
        and (v_end at time zone v_salon.timezone)::time <= w.closes
        and (p_start_at at time zone v_salon.timezone)::date
            = (v_end at time zone v_salon.timezone)::date) then
    raise exception 'outside_hours';
  end if;

  begin
    insert into appointments (customer_id, staff_id, start_at, end_at, status, source,
                              customer_note, total_cents, currency, idempotency_key, created_by)
    values (v_customer, p_staff_id, p_start_at, v_end,
            case when not v_is_staff and v_salon.requires_approval then 'pending' else 'confirmed' end,
            p_source, p_note, v_total, v_salon.currency, p_idempotency_key, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  insert into appointment_services (appointment_id, service_id, name, duration_min, price_cents, position)
  select v_id, s.id, s.name, s.duration_min, s.price_cents, array_position(p_service_ids, s.id)
  from services s where s.id = any(p_service_ids);

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table staff_users enable row level security;
alter table salon enable row level security;
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

create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff on profiles for select using (is_staff());

create policy staff_users_read on staff_users for select using (is_staff());
create policy staff_users_owner on staff_users for all using (has_role(array['owner']))
  with check (has_role(array['owner']));

-- il salone e pubblico in lettura (i campi sono tutti pubblici); lo modifica owner/admin
create policy salon_public on salon for select using (true);
create policy salon_write on salon for update using (has_role(array['owner','admin']))
  with check (has_role(array['owner','admin']));

-- catalogo: pubblico in lettura se prenotabile; scrittura owner/admin
create policy staff_public on staff_members for select using ((active and bookable_online) or is_staff());
create policy staff_write on staff_members for all using (has_role(array['owner','admin']))
  with check (has_role(array['owner','admin']));

create policy cats_public on service_categories for select using (true);
create policy cats_write on service_categories for all using (has_role(array['owner','admin']))
  with check (has_role(array['owner','admin']));

create policy services_public on services for select using ((active and bookable_online) or is_staff());
create policy services_write on services for all using (has_role(array['owner','admin']))
  with check (has_role(array['owner','admin']));

create policy service_staff_public on service_staff for select using (true);
create policy service_staff_write on service_staff for all using (has_role(array['owner','admin']))
  with check (has_role(array['owner','admin']));

create policy hours_public on working_hours for select using (true);
create policy hours_write on working_hours for all using (has_role(array['owner','admin']))
  with check (has_role(array['owner','admin']));

-- blocchi: solo staff (al pubblico arrivano solo gli slot liberi da fn/availability)
create policy blocks_staff on time_blocks for all using (is_staff()) with check (is_staff());

-- clienti: staff tutto; il cliente vede la propria scheda
create policy customers_staff on customers for all using (is_staff()) with check (is_staff());
create policy customers_self on customers for select using (profile_id = auth.uid());

-- appuntamenti: staff tutto; cliente solo i propri (creazione solo via book_appointment)
create policy appts_staff on appointments for all using (is_staff()) with check (is_staff());
create policy appts_self on appointments for select using (
  exists (select 1 from customers c where c.id = customer_id and c.profile_id = auth.uid()));

create policy appt_services_staff on appointment_services for all using (is_staff()) with check (is_staff());
create policy appt_services_self on appointment_services for select using (
  exists (select 1 from appointments a join customers c on c.id = a.customer_id
          where a.id = appointment_id and c.profile_id = auth.uid()));

create policy push_self on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy msg_staff on message_log for select using (is_staff());

-- ---------------------------------------------------------------------------
-- profilo creato in automatico per ogni utente di Supabase Auth (anche anonimo)
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, phone)
  values (new.id,
          nullif(new.email, ''),
          case when coalesce(new.phone, '') <> '' then '+' || ltrim(new.phone, '+') end)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- orari liberi (F01, F02, F07). Stessa logica di packages/core/src/slots.ts.
-- Security definer: chiunque puo chiederli, ma riceve SOLO gli slot, mai pause o appuntamenti altrui.
-- p_staff_id null = "primo disponibile": uno slot per orario, all'operatore con meno appuntamenti quel giorno.
-- ---------------------------------------------------------------------------
create or replace function get_available_slots(p_service_ids uuid[], p_staff_id uuid, p_day date)
returns table (start_at timestamptz, end_at timestamptz, staff_id uuid)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_salon salon;
  v_is_staff boolean := is_staff();
  v_dur int;
  v_n int;
begin
  select * into v_salon from salon limit 1;
  if v_salon.id is null or (not v_is_staff and not v_salon.booking_enabled) then return; end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 then return; end if;

  select count(*), sum(s.duration_min) into v_n, v_dur
  from services s
  where s.id = any(p_service_ids) and s.active and (v_is_staff or s.bookable_online);
  if v_n <> cardinality(p_service_ids) then return; end if;

  return query
  with eligible as (
    select st.id as sid, st.sort_order
    from staff_members st
    where st.active and (v_is_staff or st.bookable_online)
      and (p_staff_id is null or st.id = p_staff_id)
      and (select count(*) from service_staff ss
           where ss.staff_id = st.id and ss.service_id = any(p_service_ids)) = cardinality(p_service_ids)
  ),
  cand as (
    select e.sid, e.sort_order,
           ((p_day + w.opens + make_interval(mins => g * v_salon.slot_interval_min)) at time zone v_salon.timezone) as s
    from eligible e
    join working_hours w on w.staff_id = e.sid and w.weekday = extract(isodow from p_day)
    cross join lateral generate_series(
      0, floor((extract(epoch from (w.closes - w.opens)) / 60 - v_dur) / v_salon.slot_interval_min)::int) g
  ),
  free as (
    select c.sid, c.sort_order, c.s, c.s + make_interval(mins => v_dur) as e
    from cand c
    where (c.s at time zone v_salon.timezone)::date = p_day        -- ore inesistenti nel cambio d'ora
      and (v_is_staff or (c.s >= now() + make_interval(mins => v_salon.min_notice_min)
                          and c.s <= now() + make_interval(days => v_salon.max_advance_days)))
      and not exists (select 1 from appointments a
                      where a.staff_id = c.sid and a.status in ('pending','confirmed')
                        and tstzrange(a.start_at, a.end_at) && tstzrange(c.s, c.s + make_interval(mins => v_dur)))
      and not exists (select 1 from time_blocks b
                      where (b.staff_id = c.sid or b.staff_id is null)
                        and tstzrange(b.start_at, b.end_at) && tstzrange(c.s, c.s + make_interval(mins => v_dur)))
  ),
  load as (
    select a.staff_id as sid, count(*) as n
    from appointments a
    where a.status in ('pending','confirmed') and (a.start_at at time zone v_salon.timezone)::date = p_day
    group by a.staff_id
  )
  select distinct on (f.s) f.s, f.e, f.sid
  from free f left join load l on l.sid = f.sid
  order by f.s, coalesce(l.n, 0), f.sort_order;
end $$;

-- ---------------------------------------------------------------------------
-- annullamento (F03): il cliente solo i propri e fuori dalla finestra; lo staff sempre
-- ---------------------------------------------------------------------------
create or replace function cancel_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a appointments;
  v_salon salon;
begin
  select * into a from appointments where id = p_id for update;
  if a.id is null then raise exception 'forbidden'; end if;
  if is_staff() then
    update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = 'staff' where id = p_id;
    return;
  end if;
  if not exists (select 1 from customers c where c.id = a.customer_id and c.profile_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if a.status not in ('pending','confirmed') then raise exception 'forbidden'; end if;
  select * into v_salon from salon limit 1;
  if a.start_at < now() + make_interval(mins => v_salon.cancel_window_min) then raise exception 'too_late'; end if;
  update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer' where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- numeri della dashboard "Oggi" (S22), solo staff
-- ---------------------------------------------------------------------------
create or replace function day_stats(p_day date) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_out json;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select timezone into v_tz from salon limit 1;
  select json_build_object(
    'date', p_day,
    'appointments', count(*) filter (where d = p_day and status <> 'cancelled'),
    'expectedCents', coalesce(sum(total_cents) filter (where d = p_day and status not in ('cancelled','no_show')), 0),
    'noShowsThisMonth', count(*) filter (where status = 'no_show' and date_trunc('month', d) = date_trunc('month', p_day)),
    'sameWeekdayLastWeek', count(*) filter (where d = p_day - 7 and status <> 'cancelled'))
  into v_out
  from (select status, total_cents, (start_at at time zone coalesce(v_tz, 'Europe/Rome'))::date as d
        from appointments
        where start_at >= (date_trunc('month', p_day) - interval '8 days')
          and start_at < (p_day + 1)::timestamp + interval '1 day') x;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- cancellazione dell'account (GDPR, obbligatoria per Apple): elimina l'utente di Auth
-- (e con lui profilo e token push); la scheda nella rubrica del barbiere resta per lo storico
-- del salone ma senza dati personali; gli appuntamenti futuri vengono annullati.
-- ---------------------------------------------------------------------------
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  if is_staff() then raise exception 'forbidden'; end if;   -- lo staff si rimuove dal titolare, non da qui
  update appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer'
   where customer_id in (select id from customers where profile_id = v_uid)
     and status in ('pending','confirmed') and start_at > now();
  update customers set full_name = 'Cliente eliminato', phone = null, email = null, birthday = null,
                       notes = null, marketing_consent = false, profile_id = null
   where profile_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- Permessi delle funzioni. In Postgres l'esecuzione e concessa a PUBLIC per default: la togliamo
-- e la diamo solo a chi serve. Gli utenti "anonymous sign-in" di Supabase sono 'authenticated'.
revoke execute on function book_appointment(uuid, uuid[], timestamptz, uuid, text, text, uuid) from public;
revoke execute on function cancel_appointment(uuid) from public;
revoke execute on function day_stats(date) from public;
revoke execute on function get_available_slots(uuid[], uuid, date) from public;
revoke execute on function handle_new_user() from public;
revoke execute on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
grant execute on function book_appointment(uuid, uuid[], timestamptz, uuid, text, text, uuid) to authenticated;
grant execute on function cancel_appointment(uuid) to authenticated;
grant execute on function day_stats(date) to authenticated;
grant execute on function get_available_slots(uuid[], uuid, date) to anon, authenticated;

-- Accesso alle tabelle tramite la Data API. Supabase di solito lo concede da solo; lo rendiamo esplicito
-- perche nei progetti nuovi l'esposizione automatica puo essere disattivata. Chi vede cosa lo decide la RLS.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on webhook_events from anon, authenticated;

-- agenda in tempo reale sul gestionale (solo su Supabase, dove la publication esiste)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table appointments;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- FASE 2 (non nel MVP): da scrivere come migrazioni successive
-- ---------------------------------------------------------------------------
-- sales, sale_lines                    cassa (S33, S34)
-- products, stock_movements            magazzino (S35)
-- campaigns, campaign_recipients       marketing (S37)
-- vouchers, loyalty_accounts, referrals fidelity (S38)
-- waitlist_entries                     coda (S12, S39)
-- payments + salon.stripe_account_id   acconti online (S41): Stripe sull'account del barbiere

-- ===== seed.sql
-- Dati demo (inventati, nessuna persona reale). Stessi di packages/api/src/fake/seed.ts.
-- Le date sono relative a quando si esegue il file: oggi, domani e la settimana scorsa hanno appuntamenti.
-- Si puo rieseguire: prima svuota i dati del salone (non tocca gli utenti di Auth).

truncate appointment_services, appointments, time_blocks, customers, working_hours, service_staff,
         services, service_categories, staff_members, salon restart identity cascade;

insert into salon (name, phone, email, address_line, city, postal_code, description)
values ('Barberia Demo', '+39 06 0000000', 'demo@example.com', 'Via di Prova 1', 'Roma', '00100',
        'Barberia di quartiere: tagli classici e moderni, barba con panno caldo.');

insert into staff_members (id, display_name, color, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', 'Marco', '1', 0),
  ('a0000000-0000-4000-8000-000000000002', 'Luca', '2', 1),
  ('a0000000-0000-4000-8000-000000000003', 'Giulia', '3', 2);

insert into service_categories (id, name, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', 'Capelli', 0),
  ('c0000000-0000-4000-8000-000000000002', 'Barba', 1);

insert into services (id, category_id, name, description, duration_min, price_cents, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Taglio', 'Lavaggio, taglio e piega.', 30, 2000, 0),
  ('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'Barba', 'Rifinitura e contorno con panno caldo.', 15, 1000, 1),
  ('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'Rasatura tradizionale', 'Con rasoio a mano libera.', 30, 1800, 2),
  ('b0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'Taglio bambino', 'Fino a 12 anni.', 20, 1500, 3),
  ('b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'Sfumatura', null, 45, 2500, 4),
  ('b0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'Colore', null, 60, 3500, 5);

-- chi fa cosa: M = Marco, L = Luca, G = Giulia
insert into service_staff (service_id, staff_id)
select s::uuid, st::uuid from (values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003')) v(s, st);

-- martedi-sabato; Marco e Luca con pausa pranzo, Giulia orario continuato; lunedi e domenica chiuso
insert into working_hours (staff_id, weekday, opens, closes)
select st::uuid, d, o::time, c::time
from generate_series(2, 6) d,
     (values ('a0000000-0000-4000-8000-000000000001', '09:00', '13:00'),
             ('a0000000-0000-4000-8000-000000000001', '15:00', '19:30'),
             ('a0000000-0000-4000-8000-000000000002', '09:00', '12:30'),
             ('a0000000-0000-4000-8000-000000000002', '14:30', '19:00'),
             ('a0000000-0000-4000-8000-000000000003', '10:00', '18:00')) h(st, o, c);

insert into customers (id, full_name, phone)
select ('d0000000-0000-4000-8000-00000000000' || i)::uuid, n, '+39333000' || lpad(i::text, 4, '0')
from unnest(array['Riccardo Bianchi', 'Giorgio Verdi', 'Federico Neri', 'Andrea Russo', 'Edoardo Gallo',
                  'Simone Conti', 'Tommaso Greco', 'Lorenzo Costa']) with ordinality as t(n, i);

-- appuntamenti: oggi, domani (se sono giorni lavorativi lo vedi in agenda) e lo stesso giorno della settimana scorsa
do $$
declare
  d date;
  base date := (now() at time zone 'Europe/Rome')::date;
  r record;
  v_start timestamptz;
  v_id uuid;
  v_dur int;
  v_tot int;
begin
  foreach d in array array[base, base + 1, base - 7] loop
    for r in select * from (values
      ('09:00', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', array['b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002'], case when d < base then 'completed' else 'confirmed' end),
      ('10:30', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', array['b0000000-0000-4000-8000-000000000001'], 'confirmed'),
      ('09:15', 'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', array['b0000000-0000-4000-8000-000000000001'], case when d = base then 'completed' else 'confirmed' end),
      ('11:00', 'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', array['b0000000-0000-4000-8000-000000000005'], case when d = base then 'pending' else 'confirmed' end),
      ('10:00', 'a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004', array['b0000000-0000-4000-8000-000000000006'], 'confirmed'),
      ('16:00', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', array['b0000000-0000-4000-8000-000000000003'], case when d = base + 1 then 'skip' else 'confirmed' end)
    ) as x(t, staff, cust, svcs, st)
    loop
      continue when r.st = 'skip';
      v_start := (d + r.t::time) at time zone 'Europe/Rome';
      select sum(duration_min), sum(price_cents) into v_dur, v_tot from services where id = any(r.svcs::uuid[]);
      insert into appointments (customer_id, staff_id, start_at, end_at, status, source, total_cents)
      values (r.cust::uuid, r.staff::uuid, v_start, v_start + make_interval(mins => v_dur), r.st, 'staff', v_tot)
      returning id into v_id;
      insert into appointment_services (appointment_id, service_id, name, duration_min, price_cents, position)
      select v_id, s.id, s.name, s.duration_min, s.price_cents, array_position(r.svcs::uuid[], s.id)
      from services s where s.id = any(r.svcs::uuid[]);
    end loop;
  end loop;
  -- pausa pranzo di Giulia oggi e domani
  insert into time_blocks (staff_id, start_at, end_at, reason, note)
  select 'a0000000-0000-4000-8000-000000000003', (x + time '12:00') at time zone 'Europe/Rome',
         (x + time '13:00') at time zone 'Europe/Rome', 'break', 'Pausa pranzo'
  from unnest(array[base, base + 1]) x;
end $$;
