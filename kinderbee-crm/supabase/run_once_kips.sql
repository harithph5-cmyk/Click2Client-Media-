-- Kinderbee: run once in Supabase → SQL Editor. Same as migrations 0004 + 0005 + 0006 in order.
-- Safe to run a second time (it skips what's already there), but 0005 clears students again.

-- ═════ 0004_kips_real_data ═════
-- KIPS real data (20 Oct 2026): staff bio-data, 2026-27 fee schedule, real classes, CEO name.
-- Removes only the demo rows from seed.sql. Paste into Supabase → SQL Editor and Run once.

alter table public.staff add column if not exists qualification text, add column if not exists experience text;
alter table public.fee_components add column if not exists optional boolean not null default false;

-- ── CEO ──
update public.profiles set full_name = 'Sagi' where role = 'ceo';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"full_name":"Sagi"}'
 where id in (select id from public.profiles where role = 'ceo');

-- ── Demo data out (matched on seed.sql's fake phones/emails/references) ──
delete from public.fee_payments where reference like 'DEMO%';
delete from public.students where email like '%@example.com' and parent_phone like '+9198450%';
delete from public.admissions where parent_phone like '+9199001122%';
delete from public.leads where phone like '+91981100000%';
delete from public.service_payments where phone like '+91981100000%';
delete from public.message_log where phone like '+9198450100%';
delete from public.staff where phone like '+91984510000%'; -- cascades demo salary + attendance
update public.profiles set active = false where username = 'priya'; -- demo coordinator with a public password

-- ── Classes ──
update public.settings set value = '["Playgroup","Nursery","LKG","UKG"]' where key = 'programs';
update public.students set program = case program when 'Play Group' then 'Playgroup' when 'Pre-KG' then 'Nursery'
  when 'LKG/Junior KG' then 'LKG' when 'UKG/Senior KG' then 'UKG' else program end;
update public.admissions set program = case program when 'Play Group' then 'Playgroup' when 'Pre-KG' then 'Nursery'
  when 'LKG/Junior KG' then 'LKG' when 'UKG/Senior KG' then 'UKG' else program end;

-- ── Fees 2026-27 (KIPS_CRM_Fees_2026_27.xlsx: Term 1 50%, Term 2 25%, Term 3 25%) ──
-- Due dates were not in the sheet; these are placeholders, edit them in Fees → Fee structure.
delete from public.fee_components where academic_year = '2026-27';
insert into public.fee_components (program, academic_year, name, amount, due_date, monthly, optional, sort)
select f.program, '2026-27', c.name, c.amount, c.due, false, c.optional, c.sort
from (values ('Playgroup', 45000, 2500, 1500), ('Nursery', 50000, 2500, 2000),
             ('LKG', 55000, 2500, 2500), ('UKG', 60000, 2500, 3000)) as f(program, annual, uniform, books),
lateral (values ('Term 1', f.annual * 0.50, date '2026-06-15', false, 1),
                ('Term 2', f.annual * 0.25, date '2026-10-15', false, 2),
                ('Term 3', f.annual * 0.25, date '2027-01-15', false, 3),
                ('Uniform Kit', f.uniform, date '2026-06-15', false, 4),
                ('Books (optional)', f.books, null, true, 5)) as c(name, amount, due, optional, sort);

-- ── Staff (KIPS_Staff_CRM_Master.xlsx + Teachers Bio Data) ──
insert into public.staff (name, role, qualification, experience, joining_date, monthly_salary)
select * from (values
  ('Rashmi Gajendra', 'Centre Coordinator', 'B.Com, PTT, Early Childhood Education, Vedic Maths', '10 years', date '2026-06-01', 16000),
  ('S. Sharmila', 'Academic Coordinator', 'MBA', 'Fresher', date '2026-06-01', 11000),
  ('D.R. Sinchana', 'Teacher', 'B.Com', 'Fresher', date '2026-06-01', 8000),
  ('Janet Jacquline', 'Teacher', 'B.Com', 'Fresher', date '2026-08-01', 9000),
  ('N. Pavithra', 'Teacher', 'B.Sc', 'Fresher', date '2026-10-01', 8000),
  ('N. Jeyanthi', 'Senior Nanny', null, null, date '2026-06-01', 9000),
  ('M. Sasi', 'Nanny', null, null, date '2026-06-01', 10000)
) as s(name, role, qualification, experience, joining_date, monthly_salary)
where not exists (select 1 from public.staff x where x.name = s.name);

select 'KIPS data loaded' as status,
  (select count(*) from public.staff) as staff,
  (select count(*) from public.fee_components where academic_year = '2026-27') as fee_lines,
  (select full_name from public.profiles where role = 'ceo' limit 1) as ceo;

-- ═════ 0005_website_payments_registration ═════
-- Student Registration (two parents), new program names, Website page: admission enquiries + website payments.
-- Run after 0004_kips_real_data.sql. Paste into Supabase → SQL Editor and Run once.

-- ── Student Registration ──
alter table public.students add column if not exists parent2_name text, add column if not exists parent2_phone text;
-- Clear every student and admission record (fee payments and attendance for them go too), as requested on 20 Oct 2026
delete from public.admissions;
delete from public.students;

-- ── Programs ──
update public.settings set value = '["Playgroup","Nursery","Junior KG / LKG","Senior KG / UKG","Daycare & Extended Care"]' where key = 'programs';
update public.fee_components set program = case program
  when 'Play Group' then 'Playgroup' when 'Pre-KG' then 'Nursery'
  when 'LKG' then 'Junior KG / LKG' when 'LKG/Junior KG' then 'Junior KG / LKG'
  when 'UKG' then 'Senior KG / UKG' when 'UKG/Senior KG' then 'Senior KG / UKG'
  when 'Daycare' then 'Daycare & Extended Care' else program end;

-- ── Website enquiries: admission enquiries get their own tab ──
alter table public.leads drop constraint if exists leads_category_check;
alter table public.leads add constraint leads_category_check
  check (category in ('admission','ntt','consultation','franchise','cbse','degree','jv'));

-- Same as 0002's submit_lead, plus 'admission' and +91 on bare 10-digit mobiles (the website sends those)
create or replace function public.submit_lead(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  cat text := p->>'category';
  ph text := trim(p->>'phone');
  common text[] := array['category','name','phone','email','city','message','source','website'];
begin
  if coalesce(p->>'website', '') <> '' then return; end if; -- honeypot
  if cat is null or cat not in ('admission','ntt','consultation','franchise','cbse','degree','jv') then
    raise exception 'category must be one of admission, ntt, consultation, franchise, cbse, degree, jv';
  end if;
  if coalesce(trim(p->>'name'), '') = '' or coalesce(ph, '') = '' then raise exception 'name and phone are required'; end if;
  if ph ~ '^[6-9][0-9]{9}$' then ph := '+91' || ph; end if;
  insert into leads (category, name, phone, email, city, message, source, extra)
  values (cat, left(trim(p->>'name'), 120), left(ph, 20), left(p->>'email', 120), left(p->>'city', 80),
    left(p->>'message', 2000), coalesce(left(p->>'source', 40), 'website'),
    coalesce((select jsonb_object_agg(left(k, 40), left(v, 500))
              from (select key k, value v from jsonb_each_text(p) where key <> all(common) limit 20) x), '{}'));
end $$;

-- ── Website payments: recorded as Pending the moment a visitor confirms a payment (UTR) on the website ──
alter table public.service_payments add column if not exists website_payment_id text unique,
  add column if not exists extra jsonb not null default '{}';

-- POST {SUPABASE_URL}/rest/v1/rpc/submit_payment, body { "p": { website_payment_id, payer_name, phone, amount, reference, paid_on, programme, ... } }
-- Insert-only and idempotent per website payment id. Verification still happens in the CRM (verify_service_payment).
create or replace function public.submit_payment(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  prog text := coalesce(p->>'programme', '');
  amt numeric := nullif(p->>'amount', '')::numeric;
  ph text := trim(p->>'phone');
begin
  if coalesce(trim(p->>'payer_name'), '') = '' or coalesce(trim(p->>'reference'), '') = '' or coalesce(trim(p->>'website_payment_id'), '') = '' then
    raise exception 'payer_name, reference and website_payment_id are required';
  end if;
  if amt is null or amt <= 0 or amt > 1000000 then raise exception 'amount must be between 1 and 10,00,000'; end if;
  if ph ~ '^[6-9][0-9]{9}$' then ph := '+91' || ph; end if;
  insert into service_payments (payer_name, phone, service, amount, mode, reference, paid_on, status, website_payment_id, extra)
  values (left(trim(p->>'payer_name'), 120), left(ph, 20),
    case when prog ilike '%consultation%' then 'One-on-One Consultation'
         when prog ilike '%ntt%' or prog ilike '%teacher training%' then 'NTT Teacher Training'
         when prog ilike '%franchise%' then 'Franchise'
         when prog ilike '%cbse%' then 'CBSE School'
         when prog ilike '%degree%' then 'Degree College' else 'Other' end,
    amt, 'upi', left(p->>'reference', 40), coalesce(nullif(p->>'paid_on', '')::date, current_date), 'Pending',
    left(p->>'website_payment_id', 80),
    jsonb_strip_nulls(jsonb_build_object('programme', nullif(left(prog, 200), ''), 'email', left(p->>'email', 120),
      'booking', left(p->>'booking', 40), 'notes', left(p->>'notes', 500), 'source', 'website')))
  on conflict (website_payment_id) do nothing;
end $$;
revoke execute on function public.submit_payment from public;
grant execute on function public.submit_payment to anon, authenticated;

select 'Website payments ready' as status,
  (select value from public.settings where key = 'programs') as programs,
  (select count(*) from public.students) as students;

-- ═════ 0006_staff_attendance_lock ═════
-- Staff attendance is saved once a day and then locked. Enforced here, so it holds whatever the app does:
-- coordinators can only mark today (India time) and can't change or delete a saved day. The CEO can correct anything.
-- Paste into Supabase → SQL Editor and Run once (after 0005).

alter table public.staff_attendance add column if not exists locked_at timestamptz;

drop trigger if exists staff_attendance_guard on public.staff_attendance;

-- Days marked before this change count as saved
update public.staff_attendance set locked_at = now()
 where locked_at is null and day < (now() at time zone 'Asia/Kolkata')::date;

create or replace function public.staff_attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_ceo() then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' and old.locked_at is not null then
    raise exception 'Attendance for % is saved and locked. Ask the CEO to correct it.', to_char(old.day, 'DD-MM-YYYY');
  end if;
  if tg_op <> 'DELETE' and new.day <> (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Staff attendance can only be marked for today.';
  end if;
  return coalesce(new, old);
end $$;

create trigger staff_attendance_guard before insert or update or delete on public.staff_attendance
  for each row execute function public.staff_attendance_guard();

select 'Staff attendance lock ready' as status;
