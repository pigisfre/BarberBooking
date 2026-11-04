-- Test dello schema: carica prima replica/test/supabase-stub.sql e replica/schema.sql in un db vuoto.
\set ON_ERROR_STOP 0
grant usage on schema public, auth to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public, auth to authenticated, anon;
-- seed
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into profiles(id,full_name,phone) values
 ('00000000-0000-0000-0000-00000000000a','Titolare','+390000000001'),
 ('00000000-0000-0000-0000-00000000000b','Cliente Uno','+390000000002'),
 ('00000000-0000-0000-0000-00000000000c','Cliente Due','+390000000003');
insert into tenants(id,slug,name) values ('10000000-0000-0000-0000-000000000001','barberia-test','Barberia Test');
insert into memberships(tenant_id,user_id,role) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','owner');
insert into staff_members(id,tenant_id,display_name) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Marco');
insert into services(id,tenant_id,name,duration_min,price_cents) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Taglio',30,2000),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Barba',15,1000);
insert into service_staff values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into working_hours(tenant_id,staff_id,weekday,opens,closes) select '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',d,'09:00','19:00' from generate_series(1,7) d;
-- a slot: tomorrow 10:00 Rome
select (date_trunc('day', now() at time zone 'Europe/Rome') + interval '1 day 10 hours') at time zone 'Europe/Rome' as slot \gset

set role authenticated;
\echo '--- T1 cliente B prenota taglio+barba (atteso: id)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000b';
select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002']::uuid[], :'slot', null,'app',null,'40000000-0000-0000-0000-000000000001') is not null as t1_ok;
\echo '--- T2 stesso idempotency_key (atteso: stesso id, nessun duplicato)'
select count(*) = 1 as t2_ok from (select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], :'slot', null,'app',null,'40000000-0000-0000-0000-000000000001')) x;
select end_at - start_at = interval '45 min' as durata_45_ok, total_cents = 3000 as totale_ok from appointments;
\echo '--- T3 cliente C stesso slot sovrapposto 10:30 (atteso: ERROR slot_unavailable)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000c';
select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], (:'slot'::timestamptz + interval '30 min'), null,'app',null,'40000000-0000-0000-0000-000000000002');
\echo '--- T4 cliente C alle 10:45 subito dopo (atteso: ok)'
select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], (:'slot'::timestamptz + interval '45 min'), null,'app',null,'40000000-0000-0000-0000-000000000003') is not null as t4_ok;
\echo '--- T5 cliente C alle 18:45 sfora la chiusura (atteso: ERROR outside_hours)'
select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000001']::uuid[], (:'slot'::timestamptz + interval '8 hours 45 min'), null,'app',null,'40000000-0000-0000-0000-000000000004');
\echo '--- T6 cliente C vede solo i propri appuntamenti (atteso: 1)'
select count(*) as t6_count from appointments;
\echo '--- T7 cliente C non vede la rubrica del salone tranne se stesso (atteso: 1)'
select count(*) as t7_count from customers;
\echo '--- T8 cliente C prova a creare un appuntamento con insert diretto (atteso: ERROR RLS)'
insert into appointments(tenant_id,customer_id,staff_id,start_at,end_at,source) select tenant_id,customer_id,staff_id,start_at+interval '3 hours',end_at+interval '3 hours','app' from appointments limit 1;
\echo '--- T9 servizio non fatto da quell operatore / inesistente (atteso: ERROR invalid_services)'
select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000009']::uuid[], (:'slot'::timestamptz + interval '3 hours'), null,'app',null,'40000000-0000-0000-0000-000000000005');
\echo '--- T10 titolare blocca le 15:00 e un cliente prova a prenotare li (atteso: ERROR slot_unavailable)'
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
insert into time_blocks(tenant_id,staff_id,start_at,end_at,reason) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',:'slot'::timestamptz + interval '5 hours',:'slot'::timestamptz + interval '6 hours','break');
select count(*) as t10_owner_sees_all from appointments;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000c';
select book_appointment('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  array['30000000-0000-0000-0000-000000000002']::uuid[], (:'slot'::timestamptz + interval '5 hours 15 min'), null,'app',null,'40000000-0000-0000-0000-000000000006');
\echo '--- T11 anonimo legge la vista pubblica ma non i tenants (atteso: 1, 0)'
reset request.jwt.sub; set role anon;
select (select count(*) from public_tenants) as pub, (select count(*) from tenants) as raw;
