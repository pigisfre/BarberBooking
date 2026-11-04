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
