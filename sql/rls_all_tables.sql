-- ═══════════════════════════════════════════════════════════════════════════
--  InstantDesk — Comprehensive RLS Migration  (v2 — corrected column audit)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Safe to re-run: ENABLE ROW LEVEL SECURITY is idempotent; every policy is
--  dropped with IF EXISTS before recreation.
--
--  Auth chain:
--    auth.uid()  →  clients.user_id  →  clients.id
--                                       = business_id  (AI / agent tables)
--                                       = client_id    (CRM / analytics tables)
--
--  ── Per-table column audit ───────────────────────────────────────────────
--
--  TABLE               TENANT COLUMN(S)       EVIDENCE
--  ──────────────────  ─────────────────────  ───────────────────────────
--  clients             user_id                FK → auth.users (schema doc)
--  businesses          id (= clients.id)      getSessionBusinessId upsert
--  leads               business_id ONLY       all INSERT paths use business_id;
--                                             client_id NOT in schema doc —
--                                             original COALESCE caused the error
--  conversations       business_id ONLY       chat route inserts business_id;
--                                             ingest inserts client_id inside
--                                             a try/catch (silently fails if
--                                             column absent) — use business_id
--  messages            business_id ONLY       same reasoning as conversations
--  appointments        BOTH columns exist     appointments route SELECT lists
--                                             both; INSERT sets both explicitly
--  activity_events     client_id              logEvent.ts INSERT outside
--                                             try/catch; activity route queries
--                                             by client_id
--  agents              business_id            create_agent_tables.sql
--  knowledge_sources   business_id            create_agent_tables.sql
--  knowledge_chunks    business_id            create_knowledge_chunks.sql
--  agent_qual_fields   business_id            qualification/route.ts queries
--  follow_ups          business_id            create_follow_ups.sql
--  follow_up_settings  business_id            create_follow_ups.sql
--  automation_settings client_id              create_automation_tables.sql
--  automation_logs     business_id            automation-logs/route.ts (live schema);
--                                             create_automation_tables.sql is stale
--  team_members        client_id              team/route.ts queries + inserts
--  business_limits     business_id            create_business_limits.sql
--  lead_memory         business_id            create_lead_memory.sql
--  analytics_daily     client_id              db.ts schema doc + RPC
--  integrations_status client_id              db.ts schema doc
--
--  Supersedes:
--    sql/add_rls_business_limits.sql
--    sql/create_lead_memory.sql  (inline RLS section)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. Helper function ────────────────────────────────────────────────────
--
--  Returns the clients.id for the authenticated user, NULL when anonymous.
--  SECURITY DEFINER: runs as function owner so it can read clients regardless
--  of any RLS on the clients table itself.

create or replace function current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from clients where user_id = auth.uid() limit 1;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  1. CLIENTS
--     Direct: user_id = auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════

alter table clients enable row level security;

drop policy if exists "clients_owner_all"  on clients;
drop policy if exists "clients_own_row"    on clients;

create policy "clients_owner_all"
  on clients for all
  using     (user_id = auth.uid())
  with check(user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════════
--  2. BUSINESSES
--     id  =  clients.id  (provisioned together; no separate tenant column)
-- ═══════════════════════════════════════════════════════════════════════════

alter table businesses enable row level security;

drop policy if exists "businesses_owner_all" on businesses;

create policy "businesses_owner_all"
  on businesses for all
  using     (id = current_client_id())
  with check(id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  3. LEADS
--     business_id ONLY — all INSERT paths use business_id.
--     client_id does NOT exist on this table (caused the original error).
-- ═══════════════════════════════════════════════════════════════════════════

alter table leads enable row level security;

drop policy if exists "leads_owner_all"  on leads;
drop policy if exists "leads_own_client" on leads;

create policy "leads_owner_all"
  on leads for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  4. CONVERSATIONS
--     business_id ONLY — chat route inserts business_id.
--     Ingest route inserts client_id inside a try/catch; if that column is
--     absent the insert fails silently and this policy remains correct.
-- ═══════════════════════════════════════════════════════════════════════════

alter table conversations enable row level security;

drop policy if exists "conversations_owner_all" on conversations;

create policy "conversations_owner_all"
  on conversations for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  5. MESSAGES
--     business_id ONLY — chat route inserts business_id.
--     Same reasoning as conversations re: ingest try/catch path.
--     Browser realtime subscriptions (anon key) work when the owner is
--     signed in via Supabase Auth.
-- ═══════════════════════════════════════════════════════════════════════════

alter table messages enable row level security;

drop policy if exists "messages_owner_all" on messages;

create policy "messages_owner_all"
  on messages for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  6. APPOINTMENTS
--     BOTH columns confirmed: appointments/route.ts SELECT lists both,
--     and the same INSERT statement sets client_id AND business_id
--     to the same value.  COALESCE is safe here.
-- ═══════════════════════════════════════════════════════════════════════════

alter table appointments enable row level security;

drop policy if exists "appointments_owner_all" on appointments;

create policy "appointments_owner_all"
  on appointments for all
  using     (coalesce(business_id, client_id) = current_client_id())
  with check(coalesce(business_id, client_id) = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  7. ACTIVITY_EVENTS
--     client_id — logEvent.ts inserts client_id unconditionally (outside
--     try/catch); activity/route.ts queries by client_id.
-- ═══════════════════════════════════════════════════════════════════════════

alter table activity_events enable row level security;

drop policy if exists "activity_events_owner_all" on activity_events;

create policy "activity_events_owner_all"
  on activity_events for all
  using     (client_id = current_client_id())
  with check(client_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  8. AGENTS
-- ═══════════════════════════════════════════════════════════════════════════

alter table agents enable row level security;

drop policy if exists "agents_owner_all" on agents;

create policy "agents_owner_all"
  on agents for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  9. KNOWLEDGE_SOURCES
-- ═══════════════════════════════════════════════════════════════════════════

alter table knowledge_sources enable row level security;

drop policy if exists "knowledge_sources_owner_all" on knowledge_sources;

create policy "knowledge_sources_owner_all"
  on knowledge_sources for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  10. KNOWLEDGE_CHUNKS
-- ═══════════════════════════════════════════════════════════════════════════

alter table knowledge_chunks enable row level security;

drop policy if exists "knowledge_chunks_owner_all" on knowledge_chunks;

create policy "knowledge_chunks_owner_all"
  on knowledge_chunks for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  11. AGENT_QUALIFICATION_FIELDS
-- ═══════════════════════════════════════════════════════════════════════════

alter table agent_qualification_fields enable row level security;

drop policy if exists "agent_qualification_fields_owner_all" on agent_qualification_fields;

create policy "agent_qualification_fields_owner_all"
  on agent_qualification_fields for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  12. FOLLOW_UPS
-- ═══════════════════════════════════════════════════════════════════════════

alter table follow_ups enable row level security;

drop policy if exists "follow_ups_owner_all" on follow_ups;

create policy "follow_ups_owner_all"
  on follow_ups for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  13. FOLLOW_UP_SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════

alter table follow_up_settings enable row level security;

drop policy if exists "follow_up_settings_owner_all" on follow_up_settings;

create policy "follow_up_settings_owner_all"
  on follow_up_settings for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  14. AUTOMATION_SETTINGS
--     client_id — confirmed in create_automation_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table automation_settings enable row level security;

drop policy if exists "automation_settings_owner_all" on automation_settings;

create policy "automation_settings_owner_all"
  on automation_settings for all
  using     (client_id = current_client_id())
  with check(client_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  15. AUTOMATION_LOGS
--     business_id — live table uses business_id (automation-logs/route.ts
--     confirms: "actual DB columns: id, business_id, event_type …").
--     create_automation_tables.sql originally used client_id but the table
--     was redesigned; every route (GET, POST, follow-ups worker) uses
--     business_id.  Make.com writes via service role (bypasses RLS).
-- ═══════════════════════════════════════════════════════════════════════════

alter table automation_logs enable row level security;

drop policy if exists "automation_logs_owner_all" on automation_logs;

create policy "automation_logs_owner_all"
  on automation_logs for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  16. TEAM_MEMBERS
--     client_id — confirmed: team/route.ts INSERT and queries both use
--     client_id.  Members authenticate via HMAC cookies (no Supabase Auth
--     user_id), so they operate through the service-role admin client only.
--     This policy protects the owner's view of their team.
-- ═══════════════════════════════════════════════════════════════════════════

alter table team_members enable row level security;

drop policy if exists "team_members_owner_all"   on team_members;
drop policy if exists "team_members_self_select" on team_members;

create policy "team_members_owner_all"
  on team_members for all
  using     (client_id = current_client_id())
  with check(client_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  17. BUSINESS_LIMITS
--     Supersedes sql/add_rls_business_limits.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table business_limits enable row level security;

drop policy if exists "owners can select own limits"       on business_limits;
drop policy if exists "owners can insert own limits"       on business_limits;
drop policy if exists "owners can update own limits"       on business_limits;
drop policy if exists "owners can delete own limits"       on business_limits;
drop policy if exists "team members can select own limits" on business_limits;
drop policy if exists "business_limits_owner_all"          on business_limits;

create policy "business_limits_owner_all"
  on business_limits for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  18. LEAD_MEMORY
--     Supersedes inline policies in sql/create_lead_memory.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table lead_memory enable row level security;

drop policy if exists "owners can manage own lead_memory"       on lead_memory;
drop policy if exists "team members can select own lead_memory" on lead_memory;
drop policy if exists "lead_memory_owner_all"                   on lead_memory;

create policy "lead_memory_owner_all"
  on lead_memory for all
  using     (business_id = current_client_id())
  with check(business_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  19. ANALYTICS_DAILY
--     client_id — confirmed in db.ts schema doc and RPC usage
-- ═══════════════════════════════════════════════════════════════════════════

alter table analytics_daily enable row level security;

drop policy if exists "analytics_daily_owner_all" on analytics_daily;

create policy "analytics_daily_owner_all"
  on analytics_daily for all
  using     (client_id = current_client_id())
  with check(client_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  20. INTEGRATIONS_STATUS
--     client_id — confirmed in db.ts schema doc
-- ═══════════════════════════════════════════════════════════════════════════

alter table integrations_status enable row level security;

drop policy if exists "integrations_status_owner_all" on integrations_status;

create policy "integrations_status_owner_all"
  on integrations_status for all
  using     (client_id = current_client_id())
  with check(client_id = current_client_id());


-- ═══════════════════════════════════════════════════════════════════════════
--  POST-RUN CHECKLIST
-- ═══════════════════════════════════════════════════════════════════════════
--
--  1. Verify the helper resolves correctly (run as an authenticated owner):
--       select current_client_id();
--
--  2. Spot-check tenant isolation:
--       select count(*) from leads;         -- should return your leads only
--
--  3. Confirm realtime still works: open the dashboard Chat tab, send a
--     message, verify it appears live (messages policy uses business_id
--     and the owner must be Supabase-Auth authenticated).
--
--  4. Make.com / service-role writes are unaffected (bypass RLS).
--
--  5. If conversations or messages still have a client_id column from an
--     older schema, the existing rows will be invisible through the anon
--     client until those rows are backfilled with business_id.  Server
--     routes are unaffected (service role bypasses RLS).
-- ═══════════════════════════════════════════════════════════════════════════
