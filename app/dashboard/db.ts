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

import { createServerClient } from '../lib/supabase-server'
import type {
  DashboardData, Lead, Appointment, ActivityItem,
  AnalyticsDay, IntegrationRow, AnalyticsSummary, OverviewMetrics,
  AutoState, LeadStatus, ScoreLabel, ApptStatus, ActivityType,
} from './types'

/* ─── Demo client ID ─────────────────────────────────────────────
   Replace with auth.uid() → clients.id lookup when client auth lands.
   ──────────────────────────────────────────────────────────────── */
const DEMO_CLIENT_ID = process.env.DEMO_CLIENT_ID ?? '00000000-0000-0000-0000-000000000001'

/* ─── Mock fallback data ─────────────────────────────────────────
   Returned when Supabase is unavailable or tables are empty.
   Values match the seed data in ClientDashboard.tsx.
   ──────────────────────────────────────────────────────────────── */

const MOCK_LEADS: Lead[] = [
  { id:'1',  name:'Sarah Mitchell',   company:'Orbit Digital',      source:'Website Chat', interest:'AI Receptionist',    assignedAgent:'Priya S.',  score:92, scoreLabel:'hot',  status:'demo_booked', date:'2026-05-21T09:15:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
  { id:'2',  name:'James Okafor',     company:'Okafor & Co',        source:'WhatsApp',     interest:'WhatsApp Automation', assignedAgent:'James M.',  score:78, scoreLabel:'hot',  status:'new',         date:'2026-05-21T08:42:00Z', auto:{ aiSms:'sent',      emailSeq:'not_started', nurture:'not_started', smartAssign:'assigned',   autoCall:'scheduled' }},
  { id:'3',  name:'Priya Sharma',     company:'GrowFast Ltd',       source:'Email',        interest:'Full Suite',          assignedAgent:'Priya S.',  score:61, scoreLabel:'warm', status:'contacted',   date:'2026-05-20T14:30:00Z', auto:{ aiSms:'scheduled', emailSeq:'active',      nurture:'active',      smartAssign:'assigned',   autoCall:'off'       }},
  { id:'4',  name:'Daniel Lee',       company:'Lee Consulting',     source:'Website Chat', interest:'Lead Capture',        assignedAgent:'Daniel C.', score:55, scoreLabel:'warm', status:'won',         date:'2026-05-19T11:00:00Z', auto:{ aiSms:'off',       emailSeq:'paused',      nurture:'active',      smartAssign:'assigned',   autoCall:'completed' }},
  { id:'5',  name:'Amina Hassan',     company:'Hassan Group',       source:'WhatsApp',     interest:'AI Receptionist',    assignedAgent:'Priya S.',  score:48, scoreLabel:'warm', status:'contacted',   date:'2026-05-18T16:20:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
  { id:'6',  name:'Tom Reynolds',     company:'Reynolds Tech',      source:'Website Chat', interest:'WhatsApp Automation', assignedAgent:'James M.',  score:35, scoreLabel:'cold', status:'new',         date:'2026-05-17T10:45:00Z', auto:{ aiSms:'scheduled', emailSeq:'not_started', nurture:'not_started', smartAssign:'unassigned', autoCall:'off'       }},
  { id:'7',  name:'Chen Wei',         company:'Wei Innovations',    source:'WhatsApp',     interest:'Full Suite',          assignedAgent:'Daniel C.', score:83, scoreLabel:'hot',  status:'demo_booked', date:'2026-05-16T09:30:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'scheduled' }},
  { id:'8',  name:'Fatima Al-Rashid', company:'Al-Rashid Partners', source:'Email',        interest:'Enterprise Pack',     assignedAgent:'Sarah K.',  score:90, scoreLabel:'hot',  status:'won',         date:'2026-05-15T13:00:00Z', auto:{ aiSms:'off',       emailSeq:'paused',      nurture:'active',      smartAssign:'assigned',   autoCall:'completed' }},
  { id:'9',  name:'Marcus Brown',     company:'Brown & Associates', source:'Website Chat', interest:'Lead Capture',        assignedAgent:'Sarah K.',  score:22, scoreLabel:'cold', status:'lost',        date:'2026-05-14T15:30:00Z', auto:{ aiSms:'off',       emailSeq:'paused',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
  { id:'10', name:'Nina Kowalski',    company:'Kowalski Design',    source:'WhatsApp',     interest:'WhatsApp Automation', assignedAgent:'James M.',  score:44, scoreLabel:'warm', status:'contacted',   date:'2026-05-13T11:15:00Z', auto:{ aiSms:'sent',      emailSeq:'active',      nurture:'not_started', smartAssign:'assigned',   autoCall:'off'       }},
]


const MOCK_ACTIVITY: ActivityItem[] = [
  { id:'1',  type:'sms',         text:'AI replied to James Okafor in 3s',         sub:'WhatsApp · auto-triggered',         time:'2 min ago',  live:true  },
  { id:'2',  type:'appointment', text:'Demo booked — Sarah Mitchell',              sub:'Thu 22 May · 3:00 PM',             time:'10 min ago'            },
  { id:'3',  type:'assignment',  text:'Lead assigned to Priya S.',               sub:'Chen Wei · smart assignment',       time:'18 min ago'            },
  { id:'4',  type:'email',       text:'Email sequence triggered — Tom Reynolds',  sub:'Follow-up sequence day 1',          time:'32 min ago'            },
  { id:'5',  type:'sms',         text:'AI recovered missed call — Nina Kowalski', sub:'WhatsApp reply sent in 8s',         time:'1 hour ago'            },
  { id:'6',  type:'appointment', text:'Discovery call confirmed — Priya Sharma',  sub:'Fri 23 May · 2:00 PM',             time:'2 hours ago'           },
  { id:'7',  type:'assignment',  text:'Smart assignment — Amina Hassan → Priya S.',sub:'Availability + territory score',  time:'3 hours ago'           },
  { id:'8',  type:'email',       text:'Nurture sequence started — Marcus Brown',  sub:'30-day drip campaign',             time:'5 hours ago'           },
  { id:'9',  type:'call',        text:'Auto-call completed — Daniel Lee',          sub:'Duration: 4 min 32 sec',           time:'Yesterday'             },
  { id:'10', type:'email',       text:'Welcome email sent — James Okafor',         sub:'Instant auto-response',            time:'Yesterday'             },
]

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

interface LeadRow {
  id: string; client_id: string; name: string; company: string | null
  email: string | null; phone: string | null; source: string | null
  interest: string | null; assigned_agent: string | null
  score: number | null; score_label: string | null; status: string | null
  ai_sms: string | null; email_seq: string | null; nurture: string | null
  smart_assign: string | null; auto_call: string | null
  metadata: Record<string, unknown> | null
  created_at: string; updated_at: string
}

interface AppointmentRow {
  id: string; client_id: string; lead_id: string | null
  lead_name: string | null; lead_company: string | null
  type: string; scheduled_at: string; status: string; created_at: string
  notes?: string | null  // optional — requires: ALTER TABLE appointments ADD COLUMN notes TEXT;
}

interface ActivityRow {
  id: string; client_id: string; lead_id: string | null
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
    id:            r.id,
    name:          r.name,
    company:       r.company       ?? '',
    email:         r.email         ?? undefined,
    phone:         r.phone         ?? undefined,
    source:        r.source        ?? 'general',
    interest:      r.interest      ?? '',
    assignedAgent: r.assigned_agent ?? 'Unassigned',
    score:         r.score         ?? 0,
    scoreLabel:   (r.score_label   as ScoreLabel)  ?? 'cold',
    status:       (r.status        as LeadStatus)  ?? 'new',
    date:          r.created_at,
    metadata:     r.metadata ?? undefined,
    auto: {
      aiSms:       (r.ai_sms      as AutoState['aiSms'])       ?? 'off',
      emailSeq:    (r.email_seq   as AutoState['emailSeq'])    ?? 'not_started',
      nurture:     (r.nurture     as AutoState['nurture'])     ?? 'not_started',
      smartAssign: (r.smart_assign as AutoState['smartAssign']) ?? 'unassigned',
      autoCall:    (r.auto_call   as AutoState['autoCall'])    ?? 'off',
    },
  }
}

function mapAppointment(r: AppointmentRow): Appointment {
  const dt = new Date(r.scheduled_at)
  const today = new Date()
  return {
    id:       r.id,
    name:     r.lead_name    ?? 'Unknown',
    company:  r.lead_company ?? '',
    type:     r.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    date:     dt.toISOString().split('T')[0],
    time:     dt.toTimeString().slice(0, 5),
    status:  (r.status as ApptStatus) ?? 'pending',
    upcoming: dt > today,
    leadId:   r.lead_id  ?? undefined,
    notes:    r.notes    ?? undefined,
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
 * Falls back to MOCK_LEADS if Supabase is unavailable or tables are empty.
 */
export async function getClientLeads(clientId = DEMO_CLIENT_ID): Promise<Lead[]> {
  try {
    const sb = createServerClient()
    const { data, error } = await sb
      .from('leads')
      .select('*')
      .eq('client_id', clientId)
      .order('score', { ascending: false })
    if (error) throw error
    if (!data?.length) return MOCK_LEADS
    return data.map(r => mapLead(r as LeadRow))
  } catch {
    return MOCK_LEADS
  }
}

/**
 * Fetch open conversations for a client, most recently active first.
 * Returns raw rows; UI can enrich with lead details via getClientLeads.
 */
export async function getClientConversations(clientId = DEMO_CLIENT_ID) {
  try {
    const sb = createServerClient()
    const { data, error } = await sb
      .from('conversations')
      .select('id, lead_id, channel, status, last_message_at, unread_count, created_at')
      .eq('client_id', clientId)
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
    const sb = createServerClient()
    const { data, error } = await sb
      .from('messages')
      .select('id, from_role, content, response_time_ms, created_at')
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
    const sb = createServerClient()
    const { data, error } = await sb
      .from('appointments')
      .select('*')
      .eq('client_id', clientId)
      .order('scheduled_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map(r => mapAppointment(r as AppointmentRow))
  } catch {
    return []
  }
}

/**
 * Fetch the 50 most recent activity events for a client.
 * Falls back to MOCK_ACTIVITY.
 */
export async function getClientActivityEvents(clientId = DEMO_CLIENT_ID): Promise<ActivityItem[]> {
  try {
    const sb = createServerClient()
    const { data, error } = await sb
      .from('activity_events')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    if (!data?.length) return MOCK_ACTIVITY
    return data.map(r => mapActivity(r as ActivityRow))
  } catch {
    return MOCK_ACTIVITY
  }
}

/**
 * Fetch the last 90 days of analytics_daily rows for a client.
 * Falls back to MOCK_ANALYTICS.
 */
export async function getClientAnalytics(clientId = DEMO_CLIENT_ID): Promise<AnalyticsDay[]> {
  try {
    const sb = createServerClient()
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
    const sb = createServerClient()
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
    const sb = createServerClient()

    const [convRes, msgRes, rtRes, demoRes, totalLeadsRes, wonLeadsRes] = await Promise.all([
      // count(conversations)
      sb.from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId),

      // count(messages)
      sb.from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId),

      // avg response_time_ms — fetch only the column for AI messages
      sb.from('messages')
        .select('response_time_ms')
        .eq('client_id', clientId)
        .eq('from_role', 'ai')
        .not('response_time_ms', 'is', null),

      // count(appointments) where demo_call OR confirmed
      sb.from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .or('type.eq.demo_call,status.eq.confirmed'),

      // total leads
      sb.from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId),

      // won leads
      sb.from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
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
    const sb  = createServerClient()
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
      // new leads since Monday
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('client_id', clientId).gte('created_at', thisMondayISO),

      // active pipeline (not closed)
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('client_id', clientId).in('status', ['new','contacted','demo_booked']),

      // appointments scheduled this week
      sb.from('appointments').select('*', { count:'exact', head:true })
        .eq('client_id', clientId)
        .gte('scheduled_at', thisMondayISO)
        .lte('scheduled_at', thisSundayISO),

      // emails sent via automation this week
      sb.from('activity_events').select('*', { count:'exact', head:true })
        .eq('client_id', clientId).eq('type', 'email').gte('created_at', thisMondayISO),

      // total leads ever
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('client_id', clientId),

      // won leads ever
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('client_id', clientId).eq('status', 'won'),

      // won leads this month
      sb.from('leads').select('*', { count:'exact', head:true })
        .eq('client_id', clientId).eq('status', 'won').gte('updated_at', monthStart),

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

/* ─── Composite fetch ────────────────────────────────────────────── */

/**
 * Fetch all sections in parallel. Called by page.tsx.
 * Any individual query that fails silently returns its mock fallback,
 * so the dashboard always renders — even when Supabase is not yet set up.
 */
export async function getDashboardData(clientId = DEMO_CLIENT_ID): Promise<DashboardData> {
  const [leads, appointments, activity, analytics, integrations, analyticsSummary, overviewMetrics] = await Promise.all([
    getClientLeads(clientId),
    getClientAppointments(clientId),
    getClientActivityEvents(clientId),
    getClientAnalytics(clientId),
    getIntegrationStatus(clientId),
    getAnalyticsSummary(clientId),
    getOverviewMetrics(clientId),
  ])
  return { leads, appointments, activity, analytics, integrations, analyticsSummary, overviewMetrics }
}
