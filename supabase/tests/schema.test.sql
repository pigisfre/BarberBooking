-- Test dello schema. Si verificano da soli: al primo controllo fallito lo script si ferma con errore.
-- Uso: bash supabase/tests/run.sh   (crea un database vuoto, carica stub + migrazioni + questo file)
\set ON_ERROR_STOP 1
\set QUIET 1

create schema tests;
create function tests.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', name; end if;
  raise notice 'ok   %', name;
end $$;
-- esegue sql con i permessi di chi chiama e verifica che fallisca con quel codice
create function tests.err(sql text, code text, name text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm like '%' || code || '%' then raise notice 'ok   %', name; return; end if;
    raise exception 'FAIL: % (errore diverso: %)', name, sqlerrm;
  end;
  raise exception 'FAIL: % (nessun errore, atteso %)', name, code;
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- privilegi come su Supabase (che li concede di default ad anon e authenticated)
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- ------------------------------------------------------------------ seed
-- A titolare, B e C clienti con app (C ha il telefono VERIFICATO), D anonimo che finge il numero di E
insert into auth.users (id, email, phone, phone_confirmed_at, is_anonymous) values
 ('00000000-0000-0000-0000-00000000000a', 'titolare@test', null, null, false),
 ('00000000-0000-0000-0000-00000000000b', null, null, null, true),
 ('00000000-0000-0000-0000-00000000000c', null, '390000000003', now(), false),
 ('00000000-0000-0000-0000-00000000000d', null, null, null, true);
select tests.ok((select count(*) = 4 from profiles), 'il trigger crea un profilo per ogni utente di Auth');
select tests.ok((select phone = '+390000000003' from profiles where id = '00000000-0000-0000-0000-00000000000c'), 'il profilo riceve il telefono verificato con il +');
update profiles set full_name = 'Cliente Uno', phone = '+390000000002' where id = '00000000-0000-0000-0000-00000000000b';
update profiles set full_name = 'Cliente Due' where id = '00000000-0000-0000-0000-00000000000c';
update profiles set full_name = 'Furbetto', phone = '+390000000005' where id = '00000000-0000-0000-0000-00000000000d';

insert into salon (name) values ('Barberia Test');
insert into staff_users (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'owner');
insert into staff_members (id, user_id, display_name, sort_order) values
 ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Marco', 0),
 ('20000000-0000-0000-0000-000000000002', null, 'Luca', 1);
insert into services (id, name, duration_min, price_cents) values
 ('30000000-0000-0000-0000-000000000001', 'Taglio', 30, 2000),
 ('30000000-0000-0000-0000-000000000002', 'Barba', 15, 1000);
insert into services (id, name, duration_min, price_cents, active) values
 ('30000000-0000-0000-0000-000000000003', 'Vecchio servizio', 30, 1500, false);
insert into service_staff values
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');
insert into working_hours (staff_id, weekday, opens, closes)
  select s, d, '09:00', '19:00' from generate_series(1, 7) d,
  unnest(array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::uuid[]) s;
-- schede inserite a mano dal barbiere: C (che poi verifichera il telefono) ed E (che non usa l'app)
insert into customers (full_name, phone) values ('Cliente Due (rubrica)', '+39 000 000 0003'), ('Cliente E (rubrica)', '+390000000005');

create temp table v as
  select ((now() at time zone 'Europe/Rome')::date + 1) as day,
         (((now() at time zone 'Europe/Rome')::date + 1) + time '10:00') at time zone 'Europe/Rome' as slot;
grant select on v to anon, authenticated;
create function tests.slot(plus interval) returns timestamptz language sql as $$ select slot + plus from v $$;
create function tests.slot_times(services uuid[], staff uuid, day date) returns text[] language sql as $$
  select array_agg(to_char(start_at at time zone 'Europe/Rome', 'HH24:MI') order by start_at)
  from get_available_slots(services, staff, day) $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ------------------------------------------------------------------ prenotazione
set role authenticated;
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000a', false);
select tests.err($$ insert into salon (name) values ('Altro') $$, 'row-level security', 'non si puo creare un secondo salone');

select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000b', false);
select tests.ok((select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002']::uuid[],
  tests.slot('0'), null, 'app', null, '40000000-0000-0000-0000-000000000001') is not null), 'B prenota taglio + barba');
select tests.ok((select end_at - start_at = interval '45 min' and total_cents = 3000 from appointments), 'durata 45 minuti e totale 30 euro');
select tests.ok((select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001']::uuid[],
  tests.slot('0'), null, 'app', null, '40000000-0000-0000-0000-000000000001') is not null)
  and (select count(*) = 1 from appointments), 'doppio tap: stessa chiave, un solo appuntamento');

select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000c', false);
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001']::uuid[],
  tests.slot('30 min'), null, 'app', null, '40000000-0000-0000-0000-000000000002') $$, 'slot_unavailable', 'slot sovrapposto rifiutato');
select tests.ok((select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001']::uuid[],
  tests.slot('45 min'), null, 'app', null, '40000000-0000-0000-0000-000000000003') is not null), 'slot subito dopo accettato');
select tests.ok((select count(*) = 1 and bool_and(full_name = 'Cliente Due (rubrica)') from customers),
  'telefono verificato: la scheda del barbiere si collega a C (nessun doppione)');
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001']::uuid[],
  tests.slot('8 hours 45 min'), null, 'app', null, '40000000-0000-0000-0000-000000000004') $$, 'outside_hours', 'oltre la chiusura rifiutato');
select tests.ok((select count(*) = 1 from appointments), 'C vede solo i propri appuntamenti');
select tests.err($$ insert into appointments (customer_id, staff_id, start_at, end_at, source)
  select customer_id, staff_id, start_at + interval '3 hours', end_at + interval '3 hours', 'app' from appointments limit 1 $$,
  'row-level security', 'inserimento diretto bloccato');
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000009']::uuid[],
  tests.slot('3 hours'), null, 'app', null, '40000000-0000-0000-0000-000000000005') $$, 'invalid_services', 'servizio inesistente');
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000003']::uuid[],
  tests.slot('3 hours'), null, 'app', null, '40000000-0000-0000-0000-000000000006') $$, 'invalid_services', 'servizio disattivato');
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000002', array['30000000-0000-0000-0000-000000000002']::uuid[],
  tests.slot('3 hours'), null, 'app', null, '40000000-0000-0000-0000-000000000007') $$, 'invalid_services', 'servizio che l operatore non fa');
update salon set name = 'Hackerato';
select tests.ok((select name = 'Barberia Test' from salon), 'il cliente non modifica il salone (0 righe)');

-- D e anonimo e ha scritto il numero di E: NON deve agganciarsi alla scheda di E
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000d', false);
select tests.ok((select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001']::uuid[],
  tests.slot('4 hours'), null, 'app', null, '40000000-0000-0000-0000-000000000008') is not null), 'D (anonimo) prenota');
select tests.ok((select count(*) = 1 and bool_and(full_name = 'Furbetto') from customers),
  'telefono NON verificato: D ottiene una scheda nuova, non quella di E');

-- ------------------------------------------------------------------ pause, slot liberi
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into time_blocks (staff_id, start_at, end_at, reason)
  values ('20000000-0000-0000-0000-000000000001', tests.slot('5 hours'), tests.slot('6 hours'), 'break');
select tests.ok((select count(*) = 3 from appointments), 'il titolare vede tutti gli appuntamenti');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000c', false);
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000002']::uuid[],
  tests.slot('5 hours 15 min'), null, 'app', null, '40000000-0000-0000-0000-000000000009') $$, 'slot_unavailable', 'prenotare su una pausa rifiutato');

-- giorno di prova: Marco occupato 10:00-10:45 (B), 10:45-11:15 (C), 14:00-14:30 (D), pausa 15:00-16:00
select tests.ok((select (tests.slot_times(array['30000000-0000-0000-0000-000000000001']::uuid[], '20000000-0000-0000-0000-000000000001', day))[1:4]
  = array['09:00','09:15','09:30','11:15'] from v), 'slot liberi di Marco: salta gli appuntamenti (intervalli semiaperti)');
select tests.ok((select not ('15:00' = any(t) or '15:45' = any(t) or '14:15' = any(t)) and '16:00' = any(t) and '18:30' = any(t) and not ('18:45' = any(t))
  from (select tests.slot_times(array['30000000-0000-0000-0000-000000000001']::uuid[], '20000000-0000-0000-0000-000000000001', day) t from v) x),
  'slot liberi di Marco: salta la pausa e finisce alla chiusura');
select tests.ok((select staff_id = '20000000-0000-0000-0000-000000000002' from get_available_slots(
  array['30000000-0000-0000-0000-000000000001']::uuid[], null, (select day from v))
  where to_char(start_at at time zone 'Europe/Rome', 'HH24:MI') = '09:00'), 'primo disponibile: alle 9:00 va a Luca, meno carico');
select tests.ok((select count(*) = count(distinct start_at) from get_available_slots(array['30000000-0000-0000-0000-000000000001']::uuid[], null, (select day from v))),
  'primo disponibile: un solo slot per orario');
select tests.ok((select count(*) = 0 from get_available_slots(array['30000000-0000-0000-0000-000000000002']::uuid[], '20000000-0000-0000-0000-000000000002', (select day from v))),
  'nessuno slot per un servizio che l operatore non fa');
select tests.ok((select count(*) = 0 from get_available_slots(array['30000000-0000-0000-0000-000000000001']::uuid[], null, (select day + 70 from v))),
  'nessuno slot oltre l anticipo massimo (60 giorni)');

-- ------------------------------------------------------------------ annullamento
reset role;
create temp table c_appt as select a.id from appointments a join customers c on c.id = a.customer_id where c.profile_id = '00000000-0000-0000-0000-00000000000c';
create temp table b_appt as select a.id from appointments a join customers c on c.id = a.customer_id where c.profile_id = '00000000-0000-0000-0000-00000000000b';
grant select on c_appt, b_appt to authenticated;
set role authenticated;
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000b', false);
select tests.err(format('select cancel_appointment(%L)', (select id from c_appt)), 'forbidden', 'B non puo annullare l appuntamento di C');
select cancel_appointment((select id from b_appt));
select tests.ok((select status = 'cancelled' from appointments where id = (select id from b_appt)), 'B annulla il proprio (fuori dalla finestra di 2 ore)');
reset role;
-- un appuntamento di C tra un'ora: dentro la finestra
update appointments set start_at = now() + interval '1 hour', end_at = now() + interval '90 min' where id = (select id from c_appt);
set role authenticated;
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000c', false);
select tests.err(format('select cancel_appointment(%L)', (select id from c_appt)), 'too_late', 'C non annulla a meno di 2 ore');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000a', false);
select cancel_appointment((select id from c_appt));
select tests.ok((select status = 'cancelled' and cancelled_by = 'staff' from appointments where id = (select id from c_appt)), 'lo staff annulla sempre');

-- ------------------------------------------------------------------ statistiche e ora legale (come staff)
select tests.ok((select (day_stats((select day from v))->>'appointments')::int = 1 from (select 1) x), 'day_stats: 1 appuntamento attivo domani (D)');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000b', false);
select tests.err($$ select day_stats(current_date) $$, 'forbidden', 'day_stats vietato ai clienti');
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000a', false);
select tests.ok((select start_at = timestamptz '2027-03-28 07:00:00+00' from get_available_slots(
  array['30000000-0000-0000-0000-000000000001']::uuid[], '20000000-0000-0000-0000-000000000001', date '2027-03-28') order by start_at limit 1),
  'ora legale (28/3/2027): il primo slot delle 9:00 e alle 07:00 UTC');
select tests.ok((select start_at = timestamptz '2026-10-25 08:00:00+00' from get_available_slots(
  array['30000000-0000-0000-0000-000000000001']::uuid[], '20000000-0000-0000-0000-000000000001', date '2026-10-25') order by start_at limit 1),
  'ora solare (25/10/2026): il primo slot delle 9:00 e alle 08:00 UTC');

-- ------------------------------------------------------------------ cancellazione account
-- D (anonimo) ha un appuntamento futuro: lo cancella insieme all'account
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000d', false);
select delete_my_account();
reset role;
select tests.ok((select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000d')
  and (select count(*) = 0 from profiles where id = '00000000-0000-0000-0000-00000000000d'), 'cancellazione: utente e profilo eliminati');
select tests.ok((select count(*) = 0 from customers where full_name = 'Furbetto' or phone = '+390000000005' and profile_id is not null)
  and (select count(*) = 1 from customers where full_name = 'Cliente eliminato' and phone is null), 'cancellazione: la scheda resta ma senza dati personali');
select tests.ok((select bool_and(a.status = 'cancelled') from appointments a join customers c on c.id = a.customer_id where c.full_name = 'Cliente eliminato'),
  'cancellazione: gli appuntamenti futuri sono annullati');
set role authenticated;
select set_config('request.jwt.sub', '00000000-0000-0000-0000-00000000000a', false);
select tests.err($$ select delete_my_account() $$, 'forbidden', 'cancellazione: lo staff non si cancella da qui');

-- ------------------------------------------------------------------ anonimi (non loggati)
reset role;
select set_config('request.jwt.sub', '', false);
set role anon;
select tests.ok((select count(*) = 1 from salon) and (select count(*) = 2 from services) and (select count(*) = 0 from customers)
  and (select count(*) = 0 from appointments) and (select count(*) = 0 from time_blocks), 'anonimo: legge salone e servizi attivi, nient altro');
select tests.ok((select count(*) > 0 from get_available_slots(array['30000000-0000-0000-0000-000000000001']::uuid[], null, (select day from v))),
  'anonimo: puo chiedere gli orari liberi');
select tests.err($$ select book_appointment('20000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001']::uuid[],
  now() + interval '2 days', null, 'app', null, gen_random_uuid()) $$, 'permission denied', 'anonimo: non puo prenotare');
reset role;
\echo 'tutti i test dello schema passati'
