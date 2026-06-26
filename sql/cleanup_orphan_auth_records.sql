-- Maintenance: remove app records that reference deleted Supabase Auth users.
--
-- Run in the Supabase SQL editor with owner/service privileges if a deleted
-- auth.users row left stale app-owned records behind. This keeps owner signup
-- and dashboard provisioning idempotent.

begin;

-- Clients should normally cascade when auth.users is deleted. This removes
-- rows created before the FK/cascade existed or rows imported manually.
delete from clients c
where c.user_id is not null
  and not exists (
    select 1
    from auth.users u
    where u.id = c.user_id
  );

-- Businesses are keyed to clients.id in this app. Remove businesses that no
-- longer have an owning clients row after orphan clients are cleaned.
delete from businesses b
where not exists (
  select 1
  from clients c
  where c.id = b.id
);

commit;
