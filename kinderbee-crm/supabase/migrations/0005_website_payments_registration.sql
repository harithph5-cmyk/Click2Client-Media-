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
