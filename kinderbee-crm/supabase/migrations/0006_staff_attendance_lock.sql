-- Staff attendance is saved once a day and then locked. Enforced here, so it holds whatever the app does:
-- coordinators can only mark today (India time) and can't change or delete a saved day. The CEO can correct anything.
-- Paste into Supabase → SQL Editor and Run once (after 0005).

alter table public.staff_attendance add column if not exists locked_at timestamptz;

drop trigger if exists staff_attendance_guard on public.staff_attendance;

-- Days marked before this change count as saved
update public.staff_attendance set locked_at = now()
 where locked_at is null and day < (now() at time zone 'Asia/Kolkata')::date;

create or replace function public.staff_attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_ceo() then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' and old.locked_at is not null then
    raise exception 'Attendance for % is saved and locked. Ask the CEO to correct it.', to_char(old.day, 'DD-MM-YYYY');
  end if;
  if tg_op <> 'DELETE' and new.day <> (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Staff attendance can only be marked for today.';
  end if;
  return coalesce(new, old);
end $$;

create trigger staff_attendance_guard before insert or update or delete on public.staff_attendance
  for each row execute function public.staff_attendance_guard();

select 'Staff attendance lock ready' as status;
