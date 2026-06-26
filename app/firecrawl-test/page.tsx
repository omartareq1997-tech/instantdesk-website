'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Globe,
  LayoutPanelTop,
  Lightbulb,
  Loader2,
  Mail,
  MousePointerClick,
  Navigation,
  Palette,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  TextSearch,
  TrendingUp,
  XCircle,
} from 'lucide-react'

interface ExtractedPage {
  url: string
  title: string
  headings: string[]
  contacts: string[]
  services: string[]
  summary: string
  markdownPreview: string
}

interface HeadingEntry {
  level: string
  text: string
}

interface WebsiteAudit {
  hero: {
    headline: string
    subheadline: string
    primaryCta: string
    secondaryCta: string
  }
  navigation: {
    menuItems: string[]
  }
  socialProof: {
    logos: string[]
    testimonials: string[]
    trustIndicators: string[]
  }
  leadCapture: {
    forms: string[]
    bookingWidgets: string[]
    contactOptions: string[]
  }
  design: {
    colorPalette: string[]
    buttonStyles: string[]
    layoutPatterns: string[]
  }
  seo: {
    title: string
    metaDescription: string
    headingStructure: HeadingEntry[]
  }
  strategy: {
    strengths: string[]
    weaknesses: string[]
    opportunities: string[]
    recommendations: string[]
  }
}

interface FirecrawlResult {
  mode: 'scrape' | 'crawl'
  inputUrl: string
  pageCount: number
  pages: ExtractedPage[]
  contacts: string[]
  services: string[]
  headings: string[]
  aiSummary: string
  audit: WebsiteAudit
}

type Mode = 'scrape' | 'crawl'

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
      {children}
    </span>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-500/10">
          <Icon className="h-4 w-4 text-orange-300" />
        </div>
        <h2 className="text-sm font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function EmptyState({ children = 'No signal detected.' }: { children?: React.ReactNode }) {
  return <p className="text-sm text-white/30">{children}</p>
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/25">{label}</div>
      <div className="text-sm font-semibold leading-relaxed text-white/72">{value || 'Not detected'}</div>
    </div>
  )
}

function ReportList({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return <EmptyState>{empty ?? 'No signal detected.'}</EmptyState>

  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item} className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs leading-relaxed text-white/58">
          {item}
        </li>
      ))}
    </ul>
  )
}

function StrategyList({ title, icon: Icon, items, tone }: { title: string; icon: React.ComponentType<{ className?: string }>; items: string[]; tone: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-black text-white">{title}</h3>
      </div>
      <ReportList items={items} />
    </section>
  )
}

export default function FirecrawlTestPage() {
  const [url, setUrl] = useState('https://instantdesk.pl')
  const [mode, setMode] = useState<Mode>('scrape')
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FirecrawlResult | null>(null)
  const [openPage, setOpenPage] = useState<string | null>(null)

  const allHeadings = useMemo(() => result?.headings ?? [], [result])
  const contacts = useMemo(() => result?.contacts ?? [], [result])
  const services = useMemo(() => result?.services ?? [], [result])

  async function run(event: { preventDefault: () => void }, nextMode = mode) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    setMode(nextMode)

    try {
      const response = await fetch('/api/firecrawl-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode: nextMode, limit }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Firecrawl request failed')
      setResult(data as FirecrawlResult)
      setOpenPage((data as FirecrawlResult).pages[0]?.url ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Firecrawl request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#080807] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-400/20 bg-orange-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
            <Sparkles className="h-3.5 w-3.5" />
            Firecrawl Test Console
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Scrape and crawl websites with Firecrawl</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-white/45">
            Enter a URL, scrape one page or crawl the website, then inspect extracted pages, conversion signals, SEO structure, design patterns and recommendations.
          </p>
        </div>

        <form onSubmit={(event) => run(event)} className="mb-8 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_140px_180px]">
            <label className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
              <Globe className="h-4 w-4 flex-shrink-0 text-white/35" />
              <input
                value={url}
                onChange={event => setUrl(event.target.value)}
                placeholder="https://example.com"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/20"
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
              <span className="text-xs font-bold text-white/35">Pages</span>
              <input
                type="number"
                min={1}
                max={25}
                value={limit}
                onChange={event => setLimit(Number(event.target.value))}
                className="w-full bg-transparent text-sm text-white outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={(event) => void run(event, 'scrape')}
                className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
              >
                {loading && mode === 'scrape' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Scrape page'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={(event) => void run(event, 'crawl')}
                className="rounded-xl border border-stone-400/25 bg-stone-500/12 px-4 py-3 text-sm font-bold text-stone-100 transition-colors hover:bg-stone-500/20 disabled:opacity-50"
              >
                {loading && mode === 'crawl' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Crawl site'}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="mb-8 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-8 text-center">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-orange-300" />
            <div className="text-sm font-bold text-white">Firecrawl is processing the request...</div>
            <div className="mt-1 text-xs text-white/35">Crawls can take a little longer depending on page count.</div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Panel title="Result" icon={Search}>
                <div className="text-3xl font-black">{result.pageCount}</div>
                <div className="text-xs text-white/35">{result.mode === 'crawl' ? 'pages crawled' : 'page scraped'}</div>
              </Panel>
              <Panel title="Contacts" icon={Mail}>
                <div className="text-3xl font-black">{contacts.length}</div>
                <div className="text-xs text-white/35">emails and phone numbers</div>
              </Panel>
              <Panel title="Services" icon={TextSearch}>
                <div className="text-3xl font-black">{services.length}</div>
                <div className="text-xs text-white/35">service keywords detected</div>
              </Panel>
              <Panel title="Headings" icon={ChevronDown}>
                <div className="text-3xl font-black">{allHeadings.length}</div>
                <div className="text-xs text-white/35">h1-h3 style sections</div>
              </Panel>
            </div>

            <Panel title="AI Summary" icon={Bot}>
              <p className="text-sm leading-relaxed text-white/65">{result.aiSummary}</p>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Hero Section" icon={LayoutPanelTop}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReportField label="Headline" value={result.audit.hero.headline} />
                  <ReportField label="Subheadline" value={result.audit.hero.subheadline} />
                  <ReportField label="Primary CTA" value={result.audit.hero.primaryCta} />
                  <ReportField label="Secondary CTA" value={result.audit.hero.secondaryCta} />
                </div>
              </Panel>

              <Panel title="Navigation" icon={Navigation}>
                <div className="flex flex-wrap gap-2">
                  {result.audit.navigation.menuItems.length
                    ? result.audit.navigation.menuItems.map(item => <Pill key={item}>{item}</Pill>)
                    : <EmptyState>No navigation items detected.</EmptyState>}
                </div>
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title="Social Proof" icon={ShieldCheck}>
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Logos</div>
                    <div className="flex flex-wrap gap-2">
                      {result.audit.socialProof.logos.length
                        ? result.audit.socialProof.logos.map(logo => <Pill key={logo}>{logo}</Pill>)
                        : <EmptyState>No logo alt text detected.</EmptyState>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Testimonials</div>
                    <ReportList items={result.audit.socialProof.testimonials.slice(0, 5)} empty="No testimonial text detected." />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Trust Indicators</div>
                    <div className="flex flex-wrap gap-2">
                      {result.audit.socialProof.trustIndicators.length
                        ? result.audit.socialProof.trustIndicators.map(indicator => <Pill key={indicator}>{indicator}</Pill>)
                        : <EmptyState>No trust indicators detected.</EmptyState>}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Lead Capture" icon={MousePointerClick}>
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Forms</div>
                    <ReportList items={result.audit.leadCapture.forms} empty="No forms detected." />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Booking Widgets</div>
                    <ReportList items={result.audit.leadCapture.bookingWidgets.slice(0, 5)} empty="No booking language detected." />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Contact Options</div>
                    <div className="flex flex-wrap gap-2">
                      {result.audit.leadCapture.contactOptions.length
                        ? result.audit.leadCapture.contactOptions.map(option => <Pill key={option}>{option}</Pill>)
                        : <EmptyState>No contact options detected.</EmptyState>}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Design" icon={Palette}>
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Color Palette</div>
                    <div className="flex flex-wrap gap-2">
                      {result.audit.design.colorPalette.length
                        ? result.audit.design.colorPalette.map(color => (
                            <span key={color} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
                              {color.startsWith('#') && <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: color }} />}
                              {color}
                            </span>
                          ))
                        : <EmptyState>No colors detected.</EmptyState>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Button Styles</div>
                    <ReportList items={result.audit.design.buttonStyles} empty="No button styles detected." />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Layout Patterns</div>
                    <ReportList items={result.audit.design.layoutPatterns} empty="No layout patterns detected." />
                  </div>
                </div>
              </Panel>
            </div>

            <Panel title="SEO" icon={FileSearch}>
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-3">
                  <ReportField label="Title" value={result.audit.seo.title} />
                  <ReportField label="Meta Description" value={result.audit.seo.metaDescription || 'No meta description detected.'} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Heading Structure</div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {result.audit.seo.headingStructure.length ? result.audit.seo.headingStructure.map((heading, index) => (
                      <div key={`${heading.level}-${heading.text}-${index}`} className="grid grid-cols-[48px_1fr] gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                        <span className="font-black uppercase text-orange-300">{heading.level}</span>
                        <span className="text-white/58">{heading.text}</span>
                      </div>
                    )) : <EmptyState>No heading structure detected.</EmptyState>}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-4">
              <StrategyList title="Strengths" icon={CheckCircle2} items={result.audit.strategy.strengths} tone="border-emerald-400/20 bg-emerald-500/10 text-emerald-300" />
              <StrategyList title="Weaknesses" icon={XCircle} items={result.audit.strategy.weaknesses} tone="border-red-400/20 bg-red-500/10 text-red-300" />
              <StrategyList title="Opportunities" icon={TrendingUp} items={result.audit.strategy.opportunities} tone="border-stone-400/20 bg-stone-500/10 text-stone-300" />
              <StrategyList title="Recommendations" icon={Lightbulb} items={result.audit.strategy.recommendations} tone="border-amber-400/20 bg-amber-500/10 text-amber-300" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-1">
                <Panel title="Contact Information" icon={Phone}>
                  <div className="flex flex-wrap gap-2">
                    {contacts.length ? contacts.map(contact => <Pill key={contact}>{contact}</Pill>) : <p className="text-sm text-white/30">No contact information detected.</p>}
                  </div>
                </Panel>

                <Panel title="Detected Services" icon={TextSearch}>
                  <div className="flex flex-wrap gap-2">
                    {services.length ? services.map(service => <Pill key={service}>{service}</Pill>) : <p className="text-sm text-white/30">No matching service keywords detected.</p>}
                  </div>
                </Panel>

                <Panel title="Headings" icon={ChevronDown}>
                  <ul className="space-y-2">
                    {allHeadings.length ? allHeadings.slice(0, 30).map(heading => (
                      <li key={heading} className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-white/55">{heading}</li>
                    )) : <li className="text-sm text-white/30">No headings detected.</li>}
                  </ul>
                </Panel>
              </div>

              <Panel title="Extracted Pages" icon={Globe}>
                <div className="space-y-3">
                  {result.pages.map(page => {
                    const isOpen = openPage === page.url
                    return (
                      <article key={page.url} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20">
                        <button
                          onClick={() => setOpenPage(isOpen ? null : page.url)}
                          className="flex w-full items-center justify-between gap-4 p-4 text-left"
                        >
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-white">{page.title}</h3>
                            <p className="truncate text-xs text-white/30">{page.url}</p>
                          </div>
                          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-white/35 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOpen && (
                          <div className="space-y-4 border-t border-white/[0.06] p-4">
                            <p className="text-sm leading-relaxed text-white/55">{page.summary}</p>
                            <div>
                              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Headings</div>
                              <div className="flex flex-wrap gap-2">
                                {page.headings.length ? page.headings.map(heading => <Pill key={heading}>{heading}</Pill>) : <span className="text-xs text-white/25">None</span>}
                              </div>
                            </div>
                            <div>
                              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/25">Markdown preview</div>
                              <p className="max-h-40 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 p-3 text-xs leading-relaxed text-white/38">
                                {page.markdownPreview || 'No markdown returned.'}
                              </p>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
