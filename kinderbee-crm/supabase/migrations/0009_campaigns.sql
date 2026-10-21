-- WhatsApp phase 4: template approval tracking, campaigns with a background send queue, consent records,
-- the WhatsApp overview numbers, and data retention.
-- Paste into Supabase → SQL Editor and Run once (after 0008). Adds tables and columns only.

-- ───────────── Templates: Meta approval is tracked, never assumed ─────────────
alter table public.message_templates
  add column if not exists category text not null default 'utility' check (category in ('utility','marketing','authentication')),
  add column if not exists header text,
  add column if not exists footer text,
  add column if not exists buttons jsonb not null default '[]',  -- [{type: QUICK_REPLY|URL|PHONE_NUMBER, text, url?, phone_number?}]
  add column if not exists examples jsonb not null default '{}', -- {placeholder: sample value}, required by Meta for review
  add column if not exists meta_status text not null default 'draft'
    check (meta_status in ('draft','pending','approved','rejected','paused','disabled')),
  add column if not exists meta_template_id text,
  add column if not exists meta_reason text,
  add column if not exists approval_simulated boolean not null default false, -- "approved" in mock mode only
  add column if not exists updated_at timestamptz not null default now();

-- Staff can edit templates but never set their approval; any content change sends it back to draft.
create or replace function public.template_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then -- a person, not the server
    if tg_op = 'INSERT' then
      new.meta_status := 'draft'; new.meta_template_id := null; new.approval_simulated := false; new.meta_reason := null;
    elsif (new.meta_status, new.meta_template_id, new.approval_simulated) is distinct from (old.meta_status, old.meta_template_id, old.approval_simulated) then
      raise exception 'Template approval comes from Meta. Use Submit / Sync.';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.body, new.category, new.header, new.footer, new.buttons, new.lang, new.meta_template)
       is distinct from (old.body, old.category, old.header, old.footer, old.buttons, old.lang, old.meta_template) then
    new.meta_status := 'draft'; new.meta_template_id := null; new.approval_simulated := false;
  end if;
  return new;
end $$;
drop trigger if exists template_guard on public.message_templates;
create trigger template_guard before insert or update on public.message_templates for each row execute function public.template_guard();

-- Meta's message_template_status_update webhook (called by whatsapp-webhook)
create or replace function public.wa_template_status(p_name text, p_lang text, p_event text, p_id text, p_reason text)
returns void language sql security definer set search_path = public as $$
  update message_templates set
    meta_status = case upper(p_event) when 'APPROVED' then 'approved' when 'REJECTED' then 'rejected' when 'PAUSED' then 'paused'
                    when 'DISABLED' then 'disabled' when 'PENDING' then 'pending' else meta_status end,
    meta_template_id = coalesce(p_id, meta_template_id), meta_reason = nullif(p_reason, 'NONE'), approval_simulated = false
  where meta_template = p_name and lang = p_lang
$$;

-- ───────────── Consent: recorded by the CEO with its source, audited ─────────────
create or replace function public.record_consent(p_phones text[], p_source text, p_opt_in boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text; cid uuid; ok int := 0; bad int := 0;
begin
  if not is_ceo() then raise exception 'Only the CEO can record WhatsApp consent'; end if;
  if coalesce(trim(p_source), '') = '' then raise exception 'Say where the consent came from (e.g. admission form clause)'; end if;
  foreach ph in array coalesce(p_phones, '{}') loop
    begin
      cid := wa_contact(ph, null);
      update wa_contacts set
        opted_in = p_opt_in, opted_in_at = case when p_opt_in then now() else opted_in_at end,
        opted_in_source = case when p_opt_in then left(p_source, 200) else opted_in_source end,
        opted_out_at = case when p_opt_in then null else now() end
      where id = cid;
      ok := ok + 1;
    exception when others then bad := bad + 1;
    end;
  end loop;
  return jsonb_build_object('updated', ok, 'invalid', bad);
end $$;
revoke execute on function public.record_consent from public, anon;
grant execute on function public.record_consent to authenticated;

-- ───────────── Campaigns ─────────────
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text,
  kind text not null check (kind in ('fee_reminder','reopening','holiday','admission_followup','franchise_followup','announcement')),
  template_id uuid not null references public.message_templates(id) on delete restrict,
  -- {source: students|leads|contacts, programs: [], fee: overdue|upcoming|any, upcoming_days, categories: [], statuses: [], since}
  audience jsonb not null default '{}',
  vars jsonb not null default '{}', -- campaign-wide values, e.g. reopening_date, holiday_date
  status text not null default 'draft' check (status in ('draft','scheduled','running','paused','completed','cancelled')),
  dry_run boolean not null default false,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  built_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  phone text not null,
  name text,
  contact_id uuid references public.wa_contacts(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  vars jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','sending','sent','skipped','failed','cancelled','dry_run')),
  reason text,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  wa_message_id uuid references public.wa_messages(id) on delete set null,
  body text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone) -- one message per person per campaign
);
create index if not exists campaign_queue on public.campaign_recipients (status, next_attempt_at) where status in ('pending','sending');

alter table public.campaigns enable row level security;
create policy "campaigns read" on public.campaigns for select to authenticated using (has_module('whatsapp'));
-- Drafts only; scheduling, pausing and cancelling go through the functions below.
create policy "campaigns draft" on public.campaigns for insert to authenticated
  with check (has_module('whatsapp') and status = 'draft' and approved_by is null);
create policy "campaigns edit draft" on public.campaigns for update to authenticated
  using (has_module('whatsapp') and status = 'draft') with check (has_module('whatsapp') and status = 'draft' and approved_by is null);
create policy "campaigns delete draft" on public.campaigns for delete to authenticated using (has_module('whatsapp') and status = 'draft');
alter table public.campaign_recipients enable row level security;
create policy "recipients read" on public.campaign_recipients for select to authenticated using (has_module('whatsapp'));
create trigger audit_campaigns after insert or update or delete on public.campaigns for each row execute function public.audit();

-- Which template category a campaign type must use (marketing can't go out dressed as a utility message)
create or replace function public.campaign_category(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'fee_reminder' then 'utility' when 'reopening' then 'utility' when 'holiday' then 'utility'
                     when 'admission_followup' then 'marketing' when 'franchise_followup' then 'marketing' else null end
$$;

-- CEO approves and schedules. Send-now = scheduled for now; the queue picks it up within a minute.
create or replace function public.campaign_schedule(p_id uuid, p_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare c campaigns; t message_templates; mode text; n int;
begin
  if not is_ceo() then raise exception 'Only the CEO can approve and schedule campaigns'; end if;
  select * into c from campaigns where id = p_id for update;
  if c.id is null or c.status not in ('draft','paused') then raise exception 'Only draft or paused campaigns can be scheduled'; end if;
  select * into t from message_templates where id = c.template_id;
  mode := coalesce((select value->>'mode' from settings where key = 'whatsapp'), 'off');
  if not c.dry_run then
    if t.meta_status <> 'approved' then raise exception 'Template "%" is not approved by Meta (status: %)', t.name, t.meta_status; end if;
    if t.approval_simulated and mode = 'live' then raise exception 'Template "%" was only approved in mock mode. Submit it to Meta first.', t.name; end if;
    if mode = 'off' then raise exception 'WhatsApp sending is off. Choose Mock or Live in Settings.'; end if;
    if campaign_category(c.kind) is not null and t.category <> campaign_category(c.kind) then
      raise exception 'A % campaign must use a % template; "%" is %', c.kind, campaign_category(c.kind), t.name, t.category;
    end if;
  end if;
  if c.built_at is null then raise exception 'Build the recipient list first'; end if;
  select count(*) into n from campaign_recipients where campaign_id = p_id and status = 'pending';
  if n = 0 then raise exception 'No eligible recipients'; end if;
  update campaigns set status = case when coalesce(p_at, now()) <= now() then 'running' else 'scheduled' end,
    scheduled_at = coalesce(p_at, now()), started_at = case when coalesce(p_at, now()) <= now() then now() else null end,
    approved_by = auth.uid()
  where id = p_id;
end $$;

-- Pause / resume / cancel. Anyone with WhatsApp access can pause or cancel; resuming needs the CEO.
create or replace function public.campaign_control(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare c campaigns;
begin
  if not has_module('whatsapp') then raise exception 'Not allowed'; end if;
  select * into c from campaigns where id = p_id for update;
  if c.id is null then raise exception 'Campaign not found'; end if;
  if p_action = 'pause' and c.status in ('scheduled','running') then
    update campaigns set status = 'paused' where id = p_id;
  elsif p_action = 'resume' and c.status = 'paused' then
    if not is_ceo() then raise exception 'Only the CEO can resume a campaign'; end if;
    update campaigns set status = case when scheduled_at > now() then 'scheduled' else 'running' end,
      started_at = coalesce(started_at, case when scheduled_at <= now() then now() end) where id = p_id;
  elsif p_action = 'cancel' and c.status in ('draft','scheduled','running','paused') then
    update campaigns set status = 'cancelled', completed_at = now() where id = p_id;
    update campaign_recipients set status = 'cancelled', reason = 'Campaign cancelled', updated_at = now()
     where campaign_id = p_id and status = 'pending';
  else
    raise exception 'Cannot % a % campaign', p_action, c.status;
  end if;
end $$;
revoke execute on function public.campaign_schedule, public.campaign_control from public, anon;
grant execute on function public.campaign_schedule, public.campaign_control to authenticated;

-- ───────────── Queue (called by the wa-worker edge function) ─────────────
-- Starts due campaigns, gives up on sends interrupted mid-flight (never resent: they may have gone out),
-- then claims up to p_limit recipients. skip locked: two workers never take the same row.
create or replace function public.wa_campaign_claim(p_limit int)
returns setof public.campaign_recipients language plpgsql security definer set search_path = public as $$
begin
  update campaigns set status = 'running', started_at = coalesce(started_at, now())
   where status = 'scheduled' and scheduled_at <= now();
  update campaign_recipients set status = 'failed', reason = 'Interrupted while sending; not retried to avoid a duplicate', updated_at = now()
   where status = 'sending' and updated_at < now() - interval '15 minutes';
  return query
  update campaign_recipients r set status = 'sending', attempts = r.attempts + 1, updated_at = now()
   where r.id in (
     select r2.id from campaign_recipients r2 join campaigns c on c.id = r2.campaign_id
      where c.status = 'running' and r2.status = 'pending' and r2.next_attempt_at <= now()
      order by c.scheduled_at, r2.id
      limit greatest(p_limit, 0)
      for update of r2 skip locked)
  returning r.*;
end $$;

-- Campaigns with nothing left to send are complete.
create or replace function public.wa_campaign_finish() returns int language sql security definer set search_path = public as $$
  with done as (
    update campaigns c set status = 'completed', completed_at = now()
     where c.status = 'running'
       and not exists (select 1 from campaign_recipients r where r.campaign_id = c.id and r.status in ('pending','sending'))
    returning 1)
  select count(*)::int from done
$$;

-- Messages sent by campaigns today (India time), for the daily cap
create or replace function public.wa_sent_today() returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from campaign_recipients
   where status = 'sent' and sent_at >= ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata'
$$;

revoke execute on function public.wa_campaign_claim, public.wa_campaign_finish, public.wa_sent_today, public.wa_template_status
  from public, anon, authenticated;
grant execute on function public.wa_campaign_claim, public.wa_campaign_finish, public.wa_sent_today, public.wa_template_status to service_role;

insert into public.settings values
  ('campaign_limits', '{"per_minute": 60, "daily_max": 1000, "max_attempts": 5}'),
  ('retention', '{"webhook_event_days": 30, "ai_log_days": 180, "notification_days": 90}')
on conflict (key) do nothing;

-- The pg_cron → wa-worker call authenticates with this; the edge function compares it.
insert into public.app_secrets values ('worker_secret', encode(gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

-- Every minute while campaigns are active: ask the worker to send the next batch.
-- Needs settings.whatsapp.functions_url (saved from Settings → WhatsApp) and the pg_net extension.
create or replace function public.wa_kick_worker() returns void language plpgsql security definer set search_path = public as $$
declare base text := (select value->>'functions_url' from settings where key = 'whatsapp');
begin
  if coalesce(base, '') = '' or not exists (select 1 from campaigns where status in ('scheduled','running')) then return; end if;
  perform net.http_post(
    url := base || '/wa-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', (select value from app_secrets where key = 'worker_secret')),
    body := '{}'::jsonb);
end $$;

-- ───────────── Retention: drop what we no longer need ─────────────
create or replace function public.wa_retention() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := (select value from settings where key = 'retention'); a int; b int; c int;
begin
  delete from wa_webhook_events where received_at < now() - make_interval(days => coalesce((r->>'webhook_event_days')::int, 30));
  get diagnostics a = row_count;
  delete from ai_logs where created_at < now() - make_interval(days => coalesce((r->>'ai_log_days')::int, 180));
  get diagnostics b = row_count;
  delete from notifications where read_at is not null and created_at < now() - make_interval(days => coalesce((r->>'notification_days')::int, 90));
  get diagnostics c = row_count;
  return jsonb_build_object('webhook_events', a, 'ai_logs', b, 'notifications', c);
end $$;
revoke execute on function public.wa_kick_worker, public.wa_retention from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_net;
  perform cron.unschedule(jobid) from cron.job where jobname in ('wa-worker', 'wa-retention');
  perform cron.schedule('wa-worker', '* * * * *', 'select public.wa_kick_worker()');
  perform cron.schedule('wa-retention', '30 2 * * *', 'select public.wa_retention()');
exception when others then
  raise notice 'pg_cron/pg_net not available (%). Enable both under Database → Extensions, then run: select cron.schedule(''wa-worker'', ''* * * * *'', ''select public.wa_kick_worker()''); select cron.schedule(''wa-retention'', ''30 2 * * *'', ''select public.wa_retention()'');', sqlerrm;
end $$;

-- ───────────── WhatsApp overview (stored data only) ─────────────
create or replace function public.wa_overview(p_from timestamptz, p_to timestamptz, p_source text default null, p_assignee uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not has_module('whatsapp') then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'active_conversations', (select count(*) from wa_contacts where status = 'open' and last_message_at >= now() - interval '7 days'
                               and (p_assignee is null or assigned_to = p_assignee)),
    'new_enquiries', (select count(*) from leads where created_at >= p_from and created_at < p_to
                        and (p_source is null or source = p_source) and (p_assignee is null or assigned_to = p_assignee)),
    'enquiries_by_source', (select coalesce(jsonb_object_agg(s, n), '{}') from (select coalesce(source, 'unknown') s, count(*) n from leads
                              where created_at >= p_from and created_at < p_to group by 1) x),
    'awaiting_follow_up', (select count(*) from follow_ups where status = 'open' and (p_assignee is null or assigned_to = p_assignee)),
    'overdue_follow_ups', (select count(*) from follow_ups where status = 'open' and due_at < now() and (p_assignee is null or assigned_to = p_assignee)),
    'conversations_by_owner', (select coalesce(jsonb_object_agg(coalesce(p.full_name, 'Unassigned'), n), '{}') from
                                 (select assigned_to, count(*) n from wa_contacts where status = 'open' group by 1) x
                                 left join profiles p on p.id = x.assigned_to),
    'ai_handled', (select count(*) from wa_contacts where not ai_paused and status = 'open'),
    'human_handled', (select count(*) from wa_contacts where ai_paused and status = 'open'),
    'campaigns', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from campaigns group by 1) x),
    'messages', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from wa_messages
                   where direction = 'out' and created_at >= p_from and created_at < p_to group by 1) x),
    'simulated_messages', (select count(*) from wa_messages where direction = 'out' and simulated and created_at >= p_from and created_at < p_to),
    'ai_failures', (select count(*) from ai_logs where outcome = 'error' and created_at >= p_from and created_at < p_to),
    'ai_replies', (select count(*) from ai_logs where outcome in ('replied','handed_off') and created_at >= p_from and created_at < p_to),
    'webhook_failures', (select count(*) from wa_webhook_events where kind = 'error' and received_at >= p_from and received_at < p_to)
  ) into out;
  return out;
end $$;
revoke execute on function public.wa_overview from public, anon;
grant execute on function public.wa_overview to authenticated;

-- Staff with WhatsApp access shouldn't be able to export or message the whole contact list:
-- contacts stay readable (needed for the inbox), but campaign sends need CEO approval above.

select 'Campaigns ready' as status, (select count(*) from public.message_templates) as templates;
