-- Restore the 7 KIPS staff (KIPS_Staff_CRM_Master.xlsx + Teachers Bio Data). Paste into Supabase → SQL Editor and Run.
-- Anyone still in the list (maybe just marked as left) is switched back on; anyone missing is added again.
-- Safe to run more than once.

update public.staff set active = true
 where name in ('Rashmi Gajendra', 'S. Sharmila', 'D.R. Sinchana', 'Janet Jacquline', 'N. Pavithra', 'N. Jeyanthi', 'M. Sasi');

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
where not exists (select 1 from public.staff x where lower(x.name) = lower(s.name));

select name, role, monthly_salary, active from public.staff order by name;
