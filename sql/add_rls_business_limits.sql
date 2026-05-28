-- RLS policies for business_limits.
--
-- Auth chain:  auth.uid()  →  clients.user_id  →  clients.id  =  business_id
--
-- All server-side routes use the service-role admin client, which bypasses RLS.
-- These policies enforce tenant isolation for any direct or anon-key access.
--
-- Run in the Supabase SQL editor after create_business_limits.sql.

-- 1. Enable RLS
alter table business_limits enable row level security;

-- 2. Owners: full access to their own business row
--    auth.uid() is the Supabase Auth user UUID; resolved to business_id via clients.
create policy "owners can select own limits"
  on business_limits for select
  using (
    business_id in (
      select id from clients where user_id = auth.uid()
    )
  );

create policy "owners can insert own limits"
  on business_limits for insert
  with check (
    business_id in (
      select id from clients where user_id = auth.uid()
    )
  );

create policy "owners can update own limits"
  on business_limits for update
  using (
    business_id in (
      select id from clients where user_id = auth.uid()
    )
  )
  with check (
    business_id in (
      select id from clients where user_id = auth.uid()
    )
  );

create policy "owners can delete own limits"
  on business_limits for delete
  using (
    business_id in (
      select id from clients where user_id = auth.uid()
    )
  );

-- 3. Team members: read-only access via team_members.client_id
--    Members authenticate with HMAC cookies (no Supabase Auth session) so
--    auth.uid() is null for them in practice — this policy covers any future
--    member auth migration to Supabase Auth.
create policy "team members can select own limits"
  on business_limits for select
  using (
    business_id in (
      select client_id from team_members where user_id = auth.uid()
    )
  );

-- 4. Service role always bypasses RLS — no policy needed for server routes.
