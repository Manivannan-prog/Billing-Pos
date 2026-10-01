-- ============================================================================
-- Billing POS - Supabase schema (multi-tenant)
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent and additive.
--
-- TENANCY MODEL
--   One login = one shop. A profile with role 'user' *is* a shop, and its
--   `profiles.id` is the shop id carried as `shop_id` on every data table.
--   A profile with role 'admin' is the vendor: it owns no shop, and it can
--   READ every shop's data but never write it.
--
--   Every data table defaults `shop_id` to auth.uid(), so ordinary inserts
--   need no application change - a shop can only ever stamp its own id, and
--   RLS rejects anything else.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles: one row per login. role 'user' = a shop, role 'admin' = vendor.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique,
  full_name   text not null default '',
  role        text not null default 'user' check (role in ('admin', 'user')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- is_admin() is SECURITY DEFINER so policies on profiles can call it without
-- re-entering their own RLS check and recursing.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$fn$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_active
  );
$fn$;

-- True only for an active shop account. Admins are excluded: the vendor never
-- owns a till, a menu or a bill series. This is what makes admin read-only.
create or replace function public.is_shop()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'user' and is_active
  );
$fn$;

-- ----------------------------------------------------------------------------
-- shop_settings: ONE ROW PER SHOP, keyed by shop_id.
-- (Was a singleton keyed id = 1; the block below upgrades an old install.)
-- ----------------------------------------------------------------------------
create table if not exists public.shop_settings (
  shop_id             uuid primary key default auth.uid()
                        references public.profiles (id) on delete cascade,
  shop_name           text not null default '',
  address             text not null default '',
  phone               text not null default '',
  gst_number          text not null default '',
  upi_id              text not null default '',
  logo                text not null default '',
  enable_gst          boolean not null default true,
  gst_percentage      numeric(5,2) not null default 5,
  enable_discount     boolean not null default false,
  discount_percentage numeric(5,2) not null default 0,
  updated_at          timestamptz not null default now()
);

-- Upgrade path from the single-tenant singleton table.
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shop_settings'
      and column_name = 'id'
  ) then
    alter table public.shop_settings add column if not exists shop_id uuid;
    -- The old id = 1 row belongs to no shop under this model. It only ever
    -- held one set of vendor-wide defaults, so it is dropped rather than
    -- misattributed to whichever shop happens to be first.
    delete from public.shop_settings where shop_id is null;
    alter table public.shop_settings drop column id cascade;
    alter table public.shop_settings alter column shop_id set not null;
    alter table public.shop_settings alter column shop_id set default auth.uid();
    alter table public.shop_settings add primary key (shop_id);
    alter table public.shop_settings
      add constraint shop_settings_shop_fk
      foreign key (shop_id) references public.profiles (id) on delete cascade;
  end if;
end
$mig$;

-- ----------------------------------------------------------------------------
-- menu_items: per shop. The vegetable shop never sees the hotel's dishes.
-- ----------------------------------------------------------------------------
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default auth.uid()
                references public.profiles (id) on delete cascade,
  name        text not null,
  price       numeric(10,2) not null default 0 check (price >= 0),
  category    text not null default '',
  is_active   boolean not null default true,
  is_favorite boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.menu_items add column if not exists shop_id uuid;

drop index if exists menu_items_sort_idx;
create index if not exists menu_items_shop_sort_idx
  on public.menu_items (shop_id, sort_order, name);

-- ----------------------------------------------------------------------------
-- sale_sessions: one "End of Sale" cash-up period, per shop.
-- ----------------------------------------------------------------------------
create table if not exists public.sale_sessions (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null default auth.uid()
                   references public.profiles (id) on delete cascade,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  opened_by      uuid references public.profiles (id) on delete set null,
  closed_by      uuid references public.profiles (id) on delete set null,
  bill_count     integer not null default 0,
  total_sales    numeric(12,2) not null default 0,
  payment_totals jsonb not null default '{}'::jsonb
);

alter table public.sale_sessions add column if not exists shop_id uuid;

-- At most one open session PER SHOP. The old index allowed only one open
-- session in the entire database, which blocked every shop but the first.
drop index if exists sale_sessions_one_open_idx;
create unique index if not exists sale_sessions_one_open_per_shop_idx
  on public.sale_sessions (shop_id)
  where closed_at is null;

-- ----------------------------------------------------------------------------
-- sales + sale_items: per shop. shop_id is denormalised onto sale_items so
-- its RLS policy is a column test, not a per-row subquery against sales.
-- ----------------------------------------------------------------------------
create table if not exists public.sales (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null default auth.uid()
                     references public.profiles (id) on delete cascade,
  transaction_id   text not null unique,
  bill_number      text not null,
  session_id       uuid references public.sale_sessions (id) on delete set null,
  customer_name    text not null default '',
  customer_mobile  text not null default '',
  payment_mode     text not null default 'Cash',
  subtotal         numeric(12,2) not null default 0,
  gst_amount       numeric(12,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0,
  grand_total      numeric(12,2) not null default 0,
  collected_amount numeric(12,2) not null default 0,
  created_date     timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table public.sales add column if not exists shop_id uuid;

drop index if exists sales_created_date_idx;
create index if not exists sales_shop_date_idx on public.sales (shop_id, created_date desc);
create index if not exists sales_session_idx   on public.sales (session_id);

create table if not exists public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default auth.uid()
                 references public.profiles (id) on delete cascade,
  sale_id      uuid not null references public.sales (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  name         text not null,
  price        numeric(10,2) not null default 0,
  quantity     integer not null default 1 check (quantity > 0),
  line_total   numeric(12,2) generated always as (price * quantity) stored
);

alter table public.sale_items add column if not exists shop_id uuid;

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_shop_idx on public.sale_items (shop_id);
create index if not exists sale_items_menu_item_idx on public.sale_items (menu_item_id);
create index if not exists sales_created_by_idx on public.sales (created_by);
create index if not exists sale_sessions_opened_by_idx on public.sale_sessions (opened_by);
create index if not exists sale_sessions_closed_by_idx on public.sale_sessions (closed_by);

-- ----------------------------------------------------------------------------
-- Backfill + lock down shop_id on an upgraded install.
--
-- Rows created before this migration carry no shop. If exactly one shop
-- account exists they are attributed to it; otherwise they cannot be
-- attributed safely, and are removed rather than leaked to the wrong shop.
-- ----------------------------------------------------------------------------
do $mig$
declare
  only_shop  uuid;
  shop_count int;
begin
  -- uuid has no min() aggregate, so count first and then read the single row.
  select count(*) into shop_count
  from public.profiles where role = 'user';

  if shop_count = 1 then
    select id into only_shop
    from public.profiles where role = 'user';

    update public.sales         set shop_id = only_shop where shop_id is null;
    update public.sale_items    set shop_id = only_shop where shop_id is null;
    update public.sale_sessions set shop_id = only_shop where shop_id is null;
    update public.menu_items    set shop_id = only_shop where shop_id is null;
  end if;

  delete from public.sale_items    where shop_id is null;
  delete from public.sales         where shop_id is null;
  delete from public.sale_sessions where shop_id is null;
  delete from public.menu_items    where shop_id is null;

  alter table public.sales         alter column shop_id set not null;
  alter table public.sale_items    alter column shop_id set not null;
  alter table public.sale_sessions alter column shop_id set not null;
  alter table public.menu_items    alter column shop_id set not null;

  alter table public.sales         alter column shop_id set default auth.uid();
  alter table public.sale_items    alter column shop_id set default auth.uid();
  alter table public.sale_sessions alter column shop_id set default auth.uid();
  alter table public.menu_items    alter column shop_id set default auth.uid();
end
$mig$;

-- Foreign keys for the columns added by ALTER on an upgraded install.
--
-- The test is "does shop_id already have a foreign key", not "does a constraint
-- with my name exist": on a fresh install the inline `references` above has
-- already made one under an auto-generated name, and checking the name would
-- add a second, identical key.
do $mig$
declare
  t text;
begin
  foreach t in array array['sales', 'sale_items', 'sale_sessions', 'menu_items']
  loop
    if not exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = format('public.%I', t)::regclass
        and c.contype = 'f'
        and a.attname = 'shop_id'
    ) then
      execute format(
        'alter table public.%I add constraint %I '
        'foreign key (shop_id) references public.profiles (id) on delete cascade',
        t, t || '_shop_fk');
    end if;
  end loop;
end
$mig$;

-- Each shop runs its own bill series, so a bill number is unique per shop
-- rather than globally. Created after the backfill so the index build sees
-- fully populated shop_id values.
drop index if exists sales_bill_number_idx;
create unique index if not exists sales_shop_bill_number_idx
  on public.sales (shop_id, bill_number);

-- ----------------------------------------------------------------------------
-- Bill numbering - one counter row per shop, so each business keeps its own
-- continuous GST invoice series. (Replaces the single global sequence, which
-- interleaved numbers across shops: 1001 vegetable, 1002 hotel, 1003 market.)
-- ----------------------------------------------------------------------------
create table if not exists public.bill_counters (
  shop_id     uuid primary key references public.profiles (id) on delete cascade,
  next_number integer not null default 1001
);

-- Read only. Every write goes through the SECURITY DEFINER functions below, so
-- a shop cannot rewrite its own invoice numbering by hand.
grant select on public.bill_counters to authenticated;

-- Consumes a number. Call this only when a sale is actually being saved.
-- The UPDATE takes a row lock, so two tills on the same shop cannot mint the
-- same number.
create or replace function public.next_bill_number()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  shop uuid := auth.uid();
  n    integer;
begin
  if not public.is_shop() then
    raise exception 'Only a shop account can issue a bill number.';
  end if;

  insert into public.bill_counters (shop_id) values (shop)
    on conflict (shop_id) do nothing;

  update public.bill_counters
     set next_number = next_number + 1
   where shop_id = shop
  returning next_number - 1 into n;

  return 'BILL-' || n::text;
end;
$fn$;

-- Read-only preview for the billing screen, so merely opening the till does
-- not burn a number and leave gaps in the bill series.
create or replace function public.peek_bill_number()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select 'BILL-' || coalesce(
    (select next_number from public.bill_counters where shop_id = auth.uid()),
    1001
  )::text;
$fn$;

-- The old global sequence. Dropped after the functions above no longer name it.
drop sequence if exists public.bill_number_seq;

-- ----------------------------------------------------------------------------
-- current_session(): this shop's open session, created on first use.
-- Returns NULL for an admin - the vendor owns no till.
-- ----------------------------------------------------------------------------
create or replace function public.current_session()
returns public.sale_sessions
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  open_session public.sale_sessions;
begin
  if not public.is_shop() then
    return null;
  end if;

  select * into open_session
  from public.sale_sessions
  where shop_id = auth.uid() and closed_at is null
  order by opened_at
  limit 1;

  if open_session.id is null then
    -- Two screens opening at once (or React StrictMode's double effect) both
    -- find no session and both try to open one. The unique index lets only one
    -- win; the loser waits for it and then reads the winner's row, instead of
    -- failing with a duplicate-key error.
    insert into public.sale_sessions (shop_id, opened_by)
    values (auth.uid(), auth.uid())
    on conflict (shop_id) where closed_at is null do nothing
    returning * into open_session;

    if open_session.id is null then
      select * into open_session
      from public.sale_sessions
      where shop_id = auth.uid() and closed_at is null
      limit 1;
    end if;
  end if;

  return open_session;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- close_sale_session(): total this shop's open session, close it, open the next
-- ----------------------------------------------------------------------------
create or replace function public.close_sale_session()
returns public.sale_sessions
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  open_session public.sale_sessions;
  closed       public.sale_sessions;
begin
  -- Cashing up is a shop operation. An admin is read-only and has no till.
  if not public.is_shop() then
    raise exception 'Only a shop account can close a sale session.';
  end if;

  open_session := public.current_session();

  update public.sale_sessions s
  set closed_at      = now(),
      closed_by      = auth.uid(),
      bill_count     = coalesce(agg.bill_count, 0),
      total_sales    = coalesce(agg.total_sales, 0),
      payment_totals = coalesce(agg.payment_totals, '{}'::jsonb)
  from (
    select count(*)::int                as bill_count,
           coalesce(sum(grand_total), 0) as total_sales,
           coalesce(
             (select jsonb_object_agg(payment_mode, mode_total)
              from (select payment_mode, sum(grand_total) as mode_total
                    from public.sales
                    where session_id = open_session.id
                    group by payment_mode) per_mode),
             '{}'::jsonb
           ) as payment_totals
    from public.sales
    where session_id = open_session.id
  ) agg
  where s.id = open_session.id
    and s.closed_at is null
  returning s.* into closed;

  -- A second "End of Sale" click raced this one and already closed it.
  if closed.id is null then
    raise exception 'This session has already been closed. Refresh and try again.';
  end if;

  insert into public.sale_sessions (shop_id, opened_by)
  values (auth.uid(), auth.uid())
  on conflict (shop_id) where closed_at is null do nothing;

  return closed;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- Provisioning: a new shop account gets its settings row and bill counter
-- automatically, so the edge function that creates logins needs no extra work.
-- ----------------------------------------------------------------------------
create or replace function public.provision_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.role = 'user' then
    insert into public.shop_settings (shop_id) values (new.id)
      on conflict (shop_id) do nothing;
    insert into public.bill_counters (shop_id) values (new.id)
      on conflict (shop_id) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists provision_shop_trg on public.profiles;
create trigger provision_shop_trg
  after insert or update of role on public.profiles
  for each row execute function public.provision_shop();

-- Backfill for shops that already exist.
insert into public.shop_settings (shop_id)
select id from public.profiles where role = 'user'
on conflict (shop_id) do nothing;

insert into public.bill_counters (shop_id)
select id from public.profiles where role = 'user'
on conflict (shop_id) do nothing;

-- ----------------------------------------------------------------------------
-- shop_overview: what the admin's shop list reads. security_invoker makes the
-- view honour the caller's own RLS, so a shop account sees only its own row
-- and the admin sees every shop.
-- ----------------------------------------------------------------------------
drop view if exists public.shop_overview;
create view public.shop_overview
with (security_invoker = true) as
select p.id                        as shop_id,
       p.username,
       p.full_name,
       p.is_active,
       p.created_at,
       coalesce(s.shop_name, '')   as shop_name,
       coalesce(s.gst_number, '')  as gst_number,
       coalesce(agg.bill_count, 0) as bill_count,
       coalesce(agg.total_sales, 0) as total_sales,
       agg.last_sale_at
from public.profiles p
left join public.shop_settings s on s.shop_id = p.id
left join (
  select shop_id,
         count(*)::int     as bill_count,
         sum(grand_total)  as total_sales,
         max(created_date) as last_sale_at
  from public.sales
  group by shop_id
) agg on agg.shop_id = p.id
where p.role = 'user';

grant select on public.shop_overview to authenticated;

-- ============================================================================
-- Row Level Security
--
--   admin - the vendor. READ-ONLY across every shop, plus user management.
--   user  - the shop. Full use of its OWN data and nothing else.
--
-- Reads are `shop_id = auth.uid() or is_admin()`; writes are
-- `shop_id = auth.uid() and is_shop()`, which is what keeps admin read-only.
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.shop_settings enable row level security;
alter table public.menu_items    enable row level security;
alter table public.sale_sessions enable row level security;
alter table public.sales         enable row level security;
alter table public.sale_items    enable row level security;
alter table public.bill_counters enable row level security;

-- profiles: you can always read yourself; only an admin sees or edits everyone.
--
-- Function calls are wrapped as (select f()) throughout so Postgres evaluates
-- them once per query rather than once per row.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- Separate write policies rather than one "for all", so SELECT is decided by a
-- single policy instead of two permissive ones evaluated side by side.
drop policy if exists profiles_admin_write  on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check ((select public.is_admin()));
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy profiles_admin_delete on public.profiles
  for delete to authenticated
  using ((select public.is_admin()));

-- Per-shop tables. Generated by one loop so no table can accidentally be left
-- on a laxer policy than its siblings.
do $rls$
declare
  t text;
begin
  foreach t in array array['shop_settings', 'menu_items', 'sale_sessions', 'sales', 'sale_items']
  loop
    -- Drop this schema's own policy names first so the block is re-runnable,
    -- then the single-tenant names, which granted every signed-in account
    -- access to every row.
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);

    -- is_shop() rather than a bare shop_id test: disabling an account has to
    -- revoke reading as well as writing, or "disabled" would only mean
    -- read-only. is_admin() already requires the admin to be active too.
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using ((shop_id = (select auth.uid()) and (select public.is_shop())) '
      'or (select public.is_admin()))',
      t || '_select', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check (shop_id = (select auth.uid()) and (select public.is_shop()))',
      t || '_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (shop_id = (select auth.uid()) and (select public.is_shop())) '
      'with check (shop_id = (select auth.uid()) and (select public.is_shop()))',
      t || '_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated '
      'using (shop_id = (select auth.uid()) and (select public.is_shop()))',
      t || '_delete', t);
  end loop;
end
$rls$;

-- Legacy policy names from the single-tenant schema, in case they linger.
drop policy if exists settings_read          on public.shop_settings;
drop policy if exists settings_write         on public.shop_settings;
drop policy if exists settings_admin_write   on public.shop_settings;
drop policy if exists menu_read              on public.menu_items;
drop policy if exists menu_write             on public.menu_items;
drop policy if exists menu_admin_write       on public.menu_items;
drop policy if exists sessions_read          on public.sale_sessions;
drop policy if exists sessions_write         on public.sale_sessions;
drop policy if exists sessions_admin_write   on public.sale_sessions;
drop policy if exists sales_admin_update     on public.sales;
drop policy if exists sales_admin_delete     on public.sales;

-- bill_counters is read for the bill preview and written only through the
-- SECURITY DEFINER functions above, so no write policy is granted at all.
drop policy if exists bill_counters_select on public.bill_counters;
create policy bill_counters_select on public.bill_counters
  for select to authenticated
  using ((shop_id = (select auth.uid()) and (select public.is_shop()))
         or (select public.is_admin()));

-- Existing installs created before the rename: cashier became user.
update public.profiles set role = 'user' where role not in ('admin', 'user');

-- ----------------------------------------------------------------------------
-- Bootstrap: promote your very first account to admin.
-- Create the user in Dashboard -> Authentication -> Add user, then run:
--   select public.bootstrap_admin('owner@pos.local', 'owner', 'Owner');
-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- bootstrap_shop(): create a shop account by hand.
--
-- Normally shops are created from Users & Access, which needs the admin-users
-- edge function deployed. This is the manual path, and the one to use for the
-- very first shops. Create the login in Dashboard -> Authentication -> Add
-- user (email <username>@pos.local, tick Auto Confirm User), then run:
--   select public.bootstrap_shop('veg@pos.local', 'veg', 'Vegetable Shop');
--
-- The provision_shop trigger gives the new shop its settings row and its own
-- bill series automatically.
-- ----------------------------------------------------------------------------
create or replace function public.bootstrap_shop(
  user_email   text,
  user_name    text,
  display_name text default ''
)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  target_id uuid;
  result    public.profiles;
begin
  select id into target_id from auth.users where email = user_email;

  if target_id is null then
    raise exception 'No auth user with email %. Create it first under Authentication -> Add user.', user_email;
  end if;

  insert into public.profiles (id, username, full_name, role, is_active)
  values (target_id, user_name, coalesce(nullif(display_name, ''), user_name), 'user', true)
  on conflict (id) do update
    set username   = excluded.username,
        full_name  = excluded.full_name,
        role       = 'user',
        is_active  = true,
        updated_at = now()
  returning * into result;

  return result;
end;
$fn$;

create or replace function public.bootstrap_admin(
  user_email   text,
  user_name    text,
  display_name text default ''
)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  target_id uuid;
  result    public.profiles;
begin
  select id into target_id from auth.users where email = user_email;

  if target_id is null then
    raise exception 'No auth user with email %. Create it first under Authentication -> Add user.', user_email;
  end if;

  insert into public.profiles (id, username, full_name, role, is_active)
  values (target_id, user_name, coalesce(nullif(display_name, ''), user_name), 'admin', true)
  on conflict (id) do update
    set username   = excluded.username,
        full_name  = excluded.full_name,
        role       = 'admin',
        is_active  = true,
        updated_at = now()
  returning * into result;

  return result;
end;
$fn$;

-- ============================================================================
-- Function privileges
--
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated, which exposes it at /rest/v1/rpc/<name>. That is wrong here:
--
--   bootstrap_admin / bootstrap_shop are SECURITY DEFINER and trust their
--   arguments. Left callable, anyone holding the public anon key could promote
--   their own login to admin, or demote the real admin to a shop, without even
--   signing in. They are for the SQL editor only (run there as postgres).
--
--   provision_shop is a trigger function and has no business being an RPC.
--
--   The rest check auth.uid() themselves, so a signed-out caller gets nothing
--   from them - but there is no reason to expose them to anon either.
--
-- Must come after every `create or replace function` above. Re-running this
-- file keeps these privileges, because create or replace does not reset them.
-- ============================================================================
revoke execute on function public.bootstrap_admin(text, text, text) from public, anon, authenticated;
revoke execute on function public.bootstrap_shop(text, text, text)  from public, anon, authenticated;
revoke execute on function public.provision_shop()                  from public, anon, authenticated;

revoke execute on function public.is_admin()           from public, anon;
revoke execute on function public.is_shop()            from public, anon;
revoke execute on function public.is_active_user()     from public, anon;
revoke execute on function public.next_bill_number()   from public, anon;
revoke execute on function public.peek_bill_number()   from public, anon;
revoke execute on function public.current_session()    from public, anon;
revoke execute on function public.close_sale_session() from public, anon;

-- RLS policies call is_admin()/is_shop() as the signed-in user, and the app
-- calls the bill and session functions directly, so authenticated keeps these.
grant execute on function public.is_admin()           to authenticated;
grant execute on function public.is_shop()            to authenticated;
grant execute on function public.is_active_user()     to authenticated;
grant execute on function public.next_bill_number()   to authenticated;
grant execute on function public.peek_bill_number()   to authenticated;
grant execute on function public.current_session()    to authenticated;
grant execute on function public.close_sale_session() to authenticated;
