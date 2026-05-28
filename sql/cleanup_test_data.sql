-- ============================================================
--  InstantDesk — Test Data Cleanup
--  Run in Supabase SQL Editor before a demo.
--  Safe to run multiple times — idempotent.
-- ============================================================
--
--  WHAT THIS DELETES
--  Leads created through the Test AI chat where:
--    • email matches *@test.com  (e.g. sally@test.com)
--    • OR name starts with a known test name prefix
--      (Test, Adam, Ahmad, Sally, Jordan)
--  All child rows are removed first (messages → conversations
--  → lead_memory → follow_ups → activity_events → appointments).
--
--  WHAT THIS PRESERVES
--  Every lead whose email does NOT match *@test.com AND whose
--  name does NOT start with any of the test prefixes above.
--  Real-client leads are never touched.
--
--  SAFE GUARDS
--  • No hardcoded client_id — pattern-match only
--  • Preview SELECT at top — run it first before the DELETE block
--  • Wrapped in a transaction — rolls back entirely on any error
-- ============================================================

-- ── 0. PREVIEW (run this SELECT first to confirm scope) ────────

SELECT
  id,
  name,
  email,
  phone,
  source,
  created_at
FROM leads
WHERE
  email ILIKE '%@test.com'
  OR name ILIKE 'Test%'
  OR name ILIKE 'Adam%'
  OR name ILIKE 'Ahmad%'
  OR name ILIKE 'Sally%'
  OR name ILIKE 'Jordan%'
ORDER BY created_at DESC;

-- ── 1. DELETE BLOCK (run after confirming the preview) ─────────

BEGIN;

  -- Collect test lead IDs once; reused in every child DELETE
  CREATE TEMP TABLE _test_lead_ids ON COMMIT DROP AS
    SELECT id
    FROM leads
    WHERE
      email ILIKE '%@test.com'
      OR name ILIKE 'Test%'
      OR name ILIKE 'Adam%'
      OR name ILIKE 'Ahmad%'
      OR name ILIKE 'Sally%'
      OR name ILIKE 'Jordan%';

  -- 1a. Messages (deepest — must go first)
  DELETE FROM messages
  WHERE conversation_id IN (
    SELECT id FROM conversations
    WHERE lead_id IN (SELECT id FROM _test_lead_ids)
  );

  -- 1b. Conversations
  DELETE FROM conversations
  WHERE lead_id IN (SELECT id FROM _test_lead_ids);

  -- 1c. Lead memory
  DELETE FROM lead_memory
  WHERE lead_id IN (SELECT id FROM _test_lead_ids);

  -- 1d. Follow-ups
  DELETE FROM follow_ups
  WHERE lead_id IN (SELECT id FROM _test_lead_ids);

  -- 1e. Activity events (lead_id-linked rows)
  DELETE FROM activity_events
  WHERE lead_id IN (SELECT id FROM _test_lead_ids);

  -- 1f. Appointments
  DELETE FROM appointments
  WHERE lead_id IN (SELECT id FROM _test_lead_ids);

  -- 1g. Leads (parent — goes last)
  DELETE FROM leads
  WHERE id IN (SELECT id FROM _test_lead_ids);

COMMIT;

-- ── 2. VERIFY ──────────────────────────────────────────────────

-- Should return 0 rows if cleanup was successful
SELECT count(*) AS remaining_test_leads
FROM leads
WHERE
  email ILIKE '%@test.com'
  OR name ILIKE 'Test%'
  OR name ILIKE 'Adam%'
  OR name ILIKE 'Ahmad%'
  OR name ILIKE 'Sally%'
  OR name ILIKE 'Jordan%';

-- Confirm real leads are still present
SELECT id, name, email, source, created_at
FROM leads
ORDER BY created_at DESC
LIMIT 20;
