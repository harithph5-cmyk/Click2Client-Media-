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
