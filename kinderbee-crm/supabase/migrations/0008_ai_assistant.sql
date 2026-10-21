-- WhatsApp phase 3: AI enquiry assistant, knowledge base, lead pipeline, follow-up tasks with SLA escalation,
-- in-app notifications, internal notes and Meta Lead Ads intake.
-- Paste into Supabase → SQL Editor and Run once (after 0007). Existing leads keep their data; two statuses are renamed.

-- ───────────── Settings ─────────────
insert into public.settings values
  ('lead_statuses', '["New","AI Replied","Follow-up Pending","Contacted by Team","Qualified","Converted","Closed","Unreachable","Not Interested","Escalated","Opted Out"]'),
  -- AI replies are off until the CEO turns them on. reply_when: always | after_hours (staff handle working hours)
  ('ai', '{"enabled":false,"model":"claude-haiku-5-5","reply_when":"always","hours":{"start":"09:00","end":"18:00","days":[1,2,3,4,5,6]}}'),
  -- Who gets new enquiries, and how long they have before the CEO is alerted
  ('lead_routing', '{"default_assignee":null,"by_category":{},"sla_hours":4,"manager":null}'),
  -- Meta Lead Ads: form id → lead category (unlisted forms count as admission enquiries)
  ('meta_forms', '{}')
on conflict (key) do nothing;

-- ───────────── Leads: pipeline, source details, AI fields ─────────────
alter table public.leads drop constraint if exists leads_status_check;
update public.leads set status = case status when 'Contacted' then 'Contacted by Team' when 'Follow-up' then 'Follow-up Pending' else status end
 where status in ('Contacted', 'Follow-up');

alter table public.leads drop constraint if exists leads_category_check;
alter table public.leads add constraint leads_category_check
  check (category in ('admission','ntt','consultation','franchise','cbse','degree','jv','general'));

alter table public.leads
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high')),
  add column if not exists intent text,
  add column if not exists ai_summary text,
  add column if not exists child_age text,
  add column if not exists preferred_centre text,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists wa_contact_id uuid references public.wa_contacts(id) on delete set null,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists meta_leadgen_id text unique,
  add column if not exists meta_form_id text,
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_id text;

-- The status list lives in settings (editable); this keeps every row on it.
create or replace function public.leads_status_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (to_jsonb(new.status) <@ coalesce((select value from settings where key = 'lead_statuses'), '[]')) then
    raise exception 'Unknown lead status: %', new.status;
  end if;
  return new;
end $$;
drop trigger if exists leads_status_guard on public.leads;
create trigger leads_status_guard before insert or update of status on public.leads
  for each row execute function public.leads_status_guard();

create or replace function public.lead_open(s text) returns boolean language sql immutable as $$
  select s not in ('Converted','Closed','Not Interested','Opted Out')
$$;

-- ───────────── Knowledge base (only approved, active articles reach the AI) ─────────────
create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text not null default 'general', -- admissions, kips, franchise, teacher_training, curriculum, centres, fees, timings, faq, escalation
  body text not null,
  active boolean not null default true,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.kb_articles enable row level security;
create policy "kb read" on public.kb_articles for select to authenticated using (has_module('whatsapp') or has_module('inquiries'));
create policy "kb ceo" on public.kb_articles for all to authenticated using (is_ceo()) with check (is_ceo());
create trigger audit_kb_articles after insert or update or delete on public.kb_articles for each row execute function public.audit();

-- ───────────── Notifications ─────────────
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_inbox on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "read own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.notify(p_user uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, title, body, link)
  select p_user, left(p_title, 200), left(p_body, 500), p_link where p_user is not null
$$;

-- The CEO(s), plus the manager set in lead routing
create or replace function public.escalation_recipients() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from profiles where role = 'ceo' and active
  union select (value->>'manager')::uuid from settings where key = 'lead_routing' and nullif(value->>'manager', '') is not null
$$;

-- ───────────── Follow-up tasks ─────────────
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  contact_id uuid references public.wa_contacts(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  escalated_at timestamptz,
  outcome text,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null)
);
create index if not exists follow_ups_open on public.follow_ups (status, due_at);
alter table public.follow_ups enable row level security;
create policy "follow ups" on public.follow_ups for all to authenticated
  using (has_module('inquiries') or has_module('whatsapp')) with check (has_module('inquiries') or has_module('whatsapp'));
create trigger audit_follow_ups after insert or update or delete on public.follow_ups for each row execute function public.audit();

-- Assignee for a category from lead routing (category rule, then default, then the first CEO)
create or replace function public.route_lead(p_category text) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(value->'by_category'->>p_category, '')::uuid from settings where key = 'lead_routing'),
    (select nullif(value->>'default_assignee', '')::uuid from settings where key = 'lead_routing'),
    (select id from profiles where role = 'ceo' and active order by created_at limit 1))
$$;

create or replace function public.add_follow_up(p_lead uuid, p_contact uuid, p_assignee uuid, p_title text, p_hours numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  hrs numeric := coalesce(p_hours, (select (value->>'sla_hours')::numeric from settings where key = 'lead_routing'), 4);
begin
  if auth.uid() is not null and not (has_module('inquiries') or has_module('whatsapp')) then raise exception 'Not allowed'; end if;
  -- one open task per lead / conversation is enough
  select id into fid from follow_ups where status = 'open'
    and ((p_lead is not null and lead_id = p_lead) or (p_lead is null and contact_id = p_contact)) limit 1;
  if fid is not null then return fid; end if;
  insert into follow_ups (lead_id, contact_id, assigned_to, title, due_at)
  values (p_lead, p_contact, p_assignee, left(p_title, 200), now() + make_interval(secs => (hrs * 3600)::float8))
  returning id into fid;
  if p_lead is not null then
    update leads set follow_up = (now() + make_interval(secs => (hrs * 3600)::float8))::date where id = p_lead;
  end if;
  perform notify(p_assignee, 'New follow-up: ' || p_title, 'Due within ' || hrs || ' hours', '/whatsapp?tab=followups');
  return fid;
end $$;

-- Marking a task done is the record that the team contacted the lead.
create or replace function public.complete_follow_up(p_id uuid, p_outcome text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f follow_ups;
begin
  if not (has_module('inquiries') or has_module('whatsapp')) then raise exception 'Not allowed'; end if;
  update follow_ups set status = 'done', outcome = left(p_outcome, 1000), done_at = now(), done_by = auth.uid()
   where id = p_id and status = 'open' returning * into f;
  if f.id is null then raise exception 'Task not found or already closed'; end if;
  update leads set status = 'Contacted by Team', last_interaction_at = now()
   where id = f.lead_id and status in ('New','AI Replied','Follow-up Pending','Escalated');
end $$;

-- Every 15 minutes: open tasks past their deadline go to the CEO / manager, once.
create or replace function public.escalate_follow_ups() returns int language plpgsql security definer set search_path = public as $$
declare f record; n int := 0; who uuid;
begin
  for f in update follow_ups set escalated_at = now()
            where status = 'open' and escalated_at is null and due_at < now() returning * loop
    for who in select escalation_recipients() loop
      perform notify(who, 'Overdue follow-up: ' || f.title,
        coalesce('Assigned to ' || (select full_name from profiles where id = f.assigned_to), 'Unassigned') || ', due ' ||
        to_char(f.due_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI'), '/whatsapp?tab=followups');
    end loop;
    update leads set status = 'Escalated' where id = f.lead_id and status in ('New','AI Replied','Follow-up Pending');
    n := n + 1;
  end loop;
  return n;
end $$;

-- New enquiry from any source → routed, task created, assignee notified. Imports are left alone.
create or replace function public.lead_intake() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.source, '') = 'import' then return new; end if;
  if new.assigned_to is null then
    new.assigned_to := route_lead(new.category);
  end if;
  return new;
end $$;
create or replace function public.lead_intake_task() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.source, '') = 'import' then return new; end if;
  perform add_follow_up(new.id, new.wa_contact_id, new.assigned_to, 'Contact ' || new.name || ' (' || new.category || ', ' || coalesce(new.source, 'website') || ')', null);
  if new.priority = 'high' then
    perform notify(new.assigned_to, 'High-priority enquiry: ' || new.name, new.ai_summary, '/inquiries');
  end if;
  return new;
end $$;
drop trigger if exists lead_intake on public.leads;
drop trigger if exists lead_intake_task on public.leads;
create trigger lead_intake before insert on public.leads for each row execute function public.lead_intake();
create trigger lead_intake_task after insert on public.leads for each row execute function public.lead_intake_task();

-- ───────────── Conversation notes (internal, never sent) ─────────────
alter table public.wa_messages drop constraint if exists wa_messages_direction_check;
alter table public.wa_messages add constraint wa_messages_direction_check check (direction in ('in','out','note'));
create policy "wa notes add" on public.wa_messages for insert to authenticated
  with check (has_module('whatsapp') and direction = 'note' and sender = 'staff' and sent_by = auth.uid() and wamid is null);

-- ───────────── AI processing log (no message content) ─────────────
create table if not exists public.ai_logs (
  id bigint generated always as identity primary key,
  contact_id uuid references public.wa_contacts(id) on delete cascade,
  message_id uuid references public.wa_messages(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  model text,
  intent text,
  category text,
  priority text,
  confident boolean,
  needs_human boolean,
  outcome text not null, -- replied | handed_off | skipped:<reason> | error
  error text,
  input_tokens int,
  output_tokens int,
  ms int,
  created_at timestamptz not null default now()
);
create index if not exists ai_logs_recent on public.ai_logs (created_at desc);
alter table public.ai_logs enable row level security;
create policy "ai logs read" on public.ai_logs for select to authenticated using (has_module('whatsapp'));

-- ───────────── AI helpers (service role only) ─────────────
-- Atomically decide whether the AI may answer this inbound message, and if so reserve the outgoing row.
-- Holds the contact row lock, so two runs for the same conversation can't both reply.
create or replace function public.wa_claim_ai_reply(p_message uuid, p_body text, p_simulated boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m wa_messages; c wa_contacts; mid uuid;
begin
  select * into m from wa_messages where id = p_message and direction = 'in';
  if m.id is null then return jsonb_build_object('skip', 'message not found'); end if;
  select * into c from wa_contacts where id = m.contact_id for update;
  if c.opted_out_at is not null then return jsonb_build_object('skip', 'opted out'); end if;
  if c.ai_paused then return jsonb_build_object('skip', 'AI paused'); end if;
  if exists (select 1 from wa_messages where contact_id = c.id and direction = 'in' and created_at > m.created_at) then
    return jsonb_build_object('skip', 'newer message waiting');
  end if;
  if exists (select 1 from wa_messages where contact_id = c.id and direction = 'out' and created_at >= m.created_at) then
    return jsonb_build_object('skip', 'already answered');
  end if;
  insert into wa_messages (contact_id, direction, sender, kind, body, idempotency_key, status, simulated)
  values (c.id, 'out', 'ai', 'text', left(p_body, 4000), 'ai:' || m.id, 'queued', p_simulated)
  on conflict (idempotency_key) do nothing
  returning id into mid;
  if mid is null then return jsonb_build_object('skip', 'already answered'); end if;
  return jsonb_build_object('id', mid, 'phone', c.phone);
end $$;

-- Record what the AI worked out: create or update the enquiry, hand off to a person when needed.
-- p: { intent, category, priority, summary, needs_human, replied, name, child_age, preferred_centre }
create or replace function public.wa_apply_ai(p_contact uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c wa_contacts; lid uuid; cat text := nullif(p->>'category', 'none');
  hi boolean := p->>'priority' = 'high' or coalesce((p->>'needs_human')::boolean, false);
  who uuid;
begin
  select * into c from wa_contacts where id = p_contact;
  if c.id is null then raise exception 'contact not found'; end if;

  -- Same open enquiry for the same need → update it; a new need from a returning contact → new enquiry
  select id into lid from leads
   where lead_open(status) and (wa_contact_id = c.id or right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(c.phone, 10))
     and (cat is null or category = cat)
   order by created_at desc limit 1;

  if lid is null and cat is not null and cat in ('admission','ntt','consultation','franchise','cbse','degree','jv','general') then
    insert into leads (category, name, phone, message, source, wa_contact_id, priority, intent, ai_summary, child_age, preferred_centre,
                       whatsapp_opt_in, last_interaction_at, status)
    values (cat, coalesce(nullif(p->>'name', ''), c.name, c.phone), c.phone,
            (select left(body, 2000) from wa_messages where contact_id = c.id and direction = 'in' order by created_at desc limit 1),
            'WhatsApp Organic', c.id, case when hi then 'high' else coalesce(nullif(p->>'priority', ''), 'normal') end,
            p->>'intent', left(p->>'summary', 1000), nullif(p->>'child_age', ''), nullif(p->>'preferred_centre', ''),
            true, now(), case when (p->>'replied')::boolean then 'AI Replied' when hi then 'Escalated' else 'New' end)
    returning id into lid;
  elsif lid is not null then
    update leads set
      wa_contact_id = c.id, intent = coalesce(p->>'intent', intent), ai_summary = coalesce(left(p->>'summary', 1000), ai_summary),
      child_age = coalesce(nullif(p->>'child_age', ''), child_age), preferred_centre = coalesce(nullif(p->>'preferred_centre', ''), preferred_centre),
      priority = case when hi then 'high' else priority end, last_interaction_at = now(),
      status = case when hi and status in ('New','AI Replied','Follow-up Pending') then 'Escalated'
                    when (p->>'replied')::boolean and status = 'New' then 'AI Replied' else status end
    where id = lid;
  end if;
  update wa_contacts set lead_id = coalesce(lid, lead_id), name = coalesce(name, nullif(p->>'name', '')) where id = c.id;

  if hi then
    -- A person takes over: pause the AI, make sure someone owns it, and tell them now.
    who := coalesce(c.assigned_to, (select assigned_to from leads where id = lid), route_lead(coalesce(cat, 'general')));
    update wa_contacts set ai_paused = true, assigned_to = who where id = c.id;
    perform add_follow_up(lid, c.id, who, 'WhatsApp: ' || coalesce(c.name, c.phone) || ' needs a reply from the team', null);
    perform notify(who, 'WhatsApp needs you: ' || coalesce(c.name, c.phone), left(p->>'summary', 300), '/whatsapp');
  end if;
  return lid;
end $$;

-- ───────────── Webhook: same as 0007, plus the ids of new inbound messages for the AI to answer ─────────────
create or replace function public.wa_ingest_webhook(p jsonb, p_simulated boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch jsonb; m jsonb; s jsonb;
  cid uuid; mid uuid; txt text; word text; n_in int := 0; n_st int := 0; n_dup int := 0; ids jsonb := '[]';
begin
  for ch in select c from jsonb_array_elements(coalesce(p->'entry', '[]')) e, jsonb_array_elements(coalesce(e->'changes', '[]')) c loop
    for m in select * from jsonb_array_elements(coalesce(ch->'value'->'messages', '[]')) loop
      continue when coalesce(m->>'id', '') = '' or coalesce(m->>'from', '') = '';
      insert into wa_webhook_events (event_key, kind) values ('msg:' || (m->>'id'), 'message') on conflict do nothing;
      if not found then n_dup := n_dup + 1; continue; end if;
      cid := wa_contact(m->>'from',
        (select c->'profile'->>'name' from jsonb_array_elements(coalesce(ch->'value'->'contacts', '[]')) c where c->>'wa_id' = m->>'from' limit 1));
      txt := left(coalesce(m->'text'->>'body', m->'button'->>'text', m->'interactive'->'button_reply'->>'title',
                           m->'interactive'->'list_reply'->>'title', m->'image'->>'caption', m->'document'->>'caption',
                           '[' || coalesce(m->>'type', 'message') || ']'), 4000);
      mid := null;
      insert into wa_messages (contact_id, direction, sender, kind, body, wamid, status, simulated, created_at)
      values (cid, 'in', 'contact', coalesce(m->>'type', 'text'), txt, m->>'id', 'received', p_simulated,
              clock_timestamp()) -- arrival time: Meta's timestamp is whole seconds, too coarse to order against our replies
      on conflict (wamid) do nothing
      returning id into mid;
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
      -- opt-out keywords are handled here, not by the AI
      if mid is not null and word not in ('STOP','UNSUBSCRIBE','STOP ALL','OPT OUT','START','SUBSCRIBE') then
        ids := ids || to_jsonb(mid);
      end if;
      if word in ('STOP','UNSUBSCRIBE','STOP ALL','OPT OUT') then
        update leads set status = 'Opted Out' where wa_contact_id = cid and lead_open(status);
      end if;
      n_in := n_in + 1;
    end loop;

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
  return jsonb_build_object('messages', n_in, 'statuses', n_st, 'duplicates', n_dup, 'inbound', ids);
end $$;

-- ───────────── Website + Meta Lead Ads intake with WhatsApp consent ─────────────
-- Same as 0005's submit_lead, plus: whatsapp_opt_in records consent on the WhatsApp contact; general category.
create or replace function public.submit_lead(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  cat text := p->>'category';
  ph text := trim(p->>'phone');
  opt boolean := lower(coalesce(p->>'whatsapp_opt_in', '')) in ('true','yes','on','1');
  cid uuid;
  common text[] := array['category','name','phone','email','city','message','source','website','whatsapp_opt_in'];
begin
  if coalesce(p->>'website', '') <> '' then return; end if; -- honeypot
  if cat is null or cat not in ('admission','ntt','consultation','franchise','cbse','degree','jv','general') then
    raise exception 'category must be one of admission, ntt, consultation, franchise, cbse, degree, jv, general';
  end if;
  if coalesce(trim(p->>'name'), '') = '' or coalesce(ph, '') = '' then raise exception 'name and phone are required'; end if;
  if ph ~ '^[6-9][0-9]{9}$' then ph := '+91' || ph; end if;
  if opt then
    begin
      cid := wa_contact(ph, p->>'name');
      update wa_contacts set opted_in = true, opted_in_at = now(), opted_in_source = 'website form', opted_out_at = null where id = cid;
    exception when others then cid := null; -- not a usable WhatsApp number; keep the enquiry anyway
    end;
  end if;
  insert into leads (category, name, phone, email, city, message, source, extra, whatsapp_opt_in, wa_contact_id)
  values (cat, left(trim(p->>'name'), 120), left(ph, 20), left(p->>'email', 120), left(p->>'city', 80),
    left(p->>'message', 2000), coalesce(left(p->>'source', 40), 'website'),
    coalesce((select jsonb_object_agg(left(k, 40), left(v, 500))
              from (select key k, value v from jsonb_each_text(p) where key <> all(common) limit 20) x), '{}'),
    opt and cid is not null, cid);
end $$;

-- Called by the meta-leads edge function with the lead fetched from the Graph API. Idempotent per leadgen id.
-- p: { leadgen_id, form_id, ad_id, adset_id, campaign_id, field_data: [{name, values: [...]}] }
create or replace function public.submit_meta_lead(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce((select jsonb_object_agg(lower(x->>'name'), x->'values'->>0) from jsonb_array_elements(coalesce(p->'field_data', '[]')) x), '{}');
  cat text := coalesce((select value->>(p->>'form_id') from settings where key = 'meta_forms'), 'admission');
  ph text := coalesce(f->>'phone_number', f->>'phone', '');
  nm text := coalesce(nullif(f->>'full_name', ''), nullif(trim(concat_ws(' ', f->>'first_name', f->>'last_name')), ''), 'Meta lead');
  opt boolean := exists (select 1 from jsonb_each_text(f) where key like '%whatsapp%' and lower(value) in ('yes','true','1','i agree','agree'));
  cid uuid; lid uuid;
begin
  if coalesce(p->>'leadgen_id', '') = '' then raise exception 'leadgen_id required'; end if;
  select id into lid from leads where meta_leadgen_id = p->>'leadgen_id';
  if lid is not null then return lid; end if;
  if cat not in ('admission','ntt','consultation','franchise','cbse','degree','jv','general') then cat := 'admission'; end if;
  if opt then
    begin
      cid := wa_contact(ph, nm);
      update wa_contacts set opted_in = true, opted_in_at = now(), opted_in_source = 'meta lead form', opted_out_at = null where id = cid;
    exception when others then cid := null;
    end;
  end if;
  insert into leads (category, name, phone, email, city, source, extra, whatsapp_opt_in, wa_contact_id,
                     meta_leadgen_id, meta_form_id, meta_campaign_id, meta_adset_id, meta_ad_id)
  values (cat, left(nm, 120), left(ph, 20), left(f->>'email', 120), left(f->>'city', 80), 'Meta Lead Ads',
    coalesce((select jsonb_object_agg(left(key, 40), left(value, 500)) from jsonb_each_text(f)
              where key not in ('full_name','first_name','last_name','phone_number','phone','email','city')), '{}'),
    opt and cid is not null, cid, p->>'leadgen_id', p->>'form_id', p->>'campaign_id', p->>'adset_id', p->>'ad_id')
  on conflict (meta_leadgen_id) do nothing
  returning id into lid;
  return lid;
end $$;

revoke execute on function public.wa_claim_ai_reply, public.wa_apply_ai, public.submit_meta_lead,
  public.escalate_follow_ups, public.notify, public.route_lead, public.escalation_recipients from public, anon, authenticated;
grant execute on function public.wa_claim_ai_reply, public.wa_apply_ai, public.submit_meta_lead,
  public.escalate_follow_ups to service_role;
revoke execute on function public.add_follow_up, public.complete_follow_up from public, anon;
grant execute on function public.add_follow_up, public.complete_follow_up to authenticated;

-- ───────────── Schedule the SLA check (pg_cron is built into Supabase) ─────────────
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'escalate-follow-ups';
  perform cron.schedule('escalate-follow-ups', '*/15 * * * *', 'select public.escalate_follow_ups()');
exception when others then
  raise notice 'pg_cron not available (%). Enable it under Database → Extensions, then run: select cron.schedule(''escalate-follow-ups'', ''*/15 * * * *'', ''select public.escalate_follow_ups()'');', sqlerrm;
end $$;

select 'AI assistant ready' as status, (select count(*) from public.leads) as leads;
