/**
 * Shared TypeScript types for the InstantDesk client dashboard.
 * Pure type definitions only — no runtime imports.
 * Safe to import from both Server Components (page.tsx, db.ts)
 * and Client Components (ClientDashboard.tsx, AnalyticsSection.tsx).
 */

/* ─── Enums ────────────────────────────────────────────────────── */

export type LeadStatus   = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost'
export type ScoreLabel   = 'hot' | 'warm' | 'cold'
export type ApptStatus   = 'confirmed' | 'pending' | 'completed' | 'cancelled'
export type ActivityType = 'sms' | 'appointment' | 'assignment' | 'email' | 'call'

/* ─── Automation state ─────────────────────────────────────────── */

export interface AutoState {
  aiSms:       'sent' | 'scheduled' | 'off'
  emailSeq:    'active' | 'paused' | 'not_started'
  nurture:     'active' | 'not_started'
  smartAssign: 'assigned' | 'unassigned'
  autoCall:    'scheduled' | 'completed' | 'off'
}

/* ─── Domain models ────────────────────────────────────────────── */

export interface Lead {
  id: string
  name: string
  company: string
  email?: string
  phone?: string
  source: string
  interest: string
  assignedAgent: string
  score: number
  scoreLabel: ScoreLabel
  status: LeadStatus
  date: string
  auto: AutoState
  /** Niche-specific custom fields sent by Make — stored as JSONB in leads.metadata */
  metadata?: Record<string, unknown>
}

export interface Appointment {
  id: string
  name: string
  company: string
  type: string
  date: string    // ISO date string YYYY-MM-DD
  time: string    // HH:MM
  status: ApptStatus
  upcoming: boolean
  leadId?: string  // FK to leads — used to fetch conversation in the drawer
  notes?: string   // Optional notes (requires notes TEXT column on appointments table)
}

export interface ActivityItem {
  id: string
  type: ActivityType
  text: string
  sub: string
  time: string
  live?: boolean  // true = newly streamed in real-time
}

/** One row from the analytics_daily table, mapped to camelCase. */
export interface AnalyticsDay {
  date: string             // ISO date YYYY-MM-DD
  messagesCount: number
  newLeads: number
  demosBooked: number
  avgResponseMs: number    // milliseconds
  conversionRate: number   // 0-100 (percentage)
}

/** Computed overview KPIs derived from live Supabase tables. */
export interface OverviewMetrics {
  newLeadsThisWeek:      number   // leads created since this Monday
  activeOpportunities:   number   // leads with status new | contacted | demo_booked
  appointmentsThisWeek:  number   // appointments scheduled this Mon–Sun
  emailsSentThisWeek:    number   // activity_events type='email' since this Monday
  conversionRate:        number   // won / total leads * 100  (0–100)
  conversionLiftPct:     number   // pct-point delta vs previous week avg (analytics_daily)
  agentTimeSavedHrs:     number   // (messages_count / 2 * 3 min) / 60 for current week
  monthlyDeals:          number   // leads won this calendar month
  estimatedRevenue:      number   // monthlyDeals * £5 000 baseline
}

/** Computed analytics stats derived from live Supabase tables. */
export interface AnalyticsSummary {
  totalConversations: number   // count(conversations)
  totalMessages:      number   // count(messages)
  avgResponseMs:      number   // avg(messages.response_time_ms) for ai messages
  demosBooked:        number   // count(appointments) type='demo_call' OR status='confirmed'
  conversionRate:     number   // won leads / total leads * 100  (0-100)
}

/* ─── Team ─────────────────────────────────────────────────────── */

export type Role         = 'owner' | 'team_leader' | 'agent' | 'viewer'
export type MemberStatus = 'active' | 'invited'

/**
 * One row from the team_members table.
 * SQL to create (run once in Supabase SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS team_members (
 *     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     client_id    UUID NOT NULL,
 *     name         TEXT NOT NULL,
 *     email        TEXT NOT NULL,
 *     role         TEXT NOT NULL DEFAULT 'agent',
 *     status       TEXT NOT NULL DEFAULT 'invited',
 *     invited_by   TEXT,
 *     invite_token UUID DEFAULT gen_random_uuid(),
 *     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     UNIQUE(client_id, email)
 *   );
 */
export interface TeamMember {
  id:           string
  client_id:    string
  name:         string
  email:        string
  role:         Role
  status:       MemberStatus
  invited_by:   string | null
  invite_token: string | null
  created_at:   string
}

/** Raw integration status returned from integrations_status table. */
export interface IntegrationRow {
  id: string
  integrationType: string  // 'whatsapp' | 'webchat' | 'email' | 'crm'
  status: 'active' | 'inactive' | 'connected' | 'paused' | 'error'
  lastActivityAt: string | null
  messagesWeek: number
  leadsCaptured: number
  metadata: Record<string, unknown> | null
}

/* ─── Composite data bag passed from page.tsx → ClientDashboard ── */

export interface DashboardData {
  leads:            Lead[]
  appointments:     Appointment[]
  activity:         ActivityItem[]
  analytics:        AnalyticsDay[]
  integrations:     IntegrationRow[]
  analyticsSummary: AnalyticsSummary
  overviewMetrics:  OverviewMetrics
}
