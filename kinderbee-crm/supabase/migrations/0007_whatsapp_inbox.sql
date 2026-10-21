-- WhatsApp phase 2: one contact per number (with consent / opt-out), the two-way message history, and
-- webhook processing done in the database so a duplicate Meta delivery can never create a second row.
-- Paste into Supabase → SQL Editor and Run once (after 0006). Adds tables and columns only; nothing is deleted.

-- ── Settings: mode replaces the old enabled flag (off = wa.me links, mock = simulated, live = Cloud API) ──
update public.settings
   set value = value || jsonb_build_object('mode', case when (value->>'enabled')::boolean then 'live' else 'off' end)
 where key = 'whatsapp' and not value ? 'mode';

-- ── Contacts: one row per WhatsApp number. Also the conversation (WhatsApp has one thread per number). ──
create table if not exists public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+[0-9]{8,15}$'), -- E.164
  name text,
  lead_id uuid references public.leads(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  -- consent
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  opted_in_source text,
  opted_out_at timestamptz,
  last_inbound_at timestamptz, -- free-text replies are allowed for 24h after this
  -- conversation
  status text not null default 'open' check (status in ('open','resolved')),
  assigned_to uuid references public.profiles(id) on delete set null,
  ai_paused boolean not null default false,
  unread int not null default 0,
  last_message_at timestamptz,
  last_message text,
  created_at timestamptz not null default now()
);
create index if not exists wa_contacts_recent on public.wa_contacts (last_message_at desc nulls last);

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.wa_contacts(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender text not null check (sender in ('contact','staff','ai','system')),
  sent_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'text', -- text, template, image, button, …
  body text,
  template text,
  wamid text unique,               -- Meta message id: duplicate webhooks hit this
  idempotency_key text unique,     -- caller-supplied: a double-click can't send twice
  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','received')),
  error text,
  simulated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_thread on public.wa_messages (contact_id, created_at);

-- Every webhook item we've seen, keyed so Meta's retries are ignored. Payload kept only when processing failed.
create table if not exists public.wa_webhook_events (
  event_key text primary key, -- msg:<wamid> or st:<wamid>:<status>
  kind text not null,
  error text,
  payload jsonb,
  received_at timestamptz not null default now()
);

alter table public.message_log add column if not exists contact_id uuid references public.wa_contacts(id) on delete set null,
  add column if not exists simulated boolean not null default false;

-- ── Contact upsert: links the number to an existing enquiry or student the first time we see it ──
create or replace function public.wa_contact(p_phone text, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  ph text;
  cid uuid;
begin
  if length(d) = 10 and d ~ '^[6-9]' then d := '91' || d; end if;
  if length(d) < 8 or length(d) > 15 then raise exception 'Invalid phone number: %', p_phone; end if;
  ph := '+' || d;
  insert into wa_contacts (phone, name, lead_id, student_id)
  values (ph, nullif(left(trim(p_name), 120), ''),
    (select id from leads where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(d, 10) order by created_at desc limit 1),
    (select id from students where right(d, 10) in (right(regexp_replace(coalesce(parent_phone, ''), '\D', '', 'g'), 10),
                                                    right(regexp_replace(coalesce(parent2_phone, ''), '\D', '', 'g'), 10))
       order by active desc, created_at desc limit 1))
  on conflict (phone) do update set name = coalesce(wa_contacts.name, excluded.name)
  returning id into cid;
  return cid;
end $$;

-- Delivery statuses arrive out of order; never move backwards (read → delivered). failed always wins.
create or replace function public.wa_status_rank(s text) returns int language sql immutable as $$
  select case s when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else -1 end
$$;

-- ── Webhook processing. Called by the whatsapp-webhook edge function after it checks Meta's signature. ──
create or replace function public.wa_ingest_webhook(p jsonb, p_simulated boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch jsonb; m jsonb; s jsonb;
  cid uuid; txt text; word text; n_in int := 0; n_st int := 0; n_dup int := 0;
begin
  for ch in select c from jsonb_array_elements(coalesce(p->'entry', '[]')) e, jsonb_array_elements(coalesce(e->'changes', '[]')) c loop
    -- Incoming messages
    for m in select * from jsonb_array_elements(coalesce(ch->'value'->'messages', '[]')) loop
      continue when coalesce(m->>'id', '') = '' or coalesce(m->>'from', '') = '';
      insert into wa_webhook_events (event_key, kind) values ('msg:' || (m->>'id'), 'message') on conflict do nothing;
      if not found then n_dup := n_dup + 1; continue; end if;
      cid := wa_contact(m->>'from',
        (select c->'profile'->>'name' from jsonb_array_elements(coalesce(ch->'value'->'contacts', '[]')) c where c->>'wa_id' = m->>'from' limit 1));
      txt := left(coalesce(m->'text'->>'body', m->'button'->>'text', m->'interactive'->'button_reply'->>'title',
                           m->'interactive'->'list_reply'->>'title', m->'image'->>'caption', m->'document'->>'caption',
                           '[' || coalesce(m->>'type', 'message') || ']'), 4000);
      insert into wa_messages (contact_id, direction, sender, kind, body, wamid, status, simulated, created_at)
      values (cid, 'in', 'contact', coalesce(m->>'type', 'text'), txt, m->>'id', 'received', p_simulated,
              coalesce(to_timestamp(nullif(m->>'timestamp', '')::bigint), now()))
      on conflict (wamid) do nothing;
      word := upper(regexp_replace(trim(txt), '[^A-Za-z ]', '', 'g'));
      update wa_contacts set
        last_inbound_at = now(), last_message_at = now(), last_message = left(txt, 200),
        unread = unread + 1, status = 'open',
        opted_out_at = case when word in ('STOP','UNSUBSCRIBE','STOP ALL','OPT OUT') then now()
                            when word in ('START','SUBSCRIBE') then null else opted_out_at end,
        opted_in = case when word in ('START','SUBSCRIBE') then true else opted_in end,
        opted_in_at = case when word in ('START','SUBSCRIBE') then now() else opted_in_at end,
        opted_in_source = case when word in ('START','SUBSCRIBE') then 'whatsapp START' else opted_in_source end
      where id = cid;
      n_in := n_in + 1;
    end loop;

    -- Delivery statuses for messages we sent
    for s in select * from jsonb_array_elements(coalesce(ch->'value'->'statuses', '[]')) loop
      continue when coalesce(s->>'id', '') = '' or coalesce(s->>'status', '') not in ('sent','delivered','read','failed');
      insert into wa_webhook_events (event_key, kind) values ('st:' || (s->>'id') || ':' || (s->>'status'), 'status') on conflict do nothing;
      if not found then n_dup := n_dup + 1; continue; end if;
      update wa_messages set status = s->>'status',
             error = coalesce(left(s->'errors'->0->>'title', 300), error)
       where wamid = s->>'id' and wa_status_rank(s->>'status') > wa_status_rank(status);
      update message_log set status = s->>'status', error = left(s->'errors'->0->>'title', 300)
       where provider_id = s->>'id' and wa_status_rank(s->>'status') > wa_status_rank(status);
      n_st := n_st + 1;
    end loop;
  end loop;
  return jsonb_build_object('messages', n_in, 'statuses', n_st, 'duplicates', n_dup);
end $$;

-- Mock mode only: drop a fake inbound message into the inbox so the flow can be tested without Meta.
create or replace function public.wa_simulate_inbound(p_phone text, p_name text, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not has_module('whatsapp') then raise exception 'Not allowed'; end if;
  if coalesce((select value->>'mode' from settings where key = 'whatsapp'), 'off') <> 'mock' then
    raise exception 'Simulated messages only work in mock mode (Settings → WhatsApp)';
  end if;
  if length(d) = 10 then d := '91' || d; end if;
  return wa_ingest_webhook(jsonb_build_object('entry', jsonb_build_array(jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('value', jsonb_build_object(
      'contacts', jsonb_build_array(jsonb_build_object('wa_id', d, 'profile', jsonb_build_object('name', p_name))),
      'messages', jsonb_build_array(jsonb_build_object('id', 'mock.' || gen_random_uuid(), 'from', d, 'type', 'text',
        'timestamp', extract(epoch from now())::bigint::text, 'text', jsonb_build_object('body', left(p_text, 4000)))))))))), true);
end $$;

revoke execute on function public.wa_contact, public.wa_ingest_webhook from public, anon, authenticated;
grant execute on function public.wa_contact, public.wa_ingest_webhook to service_role;
revoke execute on function public.wa_simulate_inbound from public, anon;
grant execute on function public.wa_simulate_inbound to authenticated;

-- ── Access: staff read and manage conversations; only the server (service role) writes messages ──
alter table public.wa_contacts enable row level security;
create policy "wa contacts read" on public.wa_contacts for select to authenticated using (has_module('whatsapp'));
create policy "wa contacts manage" on public.wa_contacts for update to authenticated
  using (has_module('whatsapp')) with check (has_module('whatsapp'));

alter table public.wa_messages enable row level security;
create policy "wa messages read" on public.wa_messages for select to authenticated using (has_module('whatsapp'));

alter table public.wa_webhook_events enable row level security;
create policy "wa events ceo" on public.wa_webhook_events for select to authenticated using (is_ceo());

-- Consent, assignment and status changes land in audit_log (not every unread-count bump)
create trigger audit_wa_contacts after insert or delete on public.wa_contacts
  for each row execute function public.audit();
create trigger audit_wa_contacts_change after update on public.wa_contacts for each row
  when ((old.status, old.assigned_to, old.ai_paused, old.opted_in, old.opted_out_at)
        is distinct from (new.status, new.assigned_to, new.ai_paused, new.opted_in, new.opted_out_at))
  execute function public.audit();

select 'WhatsApp inbox ready' as status, (select value from public.settings where key = 'whatsapp') as whatsapp;
