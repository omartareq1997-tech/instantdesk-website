-- ============================================================
--  InstantDesk — Demo / Seed Data Cleanup
--  Run once in Supabase SQL Editor (or psql).
--  Safe to run multiple times — idempotent.
-- ============================================================
--
--  WHAT THIS DELETES
--  Leads whose names match the original seed / mock data set,
--  scoped to the demo client_id only.  All linked child records
--  (messages → conversations → activity_events → appointments)
--  are removed first to satisfy foreign-key constraints.
--
--  WHAT THIS PRESERVES
--  Any lead not in the name list below is untouched, including
--  real webhook leads (Asem, klaudia, Michael Kowalski, Omar,
--  Webhook Test 1001, Test Lead 999, etc.).
--
--  SAFE GUARDS
--  • Scoped to client_id = '00000000-0000-0000-0000-000000000001'
--  • Wrapped in a transaction — rolls back entirely on any error
--  • Preview SELECT at the top — run it first to check scope
-- ============================================================

-- ── 0. PREVIEW (run this SELECT first, then the DELETE block) ──

SELECT
  id,
  name,
  email,
  source,
  created_at
FROM leads
WHERE client_id = '00000000-0000-0000-0000-000000000001'
  AND name IN (
    'Sarah Mitchell',
    'Fatima Al-Rashid',
    'Chen Wei',
    'James Okafor',
    'Priya Sharma',
    'Daniel Lee',
    'Amina Hassan',
    'Nina Kowalski',
    'Tom Reynolds',
    'Marcus Brown',
    'John Smith'
  )
ORDER BY created_at;

-- ── 1. DELETE BLOCK (run after confirming the preview) ─────────

BEGIN;

  -- Collect fake lead IDs once; reused in every DELETE below
  CREATE TEMP TABLE _demo_lead_ids ON COMMIT DROP AS
    SELECT id
    FROM leads
    WHERE client_id = '00000000-0000-0000-0000-000000000001'
      AND name IN (
        'Sarah Mitchell',
        'Fatima Al-Rashid',
        'Chen Wei',
        'James Okafor',
        'Priya Sharma',
        'Daniel Lee',
        'Amina Hassan',
        'Nina Kowalski',
        'Tom Reynolds',
        'Marcus Brown',
        'John Smith'
      );

  -- 1a. Messages (deepest child — must go first)
  DELETE FROM messages
  WHERE conversation_id IN (
    SELECT id FROM conversations
    WHERE lead_id IN (SELECT id FROM _demo_lead_ids)
  );

  -- 1b. Conversations
  DELETE FROM conversations
  WHERE lead_id IN (SELECT id FROM _demo_lead_ids);

  -- 1c. Activity events linked to fake leads
  DELETE FROM activity_events
  WHERE lead_id IN (SELECT id FROM _demo_lead_ids);

  -- 1d. Standalone activity events not linked to a lead but
  --     referencing a fake name in the title (catches seed rows
  --     that were inserted with lead_id = NULL)
  DELETE FROM activity_events
  WHERE client_id = '00000000-0000-0000-0000-000000000001'
    AND lead_id IS NULL
    AND title ~* '\m(Sarah Mitchell|Fatima Al-Rashid|Chen Wei|James Okafor|Priya Sharma|Daniel Lee|Amina Hassan|Nina Kowalski|Tom Reynolds|Marcus Brown|John Smith)\M';

  -- 1e. Appointments
  DELETE FROM appointments
  WHERE lead_id IN (SELECT id FROM _demo_lead_ids);

  -- 1f. Leads (parent — goes last)
  DELETE FROM leads
  WHERE id IN (SELECT id FROM _demo_lead_ids);

COMMIT;

-- ── 2. VERIFY ──────────────────────────────────────────────────

-- Should return 0 rows if cleanup was successful
SELECT count(*) AS remaining_demo_leads
FROM leads
WHERE client_id = '00000000-0000-0000-0000-000000000001'
  AND name IN (
    'Sarah Mitchell', 'Fatima Al-Rashid', 'Chen Wei', 'James Okafor',
    'Priya Sharma', 'Daniel Lee', 'Amina Hassan', 'Nina Kowalski',
    'Tom Reynolds', 'Marcus Brown', 'John Smith'
  );

-- Real leads that should still be there
SELECT id, name, source, created_at
FROM leads
WHERE client_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC;
