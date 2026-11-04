-- Simula le parti di Supabase che lo schema usa: ruoli anon/authenticated, auth.users, auth.uid().
-- Solo per i test su un Postgres "nudo". Su Supabase vero non va eseguito.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,                     -- Supabase lo salva senza "+"
  phone_confirmed_at timestamptz,
  is_anonymous boolean not null default false
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;  -- serve solo al test; su Supabase le funzioni sono security definer
