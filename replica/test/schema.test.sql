-- Test dello schema single-tenant.
-- Uso: in un database vuoto carica replica/test/supabase-stub.sql, poi replica/schema.sql, poi questo file.
-- Ogni caso stampa t/f o il codice d'errore atteso.
\set ON_ERROR_STOP 0
grant usage on schema public, auth to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public, auth to authenticated, anon;

-- seed: A titolare, B e C clienti con app, Marco operatore
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into profiles(id,full_name,phone) values
 ('00000000-0000-0000-0000-00000000000a','Titolare','+390000000001'),
 ('00000000-0000-0000-0000-00000000000b','Cliente Uno','+390000000002'),
 ('00000000-0000-0000-0000-00000000000c','Cliente Due','+390000000003');
insert into salon(name) values ('Barberia Test');
insert into staff_users(user_id,role) values ('00000000-0000-0000-0000-00000000000a','owner');
insert into staff_members(id,user_id,display_name) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Marco');
insert into services(id,name,duration_min,price_cents) values
 ('30000000-0000-0000-0000-000000000001','Taglio',30,2000),
 ('30000000-0000-0000-0000-000000000002','Barba',15,1000);
insert into services(id,name,duration_min,price_cents,active) values ('30000000-0000-0000-0000-000000000003','Vecchio servizio',30,1500,false);
insert into service_staff values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001');
insert into working_hours(staff_id,weekday,opens,closes) select '20000000-0000-0000-0000-000000000001',d,'09:00','19:00' from generate_series(1,7) d;
select (date_trunc('day', now() at time zone 'Europe/Rome') + interval '1 day 10 hours') at time zone 'Europe/Rome' as slot \gset

set role authenticated;

\echo '--- T0 seconda riga salon (atteso: ERROR, bloccata da RLS; e comunque impedita dal vincolo id = true)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
insert into salon(name) values ('Altro salone');

\echo '--- T1 titolare inserisce a mano il cliente C (walk-in, senza app)'
insert into customers(full_name, phone) values ('Cliente Due (rubrica)', '+390000000003');
select count(*) = 1 as t1_ok from customers;

\echo '--- T2 cliente B prenota taglio+barba (atteso: t, durata 45, totale 30 euro)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000b';
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002']::uuid[], :'slot', null,'app',null,'40000000-0000-0000-0000-000000000001') is not null as t2_ok;
select end_at - start_at = interval '45 min' as durata_ok, total_cents = 3000 as totale_ok from appointments;

\echo '--- T3 doppio tap, stesso idempotency_key (atteso: t, un solo appuntamento)'
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], :'slot', null,'app',null,'40000000-0000-0000-0000-000000000001') is not null as t3_ok;
select count(*) = 1 as t3_one_row from appointments;

\echo '--- T4 cliente C, slot sovrapposto 10:30 (atteso: ERROR slot_unavailable)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000c';
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], (:'slot'::timestamptz + interval '30 min'), null,'app',null,'40000000-0000-0000-0000-000000000002');

\echo '--- T5 cliente C alle 10:45, subito dopo (atteso: t)'
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], (:'slot'::timestamptz + interval '45 min'), null,'app',null,'40000000-0000-0000-0000-000000000003') is not null as t5_ok;

\echo '--- T6 la scheda inserita dal barbiere e stata collegata al profilo di C (atteso: t)'
select count(*) = 1 and bool_and(full_name = 'Cliente Due (rubrica)') as t6_linked from customers;

\echo '--- T7 cliente C alle 18:45, sfora la chiusura (atteso: ERROR outside_hours)'
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], (:'slot'::timestamptz + interval '8 hours 45 min'), null,'app',null,'40000000-0000-0000-0000-000000000004');

\echo '--- T8 cliente C vede solo i propri appuntamenti e la propria scheda (atteso: 1, 1)'
select (select count(*) from appointments) as appts, (select count(*) from customers) as customers;

\echo '--- T9 cliente C inserisce un appuntamento direttamente (atteso: ERROR row-level security)'
insert into appointments(customer_id,staff_id,start_at,end_at,source) select customer_id,staff_id,start_at+interval '3 hours',end_at+interval '3 hours','app' from appointments limit 1;

\echo '--- T10 servizio inesistente (atteso: ERROR invalid_services)'
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000009']::uuid[], (:'slot'::timestamptz + interval '3 hours'), null,'app',null,'40000000-0000-0000-0000-000000000005');

\echo '--- T11 servizio disattivato (atteso: ERROR invalid_services)'
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000003']::uuid[], (:'slot'::timestamptz + interval '3 hours'), null,'app',null,'40000000-0000-0000-0000-000000000007');

\echo '--- T12 titolare mette una pausa alle 15:00; cliente prova a prenotare li (atteso: 2, poi ERROR slot_unavailable)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
insert into time_blocks(staff_id,start_at,end_at,reason) values ('20000000-0000-0000-0000-000000000001',:'slot'::timestamptz + interval '5 hours',:'slot'::timestamptz + interval '6 hours','break');
select count(*) as t12_owner_sees_all from appointments;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000c';
select book_appointment('20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000002']::uuid[], (:'slot'::timestamptz + interval '5 hours 15 min'), null,'app',null,'40000000-0000-0000-0000-000000000006');

\echo '--- T13 cliente non puo modificare il salone (atteso: 0 righe aggiornate)'
update salon set name = 'Hackerato';
select name = 'Barberia Test' as t13_ok from salon;

\echo '--- T14 anonimo: legge salone e servizi attivi, non clienti ne appuntamenti (atteso: 1, 2, 0, 0)'
reset request.jwt.sub; set role anon;
select (select count(*) from salon) as salon, (select count(*) from services) as services,
       (select count(*) from customers) as customers, (select count(*) from appointments) as appts;
