'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, Brain, BookOpen, Target, FlaskConical, CheckCircle, AlertTriangle,
  Zap, Plus, Trash2, Globe, FileText, Upload, ChevronDown, ChevronUp,
  RefreshCw, Save, Play, RotateCcw, Eye, EyeOff, Cpu, MessageSquare,
  User, Clock, Link, File, ToggleLeft, ToggleRight, Sliders, Flame,
  Database, TrendingUp, BarChart2, Activity,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

/* ─── Shared constants ───────────────────────────────────────── */

const TONES = [
  { id: 'professional', label: 'Professional',  desc: 'Formal, precise, business-focused'   },
  { id: 'friendly',     label: 'Friendly',      desc: 'Warm, approachable, conversational'  },
  { id: 'casual',       label: 'Casual',        desc: 'Relaxed, informal, personable'       },
  { id: 'luxury',       label: 'Luxury',        desc: 'Sophisticated, premium, exclusive'   },
]

const MODELS = [
  { id: 'gpt-4o',      label: 'GPT-4o',       desc: 'Most capable — recommended' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini',  desc: 'Faster, lower cost'         },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo',  desc: 'High quality, legacy'       },
]

const DEFAULT_SLOT_DEFS: SlotDef[] = [
  { key:'city',          label:'City / Location',         required:true,  question:"Which city or area are you looking in?"                                          },
  { key:'deal_type',     label:'Rent or Buy',             required:true,  question:"Are you looking to rent or buy?"                                                  },
  { key:'property_type', label:'Property Type',           required:true,  question:"What type of property — apartment, house, studio, or something else?"             },
  { key:'rooms',         label:'Number of Rooms',         required:true,  question:"How many rooms or bedrooms do you need?"                                          },
  { key:'budget',        label:'Budget',                  required:true,  question:"What's your budget? Please include currency (e.g. 3000 PLN/month)."               },
  { key:'name',          label:'Full Name',               required:true,  question:"May I have your full name?"                                                        },
  { key:'phone',         label:'Phone Number',            required:false, question:"What's the best phone number to reach you on?"                                    },
  { key:'email',         label:'Email Address',           required:false, question:"And your email address?"                                                           },
  { key:'viewing_time',  label:'Preferred Viewing Time',  required:false, question:"When would you prefer to schedule a viewing?"                                     },
]

/* ─── Types ──────────────────────────────────────────────────── */

interface AgentConfig {
  id:           string
  name:         string
  persona:      string
  objective:    string
  tone:         string
  fallback_msg: string
  model:        string
  temperature:  number
}

interface KnowledgeSource {
  id:         string
  title:      string
  content:    string
  is_active:  boolean
  created_at: string
}

interface SlotDef {
  key:      string
  label:    string
  required: boolean
  question: string
}

interface QualFieldRow {
  id:         string
  field_key:  string
  label:      string
  prompt:     string
  required:   boolean
  sort_order: number
  active:     boolean
}

interface ChatMessage {
  role:    'user' | 'ai'
  content: string
  debug?:  {
    confirmedSlots: Record<string,string|null>
    missingSlots:   string[]
    isQualified:    boolean
    ai_summary:     string | null
    blocked:        boolean
  }
}

/* ─── Shared UI ──────────────────────────────────────────────── */

function PageCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`}
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, sub, color = '#a78bfa' }: { icon: React.ComponentType<{className?:string;style?:React.CSSProperties}>, title: string, sub?: string, color?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background:`${color}18`, border:`1px solid ${color}28` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {sub && <p className="text-xs text-white/35 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button onClick={() => onChange(!on)}
      className="flex items-center gap-2 group"
      aria-label={label ?? (on ? 'On' : 'Off')}>
      <div className="relative w-9 h-5 rounded-full transition-colors"
        style={{ background: on ? '#7c3aed' : 'rgba(255,255,255,0.12)', border:`1px solid ${on ? '#7c3aed' : 'rgba(255,255,255,0.15)'}` }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
          style={{ left: on ? 'calc(100% - 18px)' : '2px' }} />
      </div>
      {label && <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">{label}</span>}
    </button>
  )
}

function SaveBtn({ onClick, loading, saved }: { onClick: () => void; loading: boolean; saved: boolean }) {
  return (
    <motion.button onClick={onClick} disabled={loading}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
      style={saved
        ? { background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'#34d399' }
        : { background:'rgba(124,58,237,0.85)', border:'1px solid rgba(167,139,250,0.4)', color:'white' }}>
      {loading ? (
        <motion.span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
          animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
      ) : saved ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {loading ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
    </motion.button>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <motion.div className="w-6 h-6 rounded-full border-2 border-violet-500/30 border-t-violet-500"
        animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
    </div>
  )
}

function MetricCard({ icon: Icon, value, label, sub, color }: { icon: React.ComponentType<{className?:string;style?:React.CSSProperties}>, value: string|number, label: string, sub?: string, color: string }) {
  return (
    <motion.div whileHover={{ y:-2 }}
      className="rounded-2xl p-5 cursor-default"
      style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:`${color}18`, border:`1px solid ${color}28` }}>
          <Icon className="w-4 h-4" style={{ color } as React.CSSProperties} />
        </div>
        <TrendingUp className="w-3.5 h-3.5 text-emerald-400/50" />
      </div>
      <div className="text-2xl font-black text-white tracking-tight">{value}</div>
      <div className="text-[10px] font-semibold text-white/35 uppercase tracking-wide mt-1">{label}</div>
      {sub && <div className="text-[10px] text-white/20 mt-0.5">{sub}</div>}
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 1: AI OVERVIEW
══════════════════════════════════════════════════════════════ */

function AIOverviewPage({ businessId }: { businessId: string }) {
  const [agent,     setAgent]     = useState<AgentConfig | null>(null)
  const [kCount,    setKCount]    = useState(0)
  const [convCount, setConvCount] = useState(0)
  const [liveSlots, setLiveSlots] = useState<SlotDef[]>(DEFAULT_SLOT_DEFS)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [agentRes, kRes, convRes, qualRes] = await Promise.all([
        fetch('/api/ai-agent/agent'),
        fetch('/api/ai-agent/knowledge'),
        supabase.from('conversations').select('id', { count:'exact', head:true }).eq('business_id', businessId),
        fetch('/api/ai-agent/qualification'),
      ])
      const agentData = await agentRes.json() as { agent: AgentConfig | null }
      const kData     = await kRes.json()     as { sources: KnowledgeSource[] }
      const qualData  = await qualRes.json()  as { fields?: QualFieldRow[] }
      setAgent(agentData.agent)
      setKCount(kData.sources?.filter(s => s.is_active).length ?? 0)
      setConvCount(convRes.count ?? 0)
      if (qualData.fields?.length) setLiveSlots(qualData.fields.map(mapQualRow))
      setLoading(false)
    }
    void load()
  }, [businessId])

  if (loading) return <Spinner />

  const tone = TONES.find(t => t.id === agent?.tone) ?? TONES[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Agent status card */}
      <PageCard>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.35),rgba(37,99,235,0.25))', border:'1px solid rgba(139,92,246,0.3)' }}>
            <Bot className="w-7 h-7 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold text-white">{agent?.name ?? 'AI Agent'}</h2>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <div className="text-xs text-white/40 mt-1 line-clamp-1">{agent?.persona?.slice(0, 100) ?? 'No persona configured'}</div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span className="text-[11px] text-white/30 flex items-center gap-1">
                <Cpu className="w-3 h-3" />{agent?.model ?? 'gpt-4o'}
              </span>
              <span className="text-[11px] text-white/30 flex items-center gap-1">
                <Zap className="w-3 h-3" />{tone.label} tone
              </span>
              <span className="text-[11px] text-white/30 flex items-center gap-1">
                <Sliders className="w-3 h-3" />Creativity {((agent?.temperature ?? 0.7) * 10).toFixed(0)}/10
              </span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={BookOpen}     value={kCount}     label="Knowledge Sources"  sub="active & trained"    color="#a78bfa" />
        <MetricCard icon={MessageSquare} value={convCount}  label="Total Conversations" sub="all time"           color="#60a5fa" />
        <MetricCard icon={Target}        value={liveSlots.filter(s=>s.required).length} label="Required Slots" sub="to qualify a lead" color="#34d399" />
        <MetricCard icon={Brain}         value={liveSlots.length} label="Tracked Slots" sub="total data points" color="#fbbf24" />
      </div>

      {/* Quick actions */}
      <PageCard>
        <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label:'Edit Instructions', sub:'Adjust persona and tone', color:'#a78bfa', icon:Brain },
            { label:'Add Knowledge',     sub:'Upload docs or paste text', color:'#60a5fa', icon:BookOpen },
            { label:'Test AI',           sub:'Chat with your agent live', color:'#34d399', icon:FlaskConical },
          ].map(a => (
            <div key={a.label} className="flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
              style={{ background:`${a.color}08`, border:`1px solid ${a.color}20` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background:`${a.color}18` }}>
                <a.icon className="w-4 h-4" style={{ color: a.color } as React.CSSProperties} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white/80">{a.label}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </PageCard>

      {/* Slot coverage overview */}
      <PageCard>
        <h3 className="text-sm font-bold text-white mb-4">Slot Qualification Map</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {liveSlots.map(slot => (
            <div key={slot.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: slot.required ? '#a78bfa' : 'rgba(255,255,255,0.2)' }} />
              <span className="text-xs text-white/70 flex-1">{slot.label}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={slot.required
                  ? { background:'rgba(167,139,250,0.12)', color:'#a78bfa' }
                  : { background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.3)' }}>
                {slot.required ? 'Required' : 'Optional'}
              </span>
            </div>
          ))}
        </div>
      </PageCard>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 2: AI INSTRUCTIONS
══════════════════════════════════════════════════════════════ */

function buildPreviewPrompt(persona: string, objective: string, tone: string, fallback: string): string {
  return `You are an AI sales assistant.

PERSONA: ${persona || '(not set)'}

OBJECTIVE: ${objective || '(not set)'}

TONE: ${tone}

CONFIRMED INFORMATION (DO NOT ask about any of these):
  ✓ City/Location: Krakow          ← example
  ✓ Budget: 3500 PLN/month         ← example

MISSING INFORMATION (ask ONE at a time):
  ○ Property type
  ○ Full name

STRICT RULES:
1. Never ask for anything in CONFIRMED INFORMATION.
2. Ask for ONE item from MISSING INFORMATION per message.
3. Keep replies short: 2–4 sentences.
4. If asked something outside your knowledge: ${fallback || '(fallback not set)'}

Your reply is plain conversational text only.`
}

function AIInstructionsPage() {
  const [agent,    setAgent]    = useState<AgentConfig | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [showPrev, setShowPrev] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [form, setForm] = useState({
    persona:      '',
    objective:    '',
    tone:         'professional',
    fallback_msg: '',
    model:        'gpt-4o',
    temperature:  0.7,
  })

  useEffect(() => {
    fetch('/api/ai-agent/agent')
      .then(r => r.json())
      .then((d: { agent: AgentConfig | null }) => {
        const a = d.agent
        if (a) {
          setAgent(a)
          setForm({
            persona:      a.persona      ?? '',
            objective:    a.objective    ?? '',
            tone:         a.tone         ?? 'professional',
            fallback_msg: a.fallback_msg ?? '',
            model:        a.model        ?? 'gpt-4o',
            temperature:  a.temperature  ?? 0.7,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const res  = await fetch('/api/ai-agent/agent', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  const set = (k: keyof typeof form) => (val: string | number) => {
    setForm(f => ({ ...f, [k]: val }))
    setSaved(false)
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      {/* Agent name badge */}
      {agent && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl w-fit"
          style={{ background:'rgba(139,92,246,0.10)', border:'1px solid rgba(139,92,246,0.2)' }}>
          <Bot className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-semibold text-violet-300">{agent.name}</span>
          <span className="text-[10px] text-violet-400/50">· editing instructions</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs text-red-300"
          style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </div>
      )}

      {/* Persona + Objective */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PageCard>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">Persona</label>
          <textarea value={form.persona} onChange={e => set('persona')(e.target.value)} rows={6}
            placeholder="You are a professional real estate sales assistant with 10 years of experience in the Polish property market. You are helpful, knowledgeable, and always focused on understanding the client's needs…"
            className="w-full text-sm text-white/80 bg-transparent resize-none outline-none placeholder:text-white/20 leading-relaxed" />
          <div className="text-[10px] text-white/20 mt-3 pt-3" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            {form.persona.length} chars · Describe who the agent is, their background, and personality
          </div>
        </PageCard>

        <PageCard>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">Objective</label>
          <textarea value={form.objective} onChange={e => set('objective')(e.target.value)} rows={6}
            placeholder="Your primary goal is to qualify property leads by gathering key information (location, budget, property type, size, timeline) and then booking a viewing with a member of our sales team…"
            className="w-full text-sm text-white/80 bg-transparent resize-none outline-none placeholder:text-white/20 leading-relaxed" />
          <div className="text-[10px] text-white/20 mt-3 pt-3" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            {form.objective.length} chars · What should the AI accomplish in each conversation
          </div>
        </PageCard>
      </div>

      {/* Fallback message */}
      <PageCard>
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">Fallback Message</label>
        <input value={form.fallback_msg} onChange={e => set('fallback_msg')(e.target.value)}
          placeholder="I don't have that information right now — let me connect you with a specialist who can help."
          className="w-full text-sm text-white/80 bg-transparent outline-none placeholder:text-white/20" />
        <div className="text-[10px] text-white/20 mt-3 pt-3" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          Shown when the AI is asked something outside its knowledge base
        </div>
      </PageCard>

      {/* Tone, Model, Temperature */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tone */}
        <PageCard>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">Tone</label>
          <div className="flex flex-col gap-2">
            {TONES.map(t => (
              <button key={t.id} onClick={() => set('tone')(t.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                style={form.tone === t.id
                  ? { background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.3)' }
                  : { background:'rgba(255,255,255,0.03)', border:'1px solid transparent' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: form.tone === t.id ? '#a78bfa' : 'rgba(255,255,255,0.2)' }} />
                <div>
                  <div className="text-xs font-semibold text-white/80">{t.label}</div>
                  <div className="text-[10px] text-white/30">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </PageCard>

        {/* Model */}
        <PageCard>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">Model</label>
          <div className="flex flex-col gap-2">
            {MODELS.map(m => (
              <button key={m.id} onClick={() => set('model')(m.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                style={form.model === m.id
                  ? { background:'rgba(96,165,250,0.12)', border:'1px solid rgba(96,165,250,0.3)' }
                  : { background:'rgba(255,255,255,0.03)', border:'1px solid transparent' }}>
                <Cpu className="w-3.5 h-3.5 flex-shrink-0" style={{ color: form.model === m.id ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} />
                <div>
                  <div className="text-xs font-semibold text-white/80">{m.label}</div>
                  <div className="text-[10px] text-white/30">{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </PageCard>

        {/* Temperature */}
        <PageCard>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">
            Creativity — {(form.temperature * 10).toFixed(1)}/10
          </label>
          <div className="py-2">
            <input type="range" min="0" max="1" step="0.1" value={form.temperature}
              onChange={e => set('temperature')(parseFloat(e.target.value))}
              className="w-full accent-violet-500" />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-white/30">Precise</span>
              <span className="text-[10px] text-white/30">Creative</span>
            </div>
          </div>
          <div className="mt-4 text-[10px] text-white/30 leading-relaxed">
            {form.temperature <= 0.3 && 'Low — very consistent, predictable responses'}
            {form.temperature > 0.3 && form.temperature <= 0.6 && 'Medium — balanced and natural'}
            {form.temperature > 0.6 && form.temperature <= 0.8 && 'High — warm and varied'}
            {form.temperature > 0.8 && 'Very high — creative but may drift'}
          </div>

          {/* Creativity levels visual */}
          <div className="mt-4 flex gap-1">
            {Array.from({length:10}).map((_,i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full transition-colors"
                style={{ background: (i+1)/10 <= form.temperature ? '#7c3aed' : 'rgba(255,255,255,0.08)' }} />
            ))}
          </div>
        </PageCard>
      </div>

      {/* Live prompt preview */}
      <PageCard>
        <button onClick={() => setShowPrev(v => !v)}
          className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-bold text-white/70">Live Prompt Preview</span>
          </div>
          {showPrev ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
        </button>
        <AnimatePresence>
          {showPrev && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
              className="overflow-hidden">
              <div className="mt-4 p-4 rounded-xl font-mono text-[11px] text-emerald-300/80 leading-relaxed whitespace-pre-wrap"
                style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(52,211,153,0.12)' }}>
                {buildPreviewPrompt(form.persona, form.objective, form.tone, form.fallback_msg)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PageCard>

      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} loading={saving} saved={saved} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 3: KNOWLEDGE BASE
══════════════════════════════════════════════════════════════ */

type AddMode = 'url' | 'text' | 'file' | 'crawl'
type CrawlResult = { url: string; title?: string; status: 'crawling' | 'done' | 'error'; error?: string }

function KnowledgeBasePage() {
  const [sources,  setSources]  = useState<KnowledgeSource[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [addMode,  setAddMode]  = useState<AddMode>('text')
  const [title,    setTitle]    = useState('')
  const [content,  setContent]  = useState('')
  const [url,      setUrl]      = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)
  const [crawlUrl,      setCrawlUrl]      = useState('')
  const [crawlMaxPages, setCrawlMaxPages] = useState(10)
  const [crawlRunning,  setCrawlRunning]  = useState(false)
  const [crawlResults,  setCrawlResults]  = useState<CrawlResult[]>([])
  const [crawlDone,     setCrawlDone]     = useState<{ saved: number; failed: number; crawled: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/ai-agent/knowledge')
    const data = await res.json() as { sources: KnowledgeSource[] }
    setSources(data.sources ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setContent(ev.target?.result as string ?? '') }
    if (file.type === 'application/pdf') {
      setContent(`[PDF: ${file.name}]\n\nPDF content — please paste the extracted text below or use a text/URL source for full functionality.`)
    } else {
      reader.readAsText(file)
    }
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''))
  }

  const handleAdd = async () => {
    setError(null)
    const finalTitle = title.trim()

    if (addMode === 'url') {
      const rawUrl = url.trim()
      if (!rawUrl) { setError('Please enter a URL'); return }
      setSaving(true)
      try {
        const res  = await fetch('/api/ai-agent/knowledge', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ title: finalTitle || undefined, url: rawUrl, source_type: 'url' }),
        })
        const data = await res.json() as { error?: string }
        if (!res.ok) { setError(data.error ?? 'Failed to fetch URL'); return }
        setTitle(''); setUrl('')
        setSuccess(true); setTimeout(() => setSuccess(false), 3000)
        await load()
      } catch { setError('Network error') }
      finally { setSaving(false) }
      return
    }

    const finalContent = content.trim()
    if (!finalTitle)   { setError('Please enter a title'); return }
    if (!finalContent) { setError('Please enter content'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/ai-agent/knowledge', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title: finalTitle, content: finalContent }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      setTitle(''); setContent('')
      setSuccess(true); setTimeout(() => setSuccess(false), 3000)
      await load()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/ai-agent/knowledge/${id}`, { method:'DELETE' })
    setSources(prev => prev.filter(s => s.id !== id))
  }

  const handleToggle = async (id: string, is_active: boolean) => {
    await fetch(`/api/ai-agent/knowledge/${id}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ is_active }),
    })
    setSources(prev => prev.map(s => s.id === id ? {...s, is_active} : s))
  }

  const handleCrawl = async () => {
    const rawUrl = crawlUrl.trim()
    if (!rawUrl) { setError('Please enter a root URL to crawl'); return }
    setError(null)
    setCrawlRunning(true)
    setCrawlResults([])
    setCrawlDone(null)
    try {
      const res = await fetch('/api/ai-agent/knowledge/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl, max_pages: crawlMaxPages }),
      })
      if (!res.ok || !res.body) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Crawl failed'); return
      }
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line) as { type: string; url?: string; title?: string; error?: string; pages_saved?: number; pages_failed?: number; pages_crawled?: number }
            if (ev.type === 'progress' && ev.url) {
              setCrawlResults(p => [...p, { url: ev.url!, status: 'crawling' }])
            } else if (ev.type === 'page_done' && ev.url) {
              setCrawlResults(p => p.map(r => r.url === ev.url ? { ...r, title: ev.title, status: 'done' } : r))
            } else if (ev.type === 'page_error' && ev.url) {
              setCrawlResults(p => p.map(r => r.url === ev.url ? { ...r, error: ev.error, status: 'error' } : r))
            } else if (ev.type === 'done') {
              setCrawlDone({ saved: ev.pages_saved ?? 0, failed: ev.pages_failed ?? 0, crawled: ev.pages_crawled ?? 0 })
              await load()
            }
          } catch { /* malformed line */ }
        }
      }
    } catch { setError('Network error during crawl') }
    finally { setCrawlRunning(false) }
  }

  const sourceIcon = (content: string) => {
    if (/^https?:\/\//i.test(content)) return Globe
    if (content.startsWith('[PDF:'))    return File
    return FileText
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Add source panel */}
      <PageCard>
        <SectionHeader icon={Plus} title="Add Knowledge Source" sub="Feed your AI agent information about your business, listings, or services" color="#60a5fa" />

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit"
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          {([['text','Text / Paste'], ['url','Website URL'], ['file','Upload File'], ['crawl','Crawl Site']] as [AddMode, string][]).map(([mode, label]) => (
            <button key={mode} onClick={() => { setAddMode(mode); setError(null) }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={addMode === mode
                ? { background:'rgba(96,165,250,0.15)', border:'1px solid rgba(96,165,250,0.3)', color:'#93c5fd' }
                : { color:'rgba(255,255,255,0.35)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Form body — one branch per mode, mutually exclusive */}
        {addMode === 'crawl' ? (
          <div className="mb-4 flex flex-col gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2">Root URL</label>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                <Globe className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                <input value={crawlUrl} onChange={e => setCrawlUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 text-sm text-white/80 placeholder:text-white/20 outline-none bg-transparent" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2">Max Pages</label>
                <input type="number" min={1} max={50} value={crawlMaxPages}
                  onChange={e => setCrawlMaxPages(Math.min(50, Math.max(1, Number(e.target.value))))}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white/80 outline-none"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div className="text-[10px] text-white/25 mt-5">max 50 · same domain only</div>
            </div>
            {(crawlResults.length > 0 || crawlDone) && (
              <div className="rounded-xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-3 py-2 flex items-center justify-between"
                  style={{ background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
                    {crawlRunning ? `Crawling… ${crawlResults.length}/${crawlMaxPages}` : `Crawled ${crawlResults.length} pages`}
                  </span>
                  {crawlDone && (
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      {crawlDone.saved} saved · {crawlDone.failed} failed
                    </span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {crawlResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                      style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      {r.status === 'crawling' && (
                        <motion.span className="w-3 h-3 rounded-full border border-white/30 border-t-white/70 flex-shrink-0"
                          animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity }} />
                      )}
                      {r.status === 'done'  && <CheckCircle  className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                      {r.status === 'error' && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      <span className="truncate text-white/50" title={r.url}>
                        {r.title ?? (new URL(r.url).pathname || '/')}
                      </span>
                      {r.error && <span className="ml-auto text-red-400/70 flex-shrink-0">{r.error.slice(0, 40)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Title (text / url / file modes) */}
            <div className="mb-3">
              <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Property Listings Q2 2026"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white/80 placeholder:text-white/20 outline-none"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
            </div>

            {addMode === 'url' && (
              <div className="mb-4">
                <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2">Website URL</label>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                  <Link className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-website.com/about"
                    className="flex-1 text-sm text-white/80 placeholder:text-white/20 outline-none bg-transparent" />
                </div>
                <div className="text-[10px] text-white/25 mt-2">The page will be fetched and its text extracted automatically. Title is optional — the page title will be used if left blank.</div>
              </div>
            )}

            {addMode === 'text' && (
              <div className="mb-4">
                <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2">Content</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
                  placeholder="Paste any text content here — property descriptions, FAQs, pricing details, policies…"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white/80 placeholder:text-white/20 outline-none resize-none leading-relaxed"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
                <div className="text-[10px] text-white/25 mt-2">{content.length} chars</div>
              </div>
            )}

            {addMode === 'file' && (
              <div className="mb-4">
                <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.csv" onChange={handleFileChange} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center w-full py-8 rounded-xl transition-all cursor-pointer border-dashed hover:border-blue-400/40"
                  style={{ background:'rgba(255,255,255,0.02)', border:'2px dashed rgba(255,255,255,0.10)' }}>
                  <Upload className="w-6 h-6 text-white/20 mb-2" />
                  <span className="text-sm text-white/40">Click to upload a file</span>
                  <span className="text-[10px] text-white/20 mt-1">.txt · .md · .csv · .pdf</span>
                </button>
                {content && (
                  <div className="mt-3 px-4 py-3 rounded-xl text-xs text-white/50 line-clamp-3"
                    style={{ background:'rgba(255,255,255,0.04)' }}>
                    {content.slice(0, 200)}{content.length > 200 ? '…' : ''}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs text-red-300 mb-3"
            style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 text-xs font-semibold transition-all ${success || crawlDone ? 'text-emerald-400 opacity-100' : 'opacity-0'}`}>
            <CheckCircle className="w-3.5 h-3.5" />
            {crawlDone ? `${crawlDone.saved} pages saved` : 'Source added'}
          </div>
          <motion.button
            onClick={addMode === 'crawl' ? handleCrawl : handleAdd}
            disabled={saving || crawlRunning}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background:'rgba(96,165,250,0.85)', border:'1px solid rgba(147,197,253,0.4)' }}>
            {(saving || crawlRunning)
              ? <><motion.span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white" animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity }} />
                  {addMode === 'crawl' ? 'Crawling…' : addMode === 'url' ? 'Fetching…' : 'Saving…'}</>
              : <><Plus className="w-4 h-4" />{addMode === 'crawl' ? 'Start Crawl' : 'Add Source'}</>}
          </motion.button>
        </div>
      </PageCard>

      {/* Sources list */}
      <PageCard>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={Database} title={`Knowledge Sources (${sources.length})`} sub="Active sources are injected into every AI conversation" color="#a78bfa" />
          <button onClick={load} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? <Spinner /> : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <BookOpen className="w-8 h-8 text-white/10" />
            <p className="text-sm text-white/25 font-medium">No knowledge sources yet</p>
            <p className="text-xs text-white/15">Add a source above to start training your agent</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((source, i) => {
              const Icon = sourceIcon(source.content)
              return (
                <motion.div key={source.id} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.04 }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all"
                  style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${source.is_active ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: source.is_active ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: source.is_active ? '#a78bfa' : 'rgba(255,255,255,0.3)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/80 truncate">{source.title}</div>
                    <div className="text-[10px] text-white/30 mt-0.5 truncate">
                      {source.content.startsWith('[PDF:') ? 'PDF document' :
                       /^https?:\/\//i.test(source.content) ? source.content.slice(0, 60) :
                       `${source.content.length.toLocaleString()} chars`}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={source.is_active
                      ? { background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399' }
                      : { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.3)' }}>
                    {source.is_active ? 'Active' : 'Paused'}
                  </span>
                  <Toggle on={source.is_active} onChange={v => handleToggle(source.id, v)} />
                  <button onClick={() => handleDelete(source.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                    style={{ border:'1px solid transparent' }}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}
      </PageCard>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 4: LEAD QUALIFICATION
══════════════════════════════════════════════════════════════ */

function mapQualRow(r: QualFieldRow): SlotDef {
  return { key: r.field_key, label: r.label, required: r.required, question: r.prompt }
}

function LeadQualificationPage({ businessId }: { businessId: string }) {
  const [slots,        setSlots]        = useState<SlotDef[]>(DEFAULT_SLOT_DEFS)
  const [threshold,    setThreshold]    = useState(3)
  const [booking,      setBooking]      = useState({ requireCity: true, requireContact: true, requireProperty: true })
  const [guard,        setGuard]        = useState(true)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [toggleErr,    setToggleErr]    = useState<string | null>(null)

  // Per-business localStorage key so settings don't bleed between accounts
  const storageKey = `ai_qualification_config_${businessId}`

  // Load from Supabase on mount; fall back to localStorage for threshold/booking/guard
  useEffect(() => {
    fetch('/api/ai-agent/qualification')
      .then(r => r.json())
      .then((data: { fields?: QualFieldRow[] }) => {
        if (data.fields?.length) {
          setSlots(data.fields.map(mapQualRow))
        }
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false))

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const cfg = JSON.parse(stored) as { threshold?: number; booking?: typeof booking; guard?: boolean }
        if (cfg.threshold) setThreshold(cfg.threshold)
        if (cfg.booking)   setBooking(cfg.booking)
        if (cfg.guard !== undefined) setGuard(cfg.guard)
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Persist fields + order to Supabase
      await fetch('/api/ai-agent/qualification', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: slots.map((s, i) => ({ field_key: s.key, required: s.required, sort_order: i })),
        }),
      })
      // Persist threshold/booking/guard to localStorage (scoped to this business)
      try { localStorage.setItem(storageKey, JSON.stringify({ threshold, booking, guard })) } catch { /* ignore */ }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch {
      /* ignore — user can retry */
    } finally {
      setSaving(false)
    }
  }

  const toggleRequired = async (key: string) => {
    const newRequired = !slots.find(s => s.key === key)?.required
    setSlots(prev => prev.map(s => s.key === key ? { ...s, required: newRequired } : s))
    setSaved(false)
    setToggleErr(null)

    try {
      const res = await fetch('/api/ai-agent/qualification', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_key: key, required: newRequired }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      // Roll back optimistic update
      setSlots(prev => prev.map(s => s.key === key ? { ...s, required: !newRequired } : s))
      setToggleErr(key)
      setTimeout(() => setToggleErr(prev => prev === key ? null : prev), 3000)
    }
  }

  const reorderUp = (i: number) => {
    if (i === 0) return
    setSlots(prev => { const n = [...prev]; [n[i-1], n[i]] = [n[i], n[i-1]]; return n })
    setSaved(false)
  }

  const reorderDown = (i: number) => {
    if (i === slots.length - 1) return
    setSlots(prev => { const n = [...prev]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n })
    setSaved(false)
  }

  const requiredCount = slots.filter(s => s.required).length

  return (
    <div className="flex flex-col gap-5">
      {/* Required fields */}
      <PageCard>
        <SectionHeader icon={Target} title="Required Fields" sub="Toggles save instantly — use Save to persist order changes" color="#a78bfa" />
        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-xl"
          style={{ background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.15)' }}>
          <div className="text-xs text-white/50">
            <span className="font-bold text-violet-300">{requiredCount}</span> required · {slots.length - requiredCount} optional
          </div>
          <div className="flex-1" />
          <div className="text-[10px] text-white/30">Qualification requires {requiredCount} slots</div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-white/30" />
            <span className="text-xs text-white/30">Loading fields…</span>
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          {slots.map((slot, i) => (
            <div key={slot.key} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
              style={{ background: slot.required ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)', border:`1px solid ${slot.required ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => reorderUp(i)} className="text-white/20 hover:text-white/50 transition-colors" title="Move up">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={() => reorderDown(i)} className="text-white/20 hover:text-white/50 transition-colors" title="Move down">
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-white/20 flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.05)' }}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white/80">{slot.label}</div>
                <div className="text-[10px] text-white/35 mt-0.5 truncate italic">&quot;{slot.question}&quot;</div>
              </div>
              {toggleErr === slot.key && (
                <span className="text-[10px] text-red-400 mr-1">Failed</span>
              )}
              <Toggle on={slot.required} onChange={() => toggleRequired(slot.key)}
                label={slot.required ? 'Required' : 'Optional'} />
            </div>
          ))}
        </div>
        )}
      </PageCard>

      {/* Score settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PageCard>
          <SectionHeader icon={BarChart2} title="Qualification Score" color="#34d399" />
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-white/50">Slots needed to qualify</label>
                <span className="text-xs font-bold text-emerald-400">{threshold}</span>
              </div>
              <input type="range" min={1} max={slots.length} value={threshold} onChange={e => { setThreshold(+e.target.value); setSaved(false) }}
                className="w-full accent-emerald-500" />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-white/25">1 slot</span>
                <span className="text-[10px] text-white/25">{slots.length} slots</span>
              </div>
            </div>
            <div className="text-xs text-white/40 px-3 py-2.5 rounded-xl leading-relaxed"
              style={{ background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.12)' }}>
              A lead becomes <span className="text-emerald-400 font-semibold">qualified</span> when {threshold} or more required fields are collected.
            </div>
          </div>
        </PageCard>

        <PageCard>
          <SectionHeader icon={Flame} title="Booking Trigger" sub="When to offer a viewing / booking" color="#fbbf24" />
          <div className="flex flex-col gap-3">
            {[
              { key:'requireCity' as const,     label:'Location confirmed',  sub:'Knows which city/area' },
              { key:'requireProperty' as const, label:'Property type known',  sub:'apt, house, studio, etc.' },
              { key:'requireContact' as const,  label:'Contact info captured', sub:'Name, phone, or email' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background:'rgba(251,191,36,0.05)', border:'1px solid rgba(251,191,36,0.12)' }}>
                <div>
                  <div className="text-xs font-semibold text-white/70">{item.label}</div>
                  <div className="text-[10px] text-white/35">{item.sub}</div>
                </div>
                <Toggle on={booking[item.key]} onChange={v => { setBooking(b => ({...b, [item.key]:v})); setSaved(false) }} />
              </div>
            ))}
          </div>
        </PageCard>
      </div>

      {/* Extraction rules (read-only reference) */}
      <PageCard>
        <SectionHeader icon={Brain} title="Extraction Rules" sub="Regex patterns used to detect slot values from user messages" color="#60a5fa" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label:'City', rule:'Krakow, Warsaw, Dubai + 20 typo variants (krkaow→Krakow)' },
            { label:'Deal Type', rule:'"rent/rental/lease" → rent · "buy/purchase/for sale" → buy' },
            { label:'Property', rule:'"apartment/flat/studio/house/villa/penthouse"' },
            { label:'Rooms', rule:'"2-room" · "2 bedrooms" · "2+1" · "two bedroom"' },
            { label:'Budget', rule:'"3000 PLN" · "£2500/month" · "AED 5000"' },
            { label:'Name', rule:'"My name is X" · "I\'m X" · "Call me X"' },
            { label:'Phone', rule:'9–15 digit run with optional separators' },
            { label:'Email', rule:'Standard email regex' },
            { label:'Viewing', rule:'"tomorrow" · "Monday" · "at 12:00" · "morning"' },
          ].map(r => (
            <div key={r.label} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
              style={{ background:'rgba(96,165,250,0.05)', border:'1px solid rgba(96,165,250,0.12)' }}>
              <span className="text-[10px] font-black text-blue-400 w-16 flex-shrink-0 mt-0.5">{r.label}</span>
              <span className="text-[10px] text-white/40 leading-relaxed">{r.rule}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[10px] text-white/25">These patterns run deterministically — no AI needed for slot extraction.</div>
      </PageCard>

      {/* Anti-repetition guard */}
      <PageCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.2)' }}>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white/80">Anti-Repetition Guard</div>
              <div className="text-xs text-white/35">Server-side check — blocks AI from re-asking confirmed slots</div>
            </div>
          </div>
          <Toggle on={guard} onChange={v => { setGuard(v); setSaved(false) }} label={guard ? 'Enabled' : 'Disabled'} />
        </div>
      </PageCard>

      <div className="flex justify-end">
        <SaveBtn onClick={handleSave} loading={saving} saved={saved} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 5: TEST AI
══════════════════════════════════════════════════════════════ */

function TestAIPage({
  businessId,
  onLeadCreated,
  onAppointmentCreated,
}: {
  businessId:           string
  onLeadCreated?:       (leadId: string) => void
  onAppointmentCreated?:(apptId: string) => void
}) {
  const [messages,     setMessages]     = useState<ChatMessage[]>([])
  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [convId,       setConvId]       = useState<string | null>(null)
  const [lastDebug,    setLastDebug]    = useState<ChatMessage['debug'] | null>(null)
  const [showRaw,      setShowRaw]      = useState(false)
  const [rawResponse,  setRawResponse]  = useState<Record<string,unknown> | null>(null)
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Track IDs already reported so we call the callbacks only once per record
  const reportedLeadRef = useRef<string | null>(null)
  const reportedApptRef = useRef<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  const reset = () => {
    setMessages([]); setInput(''); setConvId(null); setLastDebug(null); setRawResponse(null)
    reportedLeadRef.current = null
    reportedApptRef.current = null
    inputRef.current?.focus()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)
    setMessages(prev => [...prev, { role:'user', content:text }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, conversation_id: convId, message: text, debug: true }),
      })
      const data = await res.json() as {
        reply?: string
        conversation_id?: string
        lead_id?: string
        appointment_id?: string
        debug?: ChatMessage['debug']
        error?: string
      }
      setRawResponse(data as Record<string,unknown>)

      const reply = data.reply ?? data.error ?? 'No response'
      const debug = data.debug ?? null

      if (data.conversation_id) setConvId(data.conversation_id)
      if (debug) setLastDebug(debug)

      // Notify parent to refresh state for newly created records.
      // Guard with refs so we call once per unique ID, not on every message.
      if (data.lead_id && data.lead_id !== reportedLeadRef.current) {
        reportedLeadRef.current = data.lead_id
        onLeadCreated?.(data.lead_id)
      }
      if (data.appointment_id && data.appointment_id !== reportedApptRef.current) {
        reportedApptRef.current = data.appointment_id
        onAppointmentCreated?.(data.appointment_id)
      }

      setMessages(prev => [...prev, { role:'ai', content:reply, debug: debug ?? undefined }])
    } catch (e) {
      setMessages(prev => [...prev, { role:'ai', content:'Network error — check console.' }])
      console.error('[TestAI]', e)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  const confirmedSlots = lastDebug?.confirmedSlots ?? {}
  const missingSlots   = lastDebug?.missingSlots   ?? []
  const filledCount    = Object.values(confirmedSlots).filter(Boolean).length
  const totalSlots     = DEFAULT_SLOT_DEFS.length

  return (
    <div className="flex flex-col xl:flex-row gap-4 min-h-[600px]">
      {/* Chat panel */}
      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden"
        style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background:'rgba(139,92,246,0.2)' }}>
              <FlaskConical className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <span className="text-sm font-bold text-white">AI Simulator</span>
            {convId && (
              <span className="text-[10px] text-white/25 font-mono truncate max-w-[120px]">{convId.slice(0,8)}…</span>
            )}
          </div>
          <button onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white/40 hover:text-white/70 transition-all"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
            <RotateCcw className="w-3 h-3" />Reset
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-[300px] max-h-[520px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)' }}>
                <MessageSquare className="w-6 h-6 text-violet-400" />
              </div>
              <p className="text-sm font-semibold text-white/40">Start a conversation</p>
              <p className="text-xs text-white/20">Type a message below to test your AI agent</p>
              <div className="flex flex-col gap-1.5 mt-2 w-full max-w-xs">
                {["Hi, I'm looking for a 2-bedroom flat in Krakow", "I need to rent an apartment, budget 3500 PLN", "My name is Adam and I want to buy a house"].map(s => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }}
                    className="px-3 py-2 rounded-xl text-left text-[11px] text-white/40 hover:text-white/70 transition-all"
                    style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
                    &quot;{s}&quot;
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    {msg.role !== 'user' && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="w-4 h-4 rounded flex items-center justify-center"
                          style={{ background:'rgba(139,92,246,0.25)' }}>
                          <Bot className="w-2.5 h-2.5 text-violet-400" />
                        </div>
                        <span className="text-[9px] font-bold text-violet-400/60 uppercase tracking-wider">AI Agent</span>
                      </div>
                    )}
                    <div className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap"
                      style={msg.role !== 'user' ? {
                        background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.2)',
                        color:'rgba(255,255,255,0.78)', borderTopLeftRadius:4,
                      } : {
                        background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
                        color:'rgba(255,255,255,0.68)', borderTopRightRadius:4,
                      }}>
                      {msg.content}
                    </div>
                    {msg.debug?.blocked && (
                      <div className="flex items-center gap-1 mt-1 text-[9px] text-amber-400/60">
                        <AlertTriangle className="w-2.5 h-2.5" />Guard fired — replaced repeated question
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1 items-center"
                    style={{ background:'rgba(139,92,246,0.10)', border:'1px solid rgba(139,92,246,0.15)' }}>
                    {[0,1,2].map(j => (
                      <motion.div key={j} className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        animate={{ y:[0,-4,0] }} transition={{ repeat:Infinity, duration:0.8, delay:j*0.15 }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3" style={{ borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex gap-2">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Type a message and press Enter…" disabled={sending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm text-white/80 placeholder:text-white/25 outline-none"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }} />
            <motion.button onClick={send} disabled={!input.trim() || sending} whileTap={{ scale:0.95 }}
              className="px-4 py-2.5 rounded-xl flex items-center justify-center"
              style={{ background:'rgba(124,58,237,0.85)', border:'1px solid rgba(167,139,250,0.4)' }}>
              <Play className="w-4 h-4 text-white" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Debug panels */}
      <div className="xl:w-72 flex flex-col gap-3">
        {/* Qualification state */}
        <div className="rounded-2xl p-4"
          style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Qualification State</div>
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: lastDebug?.isQualified ? '#34d399' : '#fbbf24', boxShadow:`0 0 6px ${lastDebug?.isQualified ? '#34d399' : '#fbbf24'}60` }} />
            <span className="text-sm font-bold" style={{ color: lastDebug?.isQualified ? '#34d399' : '#fbbf24' }}>
              {lastDebug ? (lastDebug.isQualified ? 'Qualified' : 'Qualifying') : 'Not started'}
            </span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-white/30 mb-1">
              <span>Slots filled</span>
              <span>{filledCount} / {totalSlots}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full transition-all" style={{ width:`${(filledCount/totalSlots)*100}%`, background:'linear-gradient(90deg,#7c3aed,#34d399)' }} />
            </div>
          </div>
        </div>

        {/* Extracted slots */}
        <div className="rounded-2xl p-4"
          style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Extracted Fields</div>
          <div className="flex flex-col gap-1.5">
            {DEFAULT_SLOT_DEFS.map(slot => {
              const val = confirmedSlots[slot.key]
              return (
                <div key={slot.key} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: val ? '#34d399' : 'rgba(255,255,255,0.12)' }} />
                  <span className="text-[10px] text-white/40 w-20 flex-shrink-0">{slot.label}</span>
                  <span className="text-[10px] font-semibold truncate" style={{ color: val ? '#34d399' : 'rgba(255,255,255,0.2)' }}>
                    {val ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Missing fields */}
        <div className="rounded-2xl p-4"
          style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Missing Fields ({missingSlots.length})</div>
          {missingSlots.length === 0 && lastDebug ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />All fields collected
            </div>
          ) : missingSlots.length === 0 ? (
            <div className="text-xs text-white/20">Waiting for first message…</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {missingSlots.map((key, i) => {
                const def = DEFAULT_SLOT_DEFS.find(s => s.key === key)
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-amber-400/60">{i + 1}.</span>
                    <span className="text-[10px] text-white/50">{def?.label ?? key}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* AI Summary */}
        {lastDebug?.ai_summary && (
          <div className="rounded-2xl p-4"
            style={{ background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)' }}>
            <div className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest mb-2">AI Summary</div>
            <p className="text-xs text-emerald-300/80 leading-relaxed">{lastDebug.ai_summary}</p>
          </div>
        )}

        {/* Raw JSON */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => setShowRaw(v => !v)}
            className="flex items-center justify-between w-full px-4 py-3 text-left">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Raw JSON Debug</span>
            {showRaw ? <EyeOff className="w-3.5 h-3.5 text-white/25" /> : <Eye className="w-3.5 h-3.5 text-white/25" />}
          </button>
          <AnimatePresence>
            {showRaw && rawResponse && (
              <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} className="overflow-hidden">
                <pre className="px-4 pb-4 text-[9px] text-emerald-300/70 leading-relaxed overflow-x-auto max-h-60 overflow-y-auto font-mono"
                  style={{ background:'rgba(0,0,0,0.3)' }}>
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════ */

export default function AIAgentSection({
  section,
  businessId,
  onLeadCreated,
  onAppointmentCreated,
}: {
  section:               string
  businessId:            string
  onLeadCreated?:        (leadId: string) => void
  onAppointmentCreated?: (apptId: string) => void
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={section} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.18 }}>
        {section === 'ai_overview'      && <AIOverviewPage     businessId={businessId} />}
        {section === 'ai_instructions'  && <AIInstructionsPage />}
        {section === 'ai_knowledge'     && <KnowledgeBasePage />}
        {section === 'ai_qualification' && <LeadQualificationPage businessId={businessId} />}
        {section === 'ai_test'          && (
          <TestAIPage
            businessId={businessId}
            onLeadCreated={onLeadCreated}
            onAppointmentCreated={onAppointmentCreated}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
