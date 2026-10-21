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
