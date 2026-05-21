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
  source: string
  interest: string
  assignedAgent: string
  score: number
  scoreLabel: ScoreLabel
  status: LeadStatus
  date: string
  auto: AutoState
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

/** Computed analytics stats derived from live Supabase tables. */
export interface AnalyticsSummary {
  totalConversations: number   // count(conversations)
  totalMessages:      number   // count(messages)
  avgResponseMs:      number   // avg(messages.response_time_ms) for ai messages
  demosBooked:        number   // count(appointments) type='demo_call' OR status='confirmed'
  conversionRate:     number   // won leads / total leads * 100  (0-100)
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
}
