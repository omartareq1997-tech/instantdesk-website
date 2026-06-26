import Link from 'next/link'
import { ArrowRight, CheckCircle, MessageCircle } from 'lucide-react'
import { Header, Footer } from './PremiumHome'

export type SeoFaq = {
  question: string
  answer: string
}

export type SeoServicePageProps = {
  eyebrow: string
  title: string
  description: string
  problem?: string
  solution?: string
  offerTitle: string
  offer: string[]
  featureBullets?: string[]
  howItWorks?: string[]
  useCaseExample?: string
  useCases: string[]
  faqs: SeoFaq[]
  relatedLinks?: { label: string; href: string }[]
}

export default function SeoServicePage({
  eyebrow,
  title,
  description,
  problem,
  solution,
  offerTitle,
  offer,
  featureBullets,
  howItWorks,
  useCaseExample,
  useCases,
  faqs,
  relatedLinks = [
    { label: 'Live chat for small businesses', href: '/live-chat-for-small-businesses' },
    { label: 'Google Sheet CRM automation', href: '/google-sheets-crm-automation' },
    { label: 'SMS follow-up automation', href: '/sms-follow-up-automation' },
    { label: 'Google reviews automation', href: '/google-reviews-automation' },
  ],
}: SeoServicePageProps) {
  const features = featureBullets?.length ? featureBullets : offer
  const steps = howItWorks?.length ? howItWorks : [
    'Map the questions, services, routing rules, and lead fields your team needs.',
    'Launch website chat with approved answers, live handover, and Google Sheet CRM capture.',
    'Tune replies, follow-up timing, and review request workflows from real conversations.',
  ]
  const example = useCaseExample || useCases[0] || 'A website visitor asks a high-intent question. InstantDesk answers, captures the right details, and routes the lead to your team.'

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#0b0b0b]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Header />

      <section className="relative overflow-hidden bg-black px-4 pb-20 pt-32 text-white sm:px-6 lg:px-10 lg:pb-28 lg:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(85,55,33,0.5),transparent_44%),radial-gradient(ellipse_at_12%_12%,rgba(17,27,47,0.72),transparent_50%),linear-gradient(135deg,#070809,#11100f)]" />
        <div className="relative mx-auto max-w-[1320px]">
          <div className="max-w-5xl">
            <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#f8a36d]">{eyebrow}</p>
            <h1 className="mt-6 font-serif text-5xl leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              {title}
            </h1>
            <p className="mt-8 max-w-3xl text-lg font-semibold leading-8 text-white/72 sm:text-xl sm:leading-9">
              {description}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/#demo"
                className="group inline-flex w-fit items-center rounded-full bg-white px-7 py-3 text-sm font-black text-black transition-colors hover:bg-[#f5f0ea]"
              >
                Get a personalized demo
                <ArrowRight className="ml-2 h-4 w-4 text-[#f47a63] transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex w-fit items-center rounded-full border border-white/24 px-7 py-3 text-sm font-black text-white transition-colors hover:bg-white/10"
              >
                View pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">Clear offer</p>
            <h2 className="mt-5 font-serif text-4xl leading-none tracking-[-0.03em] sm:text-6xl">{offerTitle}</h2>
            <p className="mt-7 font-mono text-xs font-black uppercase tracking-[0.16em] text-black/38">Solution</p>
            <p className="mt-3 text-lg font-semibold leading-8 text-black/62">
              {solution || 'Built for outreach and real sales conversations: live chat first, AI assistance where useful, and clean lead records your team can act on.'}
            </p>
            <div className="mt-8 border-l border-[#df694f]/45 pl-5">
              <p className="font-mono text-xs font-black uppercase tracking-[0.16em] text-black/38">Problem</p>
              <p className="mt-3 text-base font-semibold leading-8 text-black/58">
                {problem || 'Local teams lose valuable leads when website visitors ask questions after hours, during appointments, or while staff are handling existing customers.'}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map(item => (
              <article key={item} className="border border-black/10 bg-white p-6">
                <CheckCircle className="h-5 w-5 text-[#df694f]" />
                <p className="mt-8 text-lg font-black leading-7">{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-[1320px] gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">How it works</p>
            <h2 className="mt-5 font-serif text-4xl leading-none tracking-[-0.03em] sm:text-6xl">From first question to followed-up lead.</h2>
          </div>
          <div className="grid gap-4">
            {steps.map((step, index) => (
              <article key={step} className="grid gap-5 border-t border-black/12 py-6 sm:grid-cols-[72px_1fr]">
                <p className="font-serif text-5xl leading-none tracking-[-0.04em] text-black/20">{String(index + 1).padStart(2, '0')}</p>
                <p className="text-lg font-semibold leading-8 text-black/64">{step}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-20 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1320px]">
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-white/44">Example use cases</p>
          <div className="mt-8 max-w-4xl border-l border-[#f8a36d]/50 pl-5">
            <p className="font-mono text-xs font-black uppercase tracking-[0.16em] text-white/34">Use case example</p>
            <p className="mt-3 text-2xl font-semibold leading-9 text-white/78">{example}</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {useCases.map(item => (
              <article key={item} className="min-h-56 border border-white/14 p-6 transition-colors hover:border-[#f47a63]/45">
                <MessageCircle className="h-5 w-5 text-[#f8a36d]" />
                <p className="mt-14 text-xl font-black leading-8">{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[980px]">
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-black/45">FAQ</p>
          <div className="mt-8 divide-y divide-black/14 border-y border-black/14">
            {faqs.map(faq => (
              <details key={faq.question} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-xl font-black">
                  {faq.question}
                  <span className="text-3xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-5 text-base font-semibold leading-8 text-black/62">{faq.answer}</p>
              </details>
            ))}
          </div>

          <div className="mt-16 bg-black p-8 text-white sm:p-10">
            <h2 className="font-serif text-4xl leading-tight tracking-[-0.03em]">Want to see this working for your business?</h2>
            <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-white/68">
              Book a personalized demo and we will map the exact website chat, lead capture, follow-up, and CRM flow for your business.
            </p>
            <Link href="/#demo" className="mt-8 inline-flex items-center rounded-full bg-white px-7 py-3 text-sm font-black text-black transition-colors hover:bg-[#f5f0ea]">
              Get personalized demo
              <ArrowRight className="ml-2 h-4 w-4 text-[#f47a63]" />
            </Link>
            <p className="mt-6 text-sm font-semibold text-white/45">
              Questions? <a href="mailto:contact@instantdesk.pl" className="text-white/75 underline underline-offset-4 hover:text-white">contact@instantdesk.pl</a>
            </p>
          </div>

          <div className="mt-12">
            <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-black/42">Related pages</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {relatedLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-black/12 px-4 py-2 text-sm font-bold text-black/62 transition-colors hover:border-[#df694f]/45 hover:text-black"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
