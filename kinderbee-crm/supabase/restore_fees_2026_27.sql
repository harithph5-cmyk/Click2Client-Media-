-- 2026-27 fee structure from KIPS_CRM_Fees_2026_27.xlsx (Term 1 50%, Term 2 25%, Term 3 25%, uniform kit, optional books).
-- Paste into Supabase → SQL Editor and Run. Safe to run more than once: existing lines are corrected in place
-- (so fee payments already recorded against them stay linked), missing lines are added.
-- Due dates are placeholders (not in the sheet); change them in CRM → Fees → Fee structure.

with fees(program, annual, uniform, books) as (values
  ('Playgroup', 45000, 2500, 1500),
  ('Nursery', 50000, 2500, 2000),
  ('Junior KG / LKG', 55000, 2500, 2500),
  ('Senior KG / UKG', 60000, 2500, 3000)
), lines as (
  select f.program, c.name, c.amount, c.due, c.optional, c.sort
  from fees f, lateral (values
    ('Term 1', f.annual * 0.50, date '2026-06-15', false, 1),
    ('Term 2', f.annual * 0.25, date '2026-10-15', false, 2),
    ('Term 3', f.annual * 0.25, date '2027-01-15', false, 3),
    ('Uniform Kit', f.uniform, date '2026-06-15', false, 4),
    ('Books (optional)', f.books, null::date, true, 5)) as c(name, amount, due, optional, sort)
), fixed as (
  update public.fee_components fc
     set amount = l.amount, optional = l.optional, sort = l.sort, monthly = false
    from lines l
   where fc.academic_year = '2026-27' and fc.program = l.program and fc.name = l.name
  returning fc.program, fc.name
)
insert into public.fee_components (program, academic_year, name, amount, due_date, monthly, optional, sort)
select l.program, '2026-27', l.name, l.amount, l.due, false, l.optional, l.sort
from lines l
where not exists (select 1 from public.fee_components fc
                  where fc.academic_year = '2026-27' and fc.program = l.program and fc.name = l.name);

select program, name, amount, due_date, optional
from public.fee_components where academic_year = '2026-27'
order by program, sort;
