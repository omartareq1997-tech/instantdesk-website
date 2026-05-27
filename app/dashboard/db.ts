/**
 * ═══════════════════════════════════════════════════════════════════════
 *  InstantDesk — Client Dashboard · Database Schema & Query Layer
 * ═══════════════════════════════════════════════════════════════════════
 *
 * DATABASE SCHEMA  (Supabase / PostgreSQL)
 * ────────────────────────────────────────────────────────────────────────
 *
 * TABLE: clients
 *   id              UUID        PK  DEFAULT gen_random_uuid()
 *   user_id         UUID        FK  REFERENCES auth.users(id) ON DELETE CASCADE
 *   business_name   TEXT        NOT NULL
 *   plan            TEXT        DEFAULT 'starter'          -- 'starter'|'professional'|'enterprise'
 *   timezone        TEXT        DEFAULT 'Europe/London'
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 *   updated_at      TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE: leads
 *   id              UUID        PK  DEFAULT gen_random_uuid()
 *   client_id       UUID        FK  REFERENCES clients(id) ON DELETE CASCADE
 *   name            TEXT        NOT NULL
 *   company         TEXT
 *   email           TEXT
 *   phone           TEXT
 *   source          TEXT                                   -- 'website_chat'|'whatsapp'|'email'|'instagram'|'phone'
 *   interest        TEXT                                   -- service/product they enquired about
 *   assigned_agent  TEXT
 *   score           INTEGER     DEFAULT 0  CHECK (score BETWEEN 0 AND 100)
 *   score_label     TEXT        DEFAULT 'cold'  CHECK (score_label IN ('hot','warm','cold'))
 *   status          TEXT        DEFAULT 'new'   CHECK (status IN ('new','contacted','demo_booked','won','lost'))
 *   ai_sms          TEXT        DEFAULT 'off'              -- 'sent'|'scheduled'|'off'
 *   email_seq       TEXT        DEFAULT 'not_started'      -- 'active'|'paused'|'not_started'
 *   nurture         TEXT        DEFAULT 'not_started'      -- 'active'|'not_started'
 *   smart_assign    TEXT        DEFAULT 'unassigned'       -- 'assigned'|'unassigned'
 *   auto_call       TEXT        DEFAULT 'off'              -- 'scheduled'|'completed'|'off'
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 *   updated_at      TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE: conversations
 *   id              UUID        PK  DEFAULT gen_random_uuid()
 *   client_id       UUID        FK  REFERENCES clients(id) ON DELETE CASCADE
 *   lead_id         UUID        FK  REFERENCES leads(id) ON DELETE SET NULL
 *   channel         TEXT        NOT NULL                   -- 'whatsapp'|'website'|'email'|'instagram'
 *   status          TEXT        DEFAULT 'open'             -- 'open'|'closed'|'pending'
 *   last_message_at TIMESTAMPTZ
 *   unread_count    INTEGER     DEFAULT 0
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE: messages
 *   id               UUID        PK  DEFAULT gen_random_uuid()
 *   conversation_id  UUID        FK  REFERENCES conversations(id) ON DELETE CASCADE
 *   client_id        UUID        FK  REFERENCES clients(id)  ON DELETE CASCADE
 *   from_role        TEXT        NOT NULL  CHECK (from_role IN ('user','ai','agent'))
 *   content          TEXT        NOT NULL
 *   response_time_ms INTEGER                               -- AI response time in ms; NULL for user messages
 *   created_at       TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE: appointments
 *   id              UUID        PK  DEFAULT gen_random_uuid()
 *   client_id       UUID        FK  REFERENCES clients(id) ON DELETE CASCADE
 *   lead_id         UUID        FK  REFERENCES leads(id)   ON DELETE SET NULL
 *   lead_name       TEXT
 *   lead_company    TEXT
 *   type            TEXT        NOT NULL                   -- 'demo_call'|'discovery_call'|'onboarding'|'follow_up'
 *   scheduled_at    TIMESTAMPTZ NOT NULL
 *   status          TEXT        DEFAULT 'pending'
 *                               CHECK (status IN ('confirmed','pending','completed','cancelled'))
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE: activity_events
 *   id              UUID        PK  DEFAULT gen_random_uuid()
 *   client_id       UUID        FK  REFERENCES clients(id) ON DELETE CASCADE
 *   lead_id         UUID        FK  REFERENCES leads(id)   ON DELETE SET NULL
 *   type            TEXT        NOT NULL
 *                               CHECK (type IN ('sms','appointment','assignment','email','call'))
 *   title           TEXT        NOT NULL
 *   description     TEXT
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE: analytics_daily
 *   id               UUID        PK  DEFAULT gen_random_uuid()
 *   client_id        UUID        FK  REFERENCES clients(id) ON DELETE CASCADE
 *   date             DATE        NOT NULL
 *   messages_count   INTEGER     DEFAULT 0
 *   new_leads        INTEGER     DEFAULT 0
 *   demos_booked     INTEGER     DEFAULT 0
 *   avg_response_ms  INTEGER                               -- NULL if no AI responses that day
 *   conversion_rate  NUMERIC(5,2)                          -- 0.00–100.00
 *   created_at       TIMESTAMPTZ DEFAULT NOW()
 *   UNIQUE(client_id, date)
 *
 * TABLE: integrations_status
 *   id                UUID        PK  DEFAULT gen_random_uuid()
 *   client_id         UUID        FK  REFERENCES clients(id) ON DELETE CASCADE
 *   integration_type  TEXT        NOT NULL                 -- 'whatsapp'|'webchat'|'email'|'crm'
 *   status            TEXT        DEFAULT 'inactive'
 *                                 CHECK (status IN ('active','inactive','connected','paused','error'))
 *   last_activity_at  TIMESTAMPTZ
 *   messages_week     INTEGER     DEFAULT 0
 *   leads_captured    INTEGER     DEFAULT 0
 *   metadata          JSONB                                -- extra config (e.g. phone number, webhook URL)
 *   updated_at        TIMESTAMPTZ DEFAULT NOW()
 *   UNIQUE(client_id, integration_type)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ROW LEVEL SECURITY (RLS)
 * ────────────────────────────────────────────────────────────────────────
 *  Run these after creating the tables:
 *
 *   ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE conversations      ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE activity_events    ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE analytics_daily    ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE integrations_status ENABLE ROW LEVEL SECURITY;
 *
 *   -- Clients can only see their own record
 *   CREATE POLICY "clients_own_row"
 *     ON clients FOR ALL
 *     USING (user_id = auth.uid());
 *
 *   -- Helper: resolve client_id from the current session user
 *   CREATE FUNCTION current_client_id() RETURNS UUID AS $$
 *     SELECT id FROM clients WHERE user_id = auth.uid() LIMIT 1;
 *   $$ LANGUAGE SQL STABLE;
 *
 *   -- Apply to every child table (repeat for each):
 *   CREATE POLICY "leads_own_client"
 *     ON leads FOR ALL
 *     USING (client_id = current_client_id());
 *
 * ════════════════════════════════════════════════════════════════════════
 *  RECOMMENDED INDEXES
 * ────────────────────────────────────────────────────────────────────────
 *   CREATE INDEX leads_client_score       ON leads            (client_id, score DESC);
 *   CREATE INDEX leads_client_status      ON leads            (client_id, status);
 *   CREATE INDEX appts_client_scheduled   ON appointments     (client_id, scheduled_at);
 *   CREATE INDEX activity_client_created  ON activity_events  (client_id, created_at DESC);
 *   CREATE INDEX analytics_client_date    ON analytics_daily  (client_id, date DESC);
 *   CREATE INDEX messages_conv_created    ON messages         (conversation_id, created_at);
 *   CREATE INDEX convos_client_lead       ON conversations    (client_id, lead_id);
 *
 * ════════════════════════════════════════════════════════════════════════
 *  TODO: Replace DEMO_CLIENT_ID with the actual client_id resolved from
 *  the authenticated session once client-portal auth is implemented.
 *  The query functions accept an optional clientId argument for this.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { createAdminClient } from '../lib/supabase-server'
import type {
  DashboardData, Lead, Appointment, ActivityItem,
  AnalyticsDay, IntegrationRow, AnalyticsSummary, OverviewMetrics,
  AutoState, LeadStatus, ScoreLabel, ApptStatus, ActivityType,
  LiveAnalytics, DailyCount, SourceCount,
} from './types'

/* ─── Client IDs ─────────────────────────────────────────────────
 *   BUSINESS_ID  — used for the `leads` table (column: business_id)
 *                  This is the AI chat widget's business identifier.
 *   DEMO_CLIENT_ID — used for all other tables (conversations, messages,
 *                  appointments, activity_events) which use `client_id`.
 *                  Same value; different column names across tables.
 * ──────────────────────────────────────────────────────────────── */
const BUSINESS_ID    = process.env.DEMO_CLIENT_ID ?? '0616a47a-2c01-49ce-a798-385f8276b92b'
const DEMO_CLIENT_ID = BUSINESS_ID


// 14 days of analytics (Mon → Sun × 2), matching chart data in AnalyticsSection.tsx
const MOCK_ANALYTICS: AnalyticsDay[] = [
  { date:'2026-05-08', messagesCount:45,  newLeads:2, demosBooked:0, avgResponseMs:4200, conversionRate:8  },
  { date:'2026-05-09', messagesCount:58,  newLeads:3, demosBooked:1, avgResponseMs:3800, conversionRate:10 },
  { date:'2026-05-10', messagesCount:72,  newLeads:4, demosBooked:1, avgResponseMs:4500, conversionRate:11 },
  { date:'2026-05-11', messagesCount:67,  newLeads:3, demosBooked:2, avgResponseMs:3100, conversionRate:13 },
  { date:'2026-05-12', messagesCount:51,  newLeads:2, demosBooked:1, avgResponseMs:2900, conversionRate:12 },
  { date:'2026-05-13', messagesCount:23,  newLeads:1, demosBooked:0, avgResponseMs:3500, conversionRate:10 },
  { date:'2026-05-14', messagesCount:18,  newLeads:1, demosBooked:0, avgResponseMs:2700, conversionRate:9  },
  { date:'2026-05-15', messagesCount:63,  newLeads:4, demosBooked:1, avgResponseMs:2400, conversionRate:15 },
  { date:'2026-05-16', messagesCount:79,  newLeads:5, demosBooked:2, avgResponseMs:2800, conversionRate:17 },
  { date:'2026-05-17', messagesCount:85,  newLeads:5, demosBooked:2, avgResponseMs:2200, conversionRate:15 },
  { date:'2026-05-18', messagesCount:91,  newLeads:6, demosBooked:3, avgResponseMs:2900, conversionRate:20 },
  { date:'2026-05-19', messagesCount:78,  newLeads:4, demosBooked:2, avgResponseMs:2200, conversionRate:18 },
  { date:'2026-05-20', messagesCount:31,  newLeads:1, demosBooked:0, avgResponseMs:2800, conversionRate:16 },
  { date:'2026-05-21', messagesCount:24,  newLeads:1, demosBooked:0, avgResponseMs:2400, conversionRate:17 },
]

const MOCK_INTEGRATIONS: IntegrationRow[] = [
  { id:'whatsapp', integrationType:'whatsapp', status:'active',    lastActivityAt:'2026-05-21T09:13:00Z', messagesWeek:127, leadsCaptured:8,  metadata:null },
  { id:'webchat',  integrationType:'webchat',  status:'active',    lastActivityAt:'2026-05-21T09:07:00Z', messagesWeek:89,  leadsCaptured:5,  metadata:null },
  { id:'email',    integrationType:'email',    status:'active',    lastActivityAt:'2026-05-21T08:00:00Z', messagesWeek:34,  leadsCaptured:3,  metadata:null },
  { id:'crm',      integrationType:'crm',      status:'connected', lastActivityAt:'2026-05-21T08:50:00Z', messagesWeek:0,   leadsCaptured:47, metadata:null },
]

/* ─── DB row types (snake_case from Supabase) ────────────────────── */

// Matches the real leads table written by /api/chat.
// Old client_id-based fields are optional so mapLead handles both schemas.
interface LeadRow {
  id: string
  business_id?: string          // AI chat leads use business_id column
  client_id?:   string          // ingest/lead leads use client_id column
  name: string
  company?:       string | null
  email?:         string | null
  phone?:         string | null
  source?:        string | null
  interest?:      string | null
  conversation_id?: string | null
  assigned_agent?: string | null
  score?:         number | null
  score_label?:   string | null
  status?:        string | null
  ai_sms?:        string | null
  email_seq?:     string | null
  nurture?:       string | null
  smart_assign?:  string | null
  auto_call?:     string | null
  metadata?:      Record<string, unknown> | null
  created_at: string
  updated_at?: string
}

interface AppointmentRow {
  id: string; business_id?: string; client_id?: string; lead_id: string | null
  lead_name: string | null; lead_company?: string | null
  type?: string; scheduled_at: string; status: string; created_at: string
  notes?: string | null
}

interface ActivityRow {
  id: string; business_id?: string; lead_id: string | null
  type: string; title: string; description: string | null; created_at: string
}

interface AnalyticsRow {
  id: string; client_id: string; date: string
  messages_count: number; new_leads: number; demos_booked: number
  avg_response_ms: number | null; conversion_rate: number | null
}

interface IntegrationStatusRow {
  id: string; client_id: string; integration_type: string; status: string
  last_activity_at: string | null; messages_week: number; leads_captured: number
  metadata: Record<string, unknown> | null; updated_at: string
}

/* ─── Mappers ─────────────────────────────────────────────────────── */

function mapLead(r: LeadRow): Lead {
  return {
    id:              r.id,
    name:            r.name,
    company:         r.company        ?? '',
    email:           r.email          ?? undefined,
    phone:           r.phone          ?? undefined,
    source:          r.source         ?? 'website_chat',
    interest:        r.interest       ?? '',
    assignedAgent:   r.assigned_agent ?? 'Unassigned',
    score:           r.score          ?? 0,
    scoreLabel:     (r.score_label    as ScoreLabel) ?? 'cold',
    status:         (r.status         as LeadStatus) ?? 'new',
    date:            r.created_at,
    conversation_id: r.conversation_id ?? null,
    metadata:        r.metadata       ?? undefined,
    auto: {
      aiSms:       (r.ai_sms       as AutoState['aiSms'])       ?? 'off',
      emailSeq:    (r.email_seq    as AutoState['emailSeq'])    ?? 'not_started',
      nurture:     (r.nurture      as AutoState['nurture'])     ?? 'not_started',
      smartAssign: (r.smart_assign as AutoState['smartAssign']) ?? 'unassigned',
      autoCall:    (r.auto_call    as AutoState['autoCall'])    ?? 'off',
    },
  }
}

function mapAppointment(r: AppointmentRow): Appointment {
  // scheduled_at is NOT NULL in schema but guard against null/invalid values at runtime
  const raw = r.scheduled_at ?? ''
  const dt  = raw ? new Date(raw) : new Date()
  const validDt = !isNaN(dt.getTime()) ? dt : new Date()
  const today = new Date()
  return {
    id:       r.id,
    name:     r.lead_name    ?? 'Unknown',
    company:  r.lead_company ?? '',
    type:     (r.type ?? 'demo_call').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    date:     validDt.toISOString().split('T')[0],
    time:     validDt.toTimeString().slice(0, 5),
    status:  (r.status as ApptStatus) ?? 'pending',
    upcoming: validDt > today,
    leadId:   r.lead_id ?? undefined,
    notes:    r.notes   ?? undefined,
  }
}

function mapActivity(r: ActivityRow): ActivityItem {
  const diff = Date.now() - new Date(r.created_at).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  const time  = mins < 1 ? 'Just now' : mins < 60 ? `${mins} min ago` : hours < 24 ? `${hours} hour${hours>1?'s':''} ago` : `${days} day${days>1?'s':''} ago`
  return {
    id:   r.id,
    type: (r.type as ActivityType) ?? 'email',
    text: r.title,
    sub:  r.description ?? '',
    time,
  }
}

function mapAnalytics(r: AnalyticsRow): AnalyticsDay {
  return {
    date:           r.date,
    messagesCount:  r.messages_count,
    newLeads:       r.new_leads,
    demosBooked:    r.demos_booked,
    avgResponseMs:  r.avg_response_ms  ?? 0,
    conversionRate: r.conversion_rate  ?? 0,
  }
}

function mapIntegration(r: IntegrationStatusRow): IntegrationRow {
  return {
    id:               r.id,
    integrationType:  r.integration_type,
    status:          (r.status as IntegrationRow['status']) ?? 'inactive',
    lastActivityAt:   r.last_activity_at,
    messagesWeek:     r.messages_week,
    leadsCaptured:    r.leads_captured,
    metadata:         r.metadata,
  }
}

/* ─── Query functions ────────────────────────────────────────────── */

/**
 * Fetch all leads for a client, sorted by score descending.
 * Returns [] when no leads exist or Supabase is unavailable.
 */
export async function getClientLeads(clientId = DEMO_CLIENT_ID): Promise<Lead[]> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('business_id', clientId)   // AI chat widget inserts with business_id column
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(r => mapLead(r as LeadRow))
  } catch {
    return []
  }
}

/**
 * Fetch open conversations for a client, most recently active first.
 * Returns raw rows; UI can enrich with lead details via getClientLeads.
 */
export async function getClientConversations(clientId = DEMO_CLIENT_ID) {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('conversations')
      .select('id, lead_id, channel, status, last_message_at, unread_count, created_at')
      .eq('business_id', clientId)
      .order('last_message_at', { ascending: false })
    if (error) throw error
    return data ?? []
  } catch {
    return []
  }
}

/**
 * Fetch messages for a single conversation, oldest first.
 */
export async function getClientMessages(conversationId: string) {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch {
    return []
  }
}

/**
 * Fetch all appointments for a client ordered by scheduled_at.
 * Returns [] if the table is empty or Supabase is unavailable.
 */
export async function getClientAppointments(clientId = DEMO_CLIENT_ID): Promise<Appointment[]> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('appointments')
      .select('id, business_id, client_id, lead_id, lead_name, lead_company, type, scheduled_at, status, created_at, notes')
      .eq('business_id', clientId)
      .order('scheduled_at', { ascending: true })
    if (error) {
      console.error('[getClientAppointments] query error:', error.message, error.code, '| business_id filter:', clientId)
      return []
    }
    const rows = data ?? []
    console.log('APPOINTMENTS RETURNED', rows.map(r => ({
      id:           r.id,
      lead_name:    r.lead_name,
      scheduled_at: r.scheduled_at,
      business_id:  r.business_id,
      client_id:    r.client_id,
    })))
    return rows.flatMap(r => {
      try {
        return [mapAppointment(r as AppointmentRow)]
      } catch (mapErr) {
        console.error('[getClientAppointments] mapAppointment failed for row:', r.id, mapErr)
        return []
      }
    })
  } catch (err) {
    console.error('[getClientAppointments] unexpected error:', err)
    return []
  }
}

/**
 * Fetch the 50 most recent activity events for a client, newest first.
 * Returns [] when no events exist or Supabase is unavailable.
 */
export async function getClientActivityEvents(clientId = DEMO_CLIENT_ID): Promise<ActivityItem[]> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('activity_events')
      .select('*')
      .eq('business_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data ?? []).map(r => mapActivity(r as ActivityRow))
  } catch {
    return []
  }
}

/**
 * Fetch the last 90 days of analytics_daily rows for a client.
 * Falls back to MOCK_ANALYTICS.
 */
export async function getClientAnalytics(clientId = DEMO_CLIENT_ID): Promise<AnalyticsDay[]> {
  try {
    const sb = createAdminClient()
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data, error } = await sb
      .from('analytics_daily')
      .select('*')
      .eq('client_id', clientId)
      .gte('date', since)
      .order('date', { ascending: true })
    if (error) throw error
    if (!data?.length) return MOCK_ANALYTICS
    return data.map(r => mapAnalytics(r as AnalyticsRow))
  } catch {
    return MOCK_ANALYTICS
  }
}

/**
 * Fetch the integration status rows for a client (one row per integration type).
 * Falls back to MOCK_INTEGRATIONS.
 */
export async function getIntegrationStatus(clientId = DEMO_CLIENT_ID): Promise<IntegrationRow[]> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('integrations_status')
      .select('*')
      .eq('client_id', clientId)
    if (error) throw error
    if (!data?.length) return MOCK_INTEGRATIONS
    return data.map(r => mapIntegration(r as IntegrationStatusRow))
  } catch {
    return MOCK_INTEGRATIONS
  }
}

/* ─── Analytics summary ──────────────────────────────────────────── */

/**
 * Compute live analytics KPIs from the raw tables:
 *   conversations count, messages count, avg AI response time,
 *   demos booked (appointments), and lead conversion rate.
 * Returns zeros on error — never throws.
 */
export async function getAnalyticsSummary(clientId = DEMO_CLIENT_ID): Promise<AnalyticsSummary> {
  const zero: AnalyticsSummary = {
    totalConversations: 0, totalMessages: 0,
    avgResponseMs: 0, demosBooked: 0, conversionRate: 0,
  }
  try {
    const sb = createAdminClient()

    const [convRes, msgRes, rtRes, demoRes, totalLeadsRes, wonLeadsRes] = await Promise.all([
      // count(conversations)
      sb.from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', clientId),

      // count(messages)
      sb.from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', clientId),

      // avg response_time_ms — column does not exist; stub returns empty so avgResponseMs stays 0
      Promise.resolve({ data: [], error: null }),

      // count(appointments) where confirmed
      sb.from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', clientId)
        .eq('status', 'confirmed'),

      // total leads (uses business_id column)
      sb.from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', clientId),

      // won leads (uses business_id column)
      sb.from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', clientId)
        .eq('status', 'won'),
    ])

    if (convRes.error || msgRes.error || demoRes.error || totalLeadsRes.error || wonLeadsRes.error) {
      return zero
    }

    const rtRows = (rtRes.data ?? []) as { response_time_ms: number }[]
    const avgResponseMs = rtRows.length
      ? Math.round(rtRows.reduce((s, r) => s + r.response_time_ms, 0) / rtRows.length)
      : 0

    const total = totalLeadsRes.count ?? 0
    const won   = wonLeadsRes.count   ?? 0

    return {
      totalConversations: convRes.count ?? 0,
      totalMessages:      msgRes.count  ?? 0,
      avgResponseMs,
      demosBooked:        demoRes.count ?? 0,
      conversionRate:     total > 0 ? Math.round((won / total) * 100) : 0,
    }
  } catch {
    return zero
  }
}

/* ─── Overview metrics ───────────────────────────────────────────── */

/**
 * Compute live KPIs for the Overview tab.
 * Nine queries run in parallel; returns zeros on any error.
 */
export async function getOverviewMetrics(clientId = DEMO_CLIENT_ID): Promise<OverviewMetrics> {
  const zero: OverviewMetrics = {
    newLeadsThisWeek: 0, activeOpportunities: 0, appointmentsThisWeek: 0,
    emailsSentThisWeek: 0, conversionRate: 0, conversionLiftPct: 0,
    agentTimeSavedHrs: 0, monthlyDeals: 0, estimatedRevenue: 0,
  }
  try {
    const sb  = createAdminClient()
    const now = new Date()

    // Monday of the current week (UTC midnight)
    const dow      = now.getUTCDay()                      // 0=Sun … 6=Sat
    const daysBack = dow === 0 ? 6 : dow - 1
    const thisMonday = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack,
    ))
    const thisMondayISO  = thisMonday.toISOString()
    const thisMondayDate = thisMondayISO.split('T')[0]

    // Sunday of the current week
    const thisSunday = new Date(thisMonday)
    thisSunday.setUTCDate(thisMonday.getUTCDate() + 6)
    thisSunday.setUTCHours(23, 59, 59, 999)
    const thisSundayISO = thisSunday.toISOString()

    // Monday of the previous week
    const prevMonday = new Date(thisMonday)
    prevMonday.setUTCDate(thisMonday.getUTCDate() - 7)
    const prevMondayDate = prevMonday.toISOString().split('T')[0]

    // Start of the current calendar month
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

    type AnalyticsSlice = { messages_count?: number; conversion_rate?: number | null }

    const [
      newLeadsRes, activeOppRes, apptWeekRes, emailsWeekRes,
      totalLeadsRes, wonLeadsRes, wonMonthRes,
      thisWeekAnalytics, prevWeekAnalytics,
    ] = await Promise.all([
      // new leads since Monday (business_id column)
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('business_id', clientId).gte('created_at', thisMondayISO),

      // active pipeline — not closed (business_id column)
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('business_id', clientId).in('status', ['new','contacted','demo_booked']),

      // appointments scheduled this week
      sb.from('appointments').select('*', { count:'exact', head:true })
        .eq('business_id', clientId)
        .gte('scheduled_at', thisMondayISO)
        .lte('scheduled_at', thisSundayISO),

      // AI messages sent this week (used as proxy for emails/outreach)
      sb.from('messages').select('*', { count:'exact', head:true })
        .eq('business_id', clientId).eq('role', 'assistant').gte('created_at', thisMondayISO),

      // total leads ever (business_id column)
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('business_id', clientId),

      // won leads ever (business_id column)
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('business_id', clientId).eq('status', 'won'),

      // won leads this month (business_id column)
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('business_id', clientId).eq('status', 'won').gte('created_at', monthStart),

      // this week's analytics_daily rows (messages_count + conversion_rate)
      sb.from('analytics_daily').select('messages_count,conversion_rate')
        .eq('client_id', clientId).gte('date', thisMondayDate),

      // previous week's analytics_daily rows (conversion_rate only)
      sb.from('analytics_daily').select('conversion_rate')
        .eq('client_id', clientId).gte('date', prevMondayDate).lt('date', thisMondayDate),
    ])

    const thisRows = (thisWeekAnalytics.data ?? []) as AnalyticsSlice[]
    const prevRows = (prevWeekAnalytics.data ?? []) as AnalyticsSlice[]

    const thisWeekMsgs    = thisRows.reduce((s, r) => s + (r.messages_count ?? 0), 0)
    const thisWeekConvAvg = thisRows.length
      ? thisRows.reduce((s, r) => s + (r.conversion_rate ?? 0), 0) / thisRows.length : 0
    const prevWeekConvAvg = prevRows.length
      ? prevRows.reduce((s, r) => s + (r.conversion_rate ?? 0), 0) / prevRows.length : 0

    const total = totalLeadsRes.count ?? 0
    const won   = wonLeadsRes.count   ?? 0

    const monthlyDeals     = wonMonthRes.count ?? 0
    const agentTimeSavedHrs = Math.round((thisWeekMsgs / 2 * 3) / 60 * 10) / 10
    const conversionLiftPct = prevWeekConvAvg > 0
      ? Math.round(thisWeekConvAvg - prevWeekConvAvg) : 0

    return {
      newLeadsThisWeek:     newLeadsRes.count    ?? 0,
      activeOpportunities:  activeOppRes.count   ?? 0,
      appointmentsThisWeek: apptWeekRes.count    ?? 0,
      emailsSentThisWeek:   emailsWeekRes.count  ?? 0,
      conversionRate:       total > 0 ? Math.round((won / total) * 100) : 0,
      conversionLiftPct,
      agentTimeSavedHrs,
      monthlyDeals,
      estimatedRevenue:     monthlyDeals * 5000,
    }
  } catch {
    return zero
  }
}

/* ─── Live analytics from real chat tables ───────────────────────── */

/**
 * Aggregates all analytics metrics directly from the live Supabase tables
 * written by /api/chat. Never falls back to mock data — returns zeros
 * when tables are empty so the UI shows honest empty states.
 */
export async function getLiveAnalytics(clientId = DEMO_CLIENT_ID): Promise<LiveAnalytics> {
  const zero: LiveAnalytics = {
    totalConversations: 0, totalMessages: 0, totalLeads: 0,
    aiMessages: 0, userMessages: 0, conversionRate: 0,
    messagesPerDay: [], leadsPerDay: [], sourceBreakdown: [], intentBreakdown: [],
  }

  try {
    const sb    = createAdminClient()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [convRes, msgRes, aiMsgRes, userMsgRes, leadsRes, msgDailyRes, leadDailyRes] = await Promise.all([
      // Total conversations
      sb.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', clientId),

      // Total messages
      sb.from('messages').select('*', { count: 'exact', head: true }).eq('business_id', clientId),

      // AI messages only
      sb.from('messages').select('*', { count: 'exact', head: true })
        .eq('business_id', clientId).eq('role', 'assistant'),

      // User messages only
      sb.from('messages').select('*', { count: 'exact', head: true })
        .eq('business_id', clientId).eq('role', 'user'),

      // All leads with source + interest (for breakdown)
      sb.from('leads').select('source, interest, created_at')
        .eq('business_id', clientId)
        .order('created_at', { ascending: false }),

      // Messages with timestamp for per-day grouping (last 30 days)
      sb.from('messages').select('created_at').eq('business_id', clientId).gte('created_at', since),

      // Leads with timestamp for per-day grouping (last 30 days)
      sb.from('leads').select('created_at').eq('business_id', clientId).gte('created_at', since),
    ])

    const totalConversations = convRes.count     ?? 0
    const totalMessages      = msgRes.count      ?? 0
    const aiMessages         = aiMsgRes.count    ?? 0
    const userMessages       = userMsgRes.count  ?? 0
    const allLeads           = (leadsRes.data    ?? []) as { source: string | null; interest: string | null; created_at: string }[]
    const totalLeads         = allLeads.length
    const conversionRate     = totalConversations > 0
      ? Math.round((totalLeads / totalConversations) * 100) : 0

    // Group messages by day
    const msgDayMap = new Map<string, number>()
    for (const row of ((msgDailyRes.data ?? []) as { created_at: string }[])) {
      const day = row.created_at.slice(0, 10)
      msgDayMap.set(day, (msgDayMap.get(day) ?? 0) + 1)
    }
    const messagesPerDay: DailyCount[] = [...msgDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }))

    // Group leads by day
    const leadDayMap = new Map<string, number>()
    for (const row of ((leadDailyRes.data ?? []) as { created_at: string }[])) {
      const day = row.created_at.slice(0, 10)
      leadDayMap.set(day, (leadDayMap.get(day) ?? 0) + 1)
    }
    const leadsPerDay: DailyCount[] = [...leadDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }))

    // Source breakdown
    const sourceMap = new Map<string, number>()
    for (const lead of allLeads) {
      const src = lead.source ?? 'unknown'
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1)
    }
    const sourceBreakdown: SourceCount[] = [...sourceMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }))

    // Intent / interest breakdown (top non-empty values)
    const intentMap = new Map<string, number>()
    for (const lead of allLeads) {
      const intent = lead.interest?.trim()
      if (!intent) continue
      // Truncate long strings so they work as chart labels
      const key = intent.length > 30 ? intent.slice(0, 27) + '…' : intent
      intentMap.set(key, (intentMap.get(key) ?? 0) + 1)
    }
    const intentBreakdown: SourceCount[] = [...intentMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }))

    return {
      totalConversations, totalMessages, totalLeads,
      aiMessages, userMessages, conversionRate,
      messagesPerDay, leadsPerDay, sourceBreakdown, intentBreakdown,
    }
  } catch {
    return zero
  }
}

/* ─── Live activity from chat data ──────────────────────────────── */

function relativeTime(ts: number): string {
  const diff  = Date.now() - ts
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  return mins < 1 ? 'Just now'
    : mins < 60   ? `${mins} min ago`
    : hours < 24  ? `${hours} hour${hours > 1 ? 's' : ''} ago`
    : `${days} day${days > 1 ? 's' : ''} ago`
}

/**
 * Build the activity feed from live Supabase data.
 * Merges three sources:
 *   1. New leads    (leads table, business_id) → "New lead captured — {name}"
 *   2. Conversations (conversations, client_id) → "Conversation started"
 *   3. AI replies   (messages, client_id, from_role=ai) → "AI replied"
 * Sorted newest-first, capped at 30 items.
 */
export async function getActivityFromLiveData(clientId = DEMO_CLIENT_ID): Promise<ActivityItem[]> {
  try {
    const sb = createAdminClient()

    const [leadsRes, convsRes, aiMsgsRes, userMsgsRes, apptsRes] = await Promise.all([
      sb.from('leads')
        .select('id, name, source, created_at')
        .eq('business_id', clientId)
        .order('created_at', { ascending: false })
        .limit(12),

      sb.from('conversations')
        .select('id, channel, created_at')
        .eq('business_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10),

      sb.from('messages')
        .select('id, content, created_at')
        .eq('business_id', clientId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(12),

      sb.from('messages')
        .select('id, content, created_at')
        .eq('business_id', clientId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(12),

      sb.from('appointments')
        .select('id, lead_name, created_at')
        .eq('business_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const items: { ts: number; item: ActivityItem }[] = []

    for (const lead of (leadsRes.data ?? [])) {
      const ts = new Date(lead.created_at as string).getTime()
      items.push({ ts, item: {
        id:   `lead-${lead.id}`,
        type: 'sms',
        text: `New lead captured — ${lead.name}`,
        sub:  `${(lead.source as string | null) ?? 'website_chat'} · AI chat`,
        time: relativeTime(ts),
      }})
    }

    for (const conv of (convsRes.data ?? [])) {
      const ts = new Date(conv.created_at as string).getTime()
      items.push({ ts, item: {
        id:   `conv-${conv.id}`,
        type: 'chat',
        text: 'Conversation started',
        sub:  `${(conv.channel as string | null) ?? 'website'} · AI Agent`,
        time: relativeTime(ts),
      }})
    }

    for (const msg of (aiMsgsRes.data ?? [])) {
      const content = (msg.content as string) ?? ''
      const ts      = new Date(msg.created_at as string).getTime()
      items.push({ ts, item: {
        id:   `aimsg-${msg.id}`,
        type: 'chat',
        text: 'AI replied',
        sub:  content.length > 80 ? content.slice(0, 77) + '…' : content,
        time: relativeTime(ts),
      }})
    }

    for (const msg of (userMsgsRes.data ?? [])) {
      const content = (msg.content as string) ?? ''
      const ts      = new Date(msg.created_at as string).getTime()
      items.push({ ts, item: {
        id:   `usermsg-${msg.id}`,
        type: 'email',
        text: 'User message received',
        sub:  content.length > 80 ? content.slice(0, 77) + '…' : content,
        time: relativeTime(ts),
      }})
    }

    for (const appt of (apptsRes.data ?? [])) {
      const ts = new Date(appt.created_at as string).getTime()
      items.push({ ts, item: {
        id:   `appt-${appt.id}`,
        type: 'appointment',
        text: `Viewing requested — ${(appt.lead_name as string | null) ?? 'Unknown'}`,
        sub:  'AI chat · Pending confirmation',
        time: relativeTime(ts),
      }})
    }

    items.sort((a, b) => b.ts - a.ts)
    return items.slice(0, 30).map(({ item }) => item)
  } catch {
    return []
  }
}

/* ─── Composite fetch ────────────────────────────────────────────── */

/**
 * Fetch all sections in parallel. Called by page.tsx.
 * Any individual query that fails silently returns its mock fallback,
 * so the dashboard always renders — even when Supabase is not yet set up.
 */
export async function getDashboardData(clientId = DEMO_CLIENT_ID): Promise<DashboardData> {
  const [leads, appointments, activity, analytics, integrations, analyticsSummary, overviewMetrics, liveAnalytics] = await Promise.all([
    getClientLeads(clientId),
    getClientAppointments(clientId),
    getActivityFromLiveData(clientId),
    getClientAnalytics(clientId),
    getIntegrationStatus(clientId),
    getAnalyticsSummary(clientId),
    getOverviewMetrics(clientId),
    getLiveAnalytics(clientId),
  ])
  return { leads, appointments, activity, analytics, integrations, analyticsSummary, overviewMetrics, liveAnalytics }
}
