-- Kinderbee CRM schema. Access is enforced here with RLS; the UI only hides what RLS already blocks.
-- Module keys: admissions, inquiries, fees, payments, attendance, whatsapp

create extension if not exists pgcrypto;

-- ───────────── Team / roles ─────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  phone text,
  username text,
  role text not null default 'coordinator' check (role in ('ceo','coordinator')),
  modules text[] not null default '{}',
  can_verify boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Role comes from app_metadata, which only the service role can set. Public sign-ups get a powerless coordinator.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, username, role, modules, can_verify)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'full_name', ''),
    new.raw_app_meta_data->>'phone',
    coalesce(new.raw_app_meta_data->>'username', split_part(new.email, '@', 1)),
    case when new.raw_app_meta_data->>'role' = 'ceo' then 'ceo' else 'coordinator' end,
    coalesce(array(select jsonb_array_elements_text(new.raw_app_meta_data->'modules')), '{}'),
    coalesce((new.raw_app_meta_data->>'can_verify')::boolean, false)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_ceo() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'ceo' and active)
$$;

create function public.has_module(m text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and (role = 'ceo' or m = any(modules)))
$$;

create function public.can_verify_payments() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active
    and (role = 'ceo' or ('payments' = any(modules) and can_verify)))
$$;

alter table public.profiles enable row level security;
create policy "profiles readable by team" on public.profiles for select to authenticated using (true);
create policy "ceo manages profiles" on public.profiles for update to authenticated using (is_ceo()) with check (is_ceo());

-- ───────────── Audit log (written by trigger, never by clients) ─────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  summary text,
  at timestamptz not null default now()
);
create index on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy "ceo sees all, others see own" on public.audit_log for select to authenticated
  using (is_ceo() or actor = auth.uid());

create function public.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (actor, action, entity, entity_id, summary)
  values (
    auth.uid(),
    case when tg_op = 'UPDATE' and r ? 'status' and to_jsonb(old)->>'status' is distinct from r->>'status'
         then 'status → ' || (r->>'status') else lower(tg_op) end,
    tg_table_name,
    coalesce(r->>'id', r->>'student_id', r->>'staff_id'),
    coalesce(r->>'name', r->>'child_name', r->>'payer_name', r->>'full_name', r->>'key')
  );
  return coalesce(new, old);
end $$;

-- ───────────── Settings & secrets ─────────────
create table public.settings (key text primary key, value jsonb not null);
alter table public.settings enable row level security;
create policy "settings readable" on public.settings for select to authenticated using (true);
create policy "ceo writes settings" on public.settings for all to authenticated using (is_ceo()) with check (is_ceo());

-- Write-only for the CEO; only edge functions (service role) can read it back.
create table public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
create function public.set_secret(k text, v text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_ceo() then raise exception 'CEO only'; end if;
  insert into app_secrets values (k, v) on conflict (key) do update set value = excluded.value;
end $$;
create function public.has_secret(k text) returns boolean language sql stable security definer set search_path = public as $$
  select is_ceo() and exists (select 1 from app_secrets where key = k)
$$;

insert into public.settings values
  ('programs', '["Play Group","Pre-KG","LKG/Junior KG","UKG/Senior KG","Daycare"]'),
  ('holidays', '[]'),
  ('academic_year', '"2026-27"'),
  ('whatsapp', '{"phone_number_id":"","enabled":false}');

-- ───────────── Admissions & students ─────────────
create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dob date,
  gender text,
  program text not null,
  parent_name text,
  parent_phone text,
  email text,
  address text,
  academic_year text not null default '2026-27',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.students (program, name);

create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  child_name text not null,
  dob date,
  gender text,
  program text not null,
  parent_name text not null,
  parent_phone text not null,
  email text,
  address text,
  previous_school text,
  source text default 'walk-in',
  notes text,
  status text not null default 'New' check (status in ('New','Contacted','Visit Scheduled','Admitted','Not Interested')),
  documents jsonb not null default '{}',
  student_id uuid references public.students(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────── Website inquiries ─────────────
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('ntt','consultation','franchise','cbse','degree','jv')),
  name text not null,
  phone text,
  email text,
  city text,
  message text,
  source text default 'website',
  assigned_to uuid references public.profiles(id) on delete set null,
  follow_up date,
  notes text,
  status text not null default 'New' check (status in ('New','Contacted','Follow-up','Converted','Closed')),
  extra jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.leads (category, created_at desc);

-- ───────────── Fees ─────────────
create table public.fee_components (
  id uuid primary key default gen_random_uuid(),
  program text not null,
  academic_year text not null,
  name text not null,
  amount numeric(10,2) not null check (amount >= 0),
  due_date date,
  monthly boolean not null default false,
  sort int not null default 0
);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint generated always as identity,
  student_id uuid not null references public.students(id) on delete cascade,
  component_id uuid references public.fee_components(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  mode text not null check (mode in ('cash','upi','bank','cheque')),
  reference text,
  paid_on date not null default current_date,
  receipt_path text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.fee_payments (student_id);
create index on public.fee_payments (paid_on);

-- ───────────── Payments: staff salary & service payments ─────────────
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  phone text,
  joining_date date,
  bank_account_name text,
  account_no text,
  ifsc text,
  upi text,
  monthly_salary numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  month date not null, -- first day of month
  amount numeric(10,2) not null,
  deductions numeric(10,2) not null default 0,
  bonus numeric(10,2) not null default 0,
  paid_on date not null default current_date,
  mode text not null default 'bank',
  slip_path text,
  created_at timestamptz not null default now(),
  unique (staff_id, month)
);

create table public.service_payments (
  id uuid primary key default gen_random_uuid(),
  payer_name text not null,
  phone text,
  service text not null check (service in ('Franchise','NTT Teacher Training','One-on-One Consultation','Joint Ventures','CBSE School','Degree College','Other')),
  amount numeric(10,2) not null check (amount > 0),
  mode text not null,
  reference text,
  paid_on date not null default current_date,
  proof_path text,
  status text not null default 'Pending' check (status in ('Pending','Verified','Rejected')),
  reject_reason text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.verify_service_payment(p_id uuid, p_ok boolean, p_reason text default null)
returns public.service_payments language plpgsql security definer set search_path = public as $$
declare r service_payments;
begin
  if not can_verify_payments() then raise exception 'Not allowed to verify payments'; end if;
  if not p_ok and coalesce(trim(p_reason), '') = '' then raise exception 'Rejection reason required'; end if;
  update service_payments
     set status = case when p_ok then 'Verified' else 'Rejected' end,
         reject_reason = case when p_ok then null else p_reason end,
         verified_by = auth.uid(), verified_at = now()
   where id = p_id and status = 'Pending'
  returning * into r;
  if r.id is null then raise exception 'Payment not found or already processed'; end if;
  return r;
end $$;

-- ───────────── Attendance ─────────────
create table public.staff_attendance (
  staff_id uuid not null references public.staff(id) on delete cascade,
  day date not null,
  status text not null check (status in ('P','A','H','L')),
  check_in time,
  marked_by uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (staff_id, day)
);

create table public.student_attendance (
  student_id uuid not null references public.students(id) on delete cascade,
  day date not null,
  status text not null check (status in ('P','A','L')),
  primary key (student_id, day)
);
create index on public.student_attendance (day);

-- ───────────── WhatsApp ─────────────
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  body text not null,
  meta_template text, -- approved Meta template name; params are the placeholders in order
  lang text not null default 'en'
);

create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  template text,
  body text,
  status text not null default 'sent' check (status in ('queued','sent','delivered','read','failed','link')),
  error text,
  provider_id text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.message_log (provider_id);

insert into public.message_templates (name, body) values
  ('Fee reminder', 'Dear {parent_name}, this is a gentle reminder that the fee of ₹{amount} for {student_name} ({class}) is due on {due_date}. Kindly pay at the earliest. Thank you – Kinderbee Preschool 🐝'),
  ('Payment received', 'Hi {name}, we have received your payment of ₹{amount} for {service} on {date}. Ref: {ref}. Thank you – Team Kinderbee 🐝');

-- ───────────── RLS per module ─────────────
alter table public.students enable row level security;
create policy "students read" on public.students for select to authenticated
  using (has_module('admissions') or has_module('fees') or has_module('attendance') or has_module('whatsapp'));
create policy "students write" on public.students for insert to authenticated
  with check (has_module('admissions') or has_module('attendance'));
create policy "students update" on public.students for update to authenticated
  using (has_module('admissions') or has_module('attendance'));
create policy "students delete" on public.students for delete to authenticated using (is_ceo());

alter table public.admissions enable row level security;
create policy "admissions" on public.admissions for all to authenticated
  using (has_module('admissions')) with check (has_module('admissions'));

alter table public.leads enable row level security;
create policy "leads" on public.leads for all to authenticated
  using (has_module('inquiries')) with check (has_module('inquiries'));

alter table public.fee_components enable row level security;
create policy "fee structure read" on public.fee_components for select to authenticated
  using (has_module('fees') or has_module('whatsapp'));
create policy "fee structure ceo" on public.fee_components for all to authenticated using (is_ceo()) with check (is_ceo());

alter table public.fee_payments enable row level security;
create policy "fee payments read" on public.fee_payments for select to authenticated
  using (has_module('fees') or has_module('whatsapp'));
create policy "fee payments insert" on public.fee_payments for insert to authenticated with check (has_module('fees'));
create policy "fee payments fix" on public.fee_payments for update to authenticated using (has_module('fees'));
create policy "fee payments delete" on public.fee_payments for delete to authenticated using (is_ceo());

alter table public.staff enable row level security;
create policy "staff read" on public.staff for select to authenticated
  using (has_module('payments') or has_module('attendance'));
create policy "staff write" on public.staff for all to authenticated
  using (has_module('payments')) with check (has_module('payments'));

alter table public.salary_payments enable row level security;
create policy "salary" on public.salary_payments for all to authenticated
  using (has_module('payments')) with check (has_module('payments'));

alter table public.service_payments enable row level security;
create policy "service payments read" on public.service_payments for select to authenticated using (has_module('payments'));
create policy "service payments add" on public.service_payments for insert to authenticated
  with check (has_module('payments') and status = 'Pending' and verified_by is null);
-- Verification goes through verify_service_payment(); direct edits are CEO only.
create policy "service payments ceo" on public.service_payments for update to authenticated using (is_ceo());
create policy "service payments ceo delete" on public.service_payments for delete to authenticated using (is_ceo());

alter table public.staff_attendance enable row level security;
create policy "staff attendance" on public.staff_attendance for all to authenticated
  using (has_module('attendance')) with check (has_module('attendance'));

alter table public.student_attendance enable row level security;
create policy "student attendance" on public.student_attendance for all to authenticated
  using (has_module('attendance')) with check (has_module('attendance'));

alter table public.message_templates enable row level security;
create policy "templates read" on public.message_templates for select to authenticated
  using (has_module('whatsapp') or has_module('payments'));
create policy "templates write" on public.message_templates for all to authenticated
  using (has_module('whatsapp')) with check (has_module('whatsapp'));

alter table public.message_log enable row level security;
create policy "log read" on public.message_log for select to authenticated using (has_module('whatsapp'));
create policy "log insert" on public.message_log for insert to authenticated
  with check (has_module('whatsapp') or has_module('payments'));

-- Audit every table that matters
do $$ declare t text; begin
  foreach t in array array['profiles','settings','students','admissions','leads','fee_components','fee_payments',
                           'staff','salary_payments','service_payments','message_templates'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit()', t);
  end loop;
end $$;

-- ───────────── Storage: private bucket, top folder = module key ─────────────
insert into storage.buckets (id, name, public) values ('docs', 'docs', false) on conflict do nothing;
create policy "docs read" on storage.objects for select to authenticated
  using (bucket_id = 'docs' and has_module((storage.foldername(name))[1]));
create policy "docs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'docs' and has_module((storage.foldername(name))[1]));
create policy "docs update" on storage.objects for update to authenticated
  using (bucket_id = 'docs' and has_module((storage.foldername(name))[1]));


-- Team management and website lead intake as database functions, so no edge function deploy is needed for them.

-- ───────────── Team (CEO only) ─────────────
create function public.admin_create_user(p_username text, p_password text, p_full_name text, p_phone text,
  p_modules text[], p_can_verify boolean, p_domain text)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  login text := lower(trim(p_username));
  mail text;
  uid uuid := gen_random_uuid();
begin
  if not is_ceo() then raise exception 'CEO only'; end if;
  if login = '' or length(coalesce(p_password, '')) < 6 then raise exception 'Username and a 6+ character password are required'; end if;
  mail := case when login like '%@%' then login else login || '@' || p_domain end;
  if exists (select 1 from auth.users where email = mail) then raise exception 'That username is already taken'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'coordinator',
      'full_name', p_full_name, 'phone', p_phone, 'username', split_part(login, '@', 1),
      'modules', to_jsonb(coalesce(p_modules, '{}')), 'can_verify', coalesce(p_can_verify, false)),
    '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail), 'email', now(), now(), now());
  return uid;
end $$;

create function public.admin_reset_password(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_ceo() then raise exception 'CEO only'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be 6+ characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
end $$;

create function public.admin_set_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_ceo() then raise exception 'CEO only'; end if;
  if p_id = auth.uid() then raise exception 'You cannot deactivate yourself'; end if;
  update auth.users set banned_until = case when p_active then null else now() + interval '100 years' end where id = p_id;
  update public.profiles set active = p_active where id = p_id;
end $$;

revoke execute on function public.admin_create_user, public.admin_reset_password, public.admin_set_active from public, anon;
grant execute on function public.admin_create_user, public.admin_reset_password, public.admin_set_active to authenticated;

-- ───────────── Website lead intake (public) ─────────────
-- POST {SUPABASE_URL}/rest/v1/rpc/submit_lead with headers apikey + Content-Type: application/json, body { "p": { ...form fields } }
-- ponytail: no rate limit; add a captcha or an edge function with throttling if bots find the form
create function public.submit_lead(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  cat text := p->>'category';
  common text[] := array['category','name','phone','email','city','message','source','website'];
begin
  if coalesce(p->>'website', '') <> '' then return; end if; -- honeypot
  if cat is null or cat not in ('ntt','consultation','franchise','cbse','degree','jv') then
    raise exception 'category must be one of ntt, consultation, franchise, cbse, degree, jv';
  end if;
  if coalesce(trim(p->>'name'), '') = '' or coalesce(trim(p->>'phone'), '') = '' then raise exception 'name and phone are required'; end if;
  insert into leads (category, name, phone, email, city, message, source, extra)
  values (cat, left(trim(p->>'name'), 120), left(trim(p->>'phone'), 20), left(p->>'email', 120), left(p->>'city', 80),
    left(p->>'message', 2000), coalesce(left(p->>'source', 40), 'website'),
    coalesce((select jsonb_object_agg(left(k, 40), left(v, 500))
              from (select key k, value v from jsonb_each_text(p) where key <> all(common) limit 20) x), '{}'));
end $$;

revoke execute on function public.submit_lead from public;
grant execute on function public.submit_lead to anon, authenticated;


-- Block public sign-ups at the database, whatever the Auth "Allow new users to sign up" switch says.
-- Accounts can only be created by admin_create_user() (CEO's Team page) or SQL that sets kb.allow_signup.

create function public.block_public_signup() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('kb.allow_signup', true), '') <> 'on' then
    raise exception 'Sign-ups are disabled. Ask the CEO to create your account.';
  end if;
  return new;
end $$;
create trigger block_public_signup before insert on auth.users for each row execute function public.block_public_signup();

create or replace function public.admin_create_user(p_username text, p_password text, p_full_name text, p_phone text,
  p_modules text[], p_can_verify boolean, p_domain text)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  login text := lower(trim(p_username));
  mail text;
  uid uuid := gen_random_uuid();
begin
  if not is_ceo() then raise exception 'CEO only'; end if;
  if login = '' or length(coalesce(p_password, '')) < 6 then raise exception 'Username and a 6+ character password are required'; end if;
  mail := case when login like '%@%' then login else login || '@' || p_domain end;
  if exists (select 1 from auth.users where email = mail) then raise exception 'That username is already taken'; end if;

  perform set_config('kb.allow_signup', 'on', true);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'coordinator',
      'full_name', p_full_name, 'phone', p_phone, 'username', split_part(login, '@', 1),
      'modules', to_jsonb(coalesce(p_modules, '{}')), 'can_verify', coalesce(p_can_verify, false)),
    '{}', now(), now(), '', '', '', '');
  perform set_config('kb.allow_signup', 'off', true);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail), 'email', now(), now(), now());
  return uid;
end $$;


-- ===== DEMO DATA =====
-- Demo data. Logins (change these before going live):
--   CEO          username: ceo    password: KinderBee@123
--   Coordinator  username: priya  password: Coord@123
-- Usernames map to <username>@kinderbee.local (see src/config/brand.ts → loginDomain).

do $$
declare
  ceo uuid := '11111111-1111-1111-1111-111111111111';
  coord uuid := '22222222-2222-2222-2222-222222222222';
  u record;
begin
  perform set_config('kb.allow_signup', 'on', true); -- see 0003_block_signups.sql
  for u in select * from (values
    (ceo, 'ceo@kinderbee.local', 'KinderBee@123',
      '{"provider":"email","providers":["email"],"role":"ceo","full_name":"Sagi","phone":"+919845000001","username":"ceo"}'::jsonb),
    (coord, 'priya@kinderbee.local', 'Coord@123',
      '{"provider":"email","providers":["email"],"role":"coordinator","full_name":"Priya Sharma","phone":"+919845000002","username":"priya","modules":["admissions","inquiries","fees","payments","attendance","whatsapp"],"can_verify":false}'::jsonb)
  ) as t(id, email, pw, meta) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt(u.pw, extensions.gen_salt('bf')), now(), u.meta, '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now());
  end loop;
  perform set_config('kb.allow_signup', 'off', true);
end $$;

-- Students
insert into public.students (name, dob, gender, program, parent_name, parent_phone, email)
select s.name, date '2022-01-01' + (i * 37 % 900)::int, case when i % 2 = 0 then 'Girl' else 'Boy' end,
       (array['Play Group','Pre-KG','LKG/Junior KG','UKG/Senior KG','Daycare'])[1 + i % 5],
       s.parent, '+9198450' || lpad((10000 + i)::text, 5, '0'), lower(split_part(s.parent, ' ', 1)) || '@example.com'
from unnest(
  array['Aarav Kumar','Ananya Reddy','Vihaan Iyer','Diya Nair','Arjun Gowda','Ishita Menon','Kabir Shetty','Myra Joshi',
        'Reyansh Pillai','Saanvi Hegde','Advik Rao','Kiara Bhat','Atharv Kulkarni','Aadhya Naidu','Ayaan Khan','Navya Prasad',
        'Dhruv Patil','Pari Desai','Shaurya Singh','Anika Murthy'],
  array['Ravi Kumar','Sneha Reddy','Karthik Iyer','Meera Nair','Manjunath Gowda','Lakshmi Menon','Rohit Shetty','Pooja Joshi',
        'Suresh Pillai','Deepa Hegde','Vikram Rao','Shruti Bhat','Nitin Kulkarni','Kavya Naidu','Imran Khan','Asha Prasad',
        'Sachin Patil','Neha Desai','Amit Singh','Divya Murthy']
) with ordinality as s(name, parent, i);

-- Admissions pipeline
insert into public.admissions (child_name, dob, gender, program, parent_name, parent_phone, email, source, status, created_at)
values
  ('Tara Krishnan', '2023-03-12', 'Girl', 'Play Group', 'Anand Krishnan', '+919900112233', 'anand@example.com', 'website', 'New', now() - interval '1 day'),
  ('Rudra Shenoy', '2022-07-04', 'Boy', 'Pre-KG', 'Geetha Shenoy', '+919900112234', null, 'walk-in', 'Contacted', now() - interval '3 days'),
  ('Zara Fernandes', '2021-11-20', 'Girl', 'LKG/Junior KG', 'Leon Fernandes', '+919900112235', 'leon@example.com', 'referral', 'Visit Scheduled', now() - interval '5 days'),
  ('Ved Acharya', '2023-01-30', 'Boy', 'Daycare', 'Smita Acharya', '+919900112236', null, 'call', 'New', now() - interval '2 days'),
  ('Ira Banerjee', '2020-09-15', 'Girl', 'UKG/Senior KG', 'Sourav Banerjee', '+919900112237', null, 'website', 'Not Interested', now() - interval '12 days');

-- Website leads
insert into public.leads (category, name, phone, email, city, message, status, follow_up, extra, assigned_to, created_at) values
  ('ntt', 'Rekha Venkatesh', '+919811000001', 'rekha@example.com', 'Bengaluru', 'Weekend batch?', 'New', current_date + 2, '{"qualification":"B.Com","batch":"Weekend"}', '22222222-2222-2222-2222-222222222222', now() - interval '1 day'),
  ('ntt', 'Farah Siddiqui', '+919811000002', null, 'Mysuru', 'Fees and duration', 'Contacted', current_date + 1, '{"qualification":"BA"}', null, now() - interval '4 days'),
  ('consultation', 'Harish Gupta', '+919811000003', 'harish@example.com', 'Hubballi', 'Want to start a preschool', 'Follow-up', current_date, '{"topic":"Starting a preschool"}', null, now() - interval '2 days'),
  ('franchise', 'Sunita Agarwal', '+919811000004', 'sunita@example.com', 'Chennai', 'Franchise details please', 'New', current_date + 3, '{"investment_budget":"₹10–15 lakh","preferred_location":"Anna Nagar"}', '22222222-2222-2222-2222-222222222222', now()),
  ('franchise', 'Mahesh Yadav', '+919811000005', null, 'Pune', null, 'Converted', null, '{"investment_budget":"₹20 lakh+","preferred_location":"Baner"}', null, now() - interval '20 days'),
  ('cbse', 'Prakash Jain', '+919811000006', null, 'Bengaluru', 'Admission for Grade 2', 'New', null, '{"grade":"Grade 2"}', null, now() - interval '3 days'),
  ('degree', 'Ritika Das', '+919811000007', 'ritika@example.com', 'Kolkata', 'BBA admissions', 'Contacted', current_date + 5, '{"course":"BBA"}', null, now() - interval '6 days'),
  ('jv', 'Orbit Learning Pvt Ltd', '+919811000008', 'bd@orbit.example', 'Hyderabad', 'Partnership proposal', 'Follow-up', current_date + 7, '{"organisation":"Orbit Learning","proposal":"Co-branded centres"}', null, now() - interval '1 day');

-- Fee structure 2026-27 for every program
insert into public.fee_components (program, academic_year, name, amount, due_date, monthly, sort)
select p, '2026-27', c.name, c.amount * case when p = 'Daycare' then 1.2 else 1 end, c.due, c.monthly, c.sort
from unnest(array['Play Group','Pre-KG','LKG/Junior KG','UKG/Senior KG','Daycare']) as p,
     (values ('One-Time Payment (Admission)', 15000, date '2026-06-01', false, 1),
             ('Term 1', 12000, date '2026-06-15', false, 2),
             ('Term 2', 12000, date '2026-10-15', false, 3),
             ('Term 3', 12000, date '2027-01-15', false, 4),
             ('Monthly Tuition Fee', 3000, date '2026-06-05', true, 5),
             ('Kids Books', 4500, date '2026-06-15', false, 6),
             ('Uniform', 3500, date '2026-06-15', false, 7),
             ('Miscellaneous', 1000, date '2026-07-01', false, 8)) as c(name, amount, due, monthly, sort);

-- Some fee payments (admission + term 1 for most, a few partial)
insert into public.fee_payments (student_id, component_id, amount, mode, reference, paid_on, created_by)
select s.id, fc.id, case when row_number() over () % 4 = 0 then fc.amount / 2 else fc.amount end,
       (array['cash','upi','bank','cheque'])[1 + (row_number() over ())::int % 4], 'DEMO' || row_number() over (),
       date '2026-06-01' + (row_number() over ())::int % 120, '22222222-2222-2222-2222-222222222222'
from public.students s
join public.fee_components fc on fc.program = s.program and fc.academic_year = '2026-27'
where fc.sort in (1, 2) and s.name not in ('Ayaan Khan', 'Pari Desai');

-- Staff + salary
insert into public.staff (name, role, phone, joining_date, bank_account_name, account_no, ifsc, upi, monthly_salary) values
  ('Shobha Kamath', 'Lead Teacher', '+919845100001', '2023-06-01', 'Shobha Kamath', '50100012345678', 'HDFC0001234', 'shobha@okhdfc', 32000),
  ('Nandini Rao', 'Teacher', '+919845100002', '2024-06-01', 'Nandini Rao', '50100012345679', 'ICIC0004321', 'nandini@okicici', 26000),
  ('Fathima Begum', 'Teacher', '+919845100003', '2025-01-10', 'Fathima Begum', '50100012345680', 'SBIN0011111', null, 25000),
  ('Raju M', 'Ayah / Helper', '+919845100004', '2022-06-01', 'Raju M', '50100012345681', 'CNRB0002222', null, 14000),
  ('Kiran Shetty', 'Driver', '+919845100005', '2024-03-15', 'Kiran Shetty', '50100012345682', 'KKBK0003333', 'kiran@ybl', 18000);

insert into public.salary_payments (staff_id, month, amount, deductions, bonus, paid_on, mode)
select id, m, monthly_salary, 0, 0, (m + interval '1 month' - interval '1 day')::date, 'bank'
from public.staff, (values (date '2026-08-01'), (date '2026-09-01')) as months(m);

-- Service payments
insert into public.service_payments (payer_name, phone, service, amount, mode, reference, paid_on, status, created_by) values
  ('Sunita Agarwal', '+919811000004', 'Franchise', 150000, 'bank', 'NEFT88213', current_date - 1, 'Pending', '22222222-2222-2222-2222-222222222222'),
  ('Rekha Venkatesh', '+919811000001', 'NTT Teacher Training', 18000, 'upi', 'UPI4471029', current_date, 'Pending', '22222222-2222-2222-2222-222222222222'),
  ('Harish Gupta', '+919811000003', 'One-on-One Consultation', 5000, 'upi', 'UPI4471111', current_date - 5, 'Verified', '22222222-2222-2222-2222-222222222222');
update public.service_payments set verified_by = '11111111-1111-1111-1111-111111111111', verified_at = now() where status = 'Verified';

-- Attendance for the current month so far (Sundays skipped)
insert into public.student_attendance (student_id, day, status)
select s.id, d::date, case when (abs(hashtext(s.id::text || d::text)) % 10) = 0 then 'A' else 'P' end
from public.students s, generate_series(date_trunc('month', current_date), current_date - 1, interval '1 day') d
where extract(dow from d) <> 0;

insert into public.staff_attendance (staff_id, day, status, check_in)
select st.id, d::date, case when (abs(hashtext(st.id::text || d::text)) % 12) = 0 then 'L' else 'P' end, time '08:45'
from public.staff st, generate_series(date_trunc('month', current_date), current_date - 1, interval '1 day') d
where extract(dow from d) <> 0;

insert into public.message_log (phone, template, body, status, created_at) values
  ('+919845010001', 'Fee reminder', 'Dear Ravi Kumar, this is a gentle reminder…', 'delivered', now() - interval '2 days'),
  ('+919845010002', 'Fee reminder', 'Dear Sneha Reddy, this is a gentle reminder…', 'failed', now() - interval '2 days');

update public.settings set value = '[{"date":"2026-10-20","name":"Deepavali"},{"date":"2026-11-01","name":"Karnataka Rajyotsava"},{"date":"2026-12-25","name":"Christmas"}]' where key = 'holidays';

select 'Kinderbee CRM ready' as result, (select count(*) from public.students) as students, (select count(*) from auth.users where email like '%@kinderbee.local') as logins;
