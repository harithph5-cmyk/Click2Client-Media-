-- The website reads the CRM's decision on its own payments, so a verification reaches it even when the push from the
-- verifier's browser didn't. Read-only: it returns only decided payments, and only for website payment ids the caller
-- already knows (the website's own ids). Called with the anon key:
-- POST {SUPABASE_URL}/rest/v1/rpc/website_payment_decisions, body { "p_ids": ["PAY-…", …] }
create or replace function public.website_payment_decisions(p_ids text[])
returns table (website_payment_id text, status text, reject_reason text)
language sql stable security definer set search_path = public as $$
  select sp.website_payment_id, sp.status, sp.reject_reason
  from service_payments sp
  where sp.website_payment_id = any(p_ids[1:200]) and sp.status in ('Verified', 'Rejected')
$$;
revoke execute on function public.website_payment_decisions from public;
grant execute on function public.website_payment_decisions to anon, authenticated;
