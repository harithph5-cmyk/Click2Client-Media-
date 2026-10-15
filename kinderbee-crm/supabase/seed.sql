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
      '{"provider":"email","providers":["email"],"role":"ceo","full_name":"Lakshmi Rao","phone":"+919845000001","username":"ceo"}'::jsonb),
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
