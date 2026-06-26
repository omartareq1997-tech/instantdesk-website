import type { Metadata } from 'next'
import { Header, Footer } from '../components/PremiumHome'

export const metadata: Metadata = {
  title: 'Privacy | InstantDesk',
  description: 'Privacy information for InstantDesk website visitors and demo inquiries.',
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#0b0b0b]">
      <Header />
      <section className="bg-black px-4 pb-20 pt-32 text-white sm:px-6 lg:px-10 lg:pt-36">
        <div className="mx-auto max-w-[980px]">
          <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#f8a36d]">Privacy</p>
          <h1 className="mt-6 font-serif text-5xl leading-none tracking-[-0.035em] sm:text-7xl">Privacy at InstantDesk.</h1>
          <p className="mt-8 text-lg font-semibold leading-8 text-white/70">
            InstantDesk uses information you submit to respond to demo requests, support inquiries, and service conversations. For privacy questions, contact contact@instantdesk.pl.
          </p>
        </div>
      </section>
      <section className="px-4 py-20 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[980px] space-y-10 text-base font-semibold leading-8 text-black/62">
          <p>We collect only the information needed to understand your request, contact you, and provide the service you ask about.</p>
          <p>When InstantDesk is configured for a client, lead and conversation data should be handled according to the client workflow, applicable law, and agreed service setup.</p>
          <p>We do not sell demo request information. Operational data may be processed by service providers needed to run the website, forms, email, chat, and automation workflows.</p>
        </div>
      </section>
      <Footer />
    </main>
  )
}
