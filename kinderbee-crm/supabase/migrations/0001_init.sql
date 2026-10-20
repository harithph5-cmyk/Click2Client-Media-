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
