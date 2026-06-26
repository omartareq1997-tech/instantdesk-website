import type { Metadata } from 'next'
import { Header, Footer } from '../components/PremiumHome'

export const metadata: Metadata = {
  title: 'Terms | InstantDesk',
  description: 'Terms information for InstantDesk website visitors and demo inquiries.',
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#0b0b0b]">
      <Header />
      <section className="bg-black px-4 pb-20 pt-32 text-white sm:px-6 lg:px-10 lg:pt-36">
        <div className="mx-auto max-w-[980px]">
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#f8a36d]">Terms</p>
          <h1 className="mt-6 font-serif text-5xl leading-none tracking-[-0.035em] sm:text-7xl">Terms of use.</h1>
          <p className="mt-8 text-lg font-semibold leading-8 text-white/70">
            These website terms cover public InstantDesk pages and demo inquiries. Service terms are agreed separately for each client setup.
          </p>
        </div>
      </section>
      <section className="px-4 py-20 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[980px] space-y-10 text-base font-semibold leading-8 text-black/62">
          <p>Website content is provided for general information about InstantDesk services and does not create a service agreement by itself.</p>
          <p>Demo requests and email inquiries do not guarantee availability, pricing, or acceptance of a project. Any client work is scoped and confirmed separately.</p>
          <p>For questions about terms, project scope, or service availability, contact contact@instantdesk.pl.</p>
        </div>
      </section>
      <Footer />
    </main>
  )
}
