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
