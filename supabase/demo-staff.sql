-- Da eseguire DOPO aver creato l'utente demo in Authentication -> Users -> Add user (email + password, "Auto confirm").
-- Lo rende titolare del salone e lo collega all'operatore Marco. Cambia l'email se ne hai usata un'altra.
insert into staff_users (user_id, role)
select id, 'owner' from auth.users where email = 'titolare@barberbooking.demo'
on conflict (user_id) do update set role = excluded.role;

update profiles set full_name = 'Titolare Demo'
where id = (select id from auth.users where email = 'titolare@barberbooking.demo');

update staff_members set user_id = (select id from auth.users where email = 'titolare@barberbooking.demo')
where display_name = 'Marco';

select 'ok: titolare collegato' as esito
where exists (select 1 from staff_users s join auth.users u on u.id = s.user_id where u.email = 'titolare@barberbooking.demo');
