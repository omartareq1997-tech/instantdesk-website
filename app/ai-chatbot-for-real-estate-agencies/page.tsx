import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Chatbot for Real Estate Agencies | InstantDesk',
  description: 'AI-assisted live chat for real estate agencies that qualifies buyer, seller, and rental leads from your website.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="AI chatbot for real estate agencies"
      title="Qualify property leads while your agents are busy."
      description="InstantDesk captures budget, location, timing, and contact details from website visitors so agents can prioritize serious inquiries."
      problem="Property inquiries can arrive from listings, valuation pages, and rental pages at any hour. Agents need context before deciding who to call first."
      solution="InstantDesk qualifies buyer, seller, and rental inquiries with structured questions and sends clean lead summaries to your team."
      offerTitle="Real estate lead qualification"
      offer={[
        'Live chat for listing and valuation inquiries',
        'Buyer, seller, and rental lead qualification',
        'Google Sheet CRM with source and summary',
        'SMS follow-up when leads do not respond',
      ]}
      useCases={[
        'A buyer asks about a listing and shares budget and location.',
        'A seller asks about valuation and leaves contact details.',
        'An agent receives a clean summary before calling back.',
      ]}
      howItWorks={[
        'Define buyer, seller, and rental qualification fields.',
        'Capture budget, location, timing, property interest, and contact details from chat.',
        'Send the lead to Google Sheets and trigger follow-up when the prospect does not respond.',
      ]}
      useCaseExample="A buyer asks about a listing. InstantDesk captures budget, target area, financing status, phone number, and preferred viewing timing."
      faqs={[
        { question: 'Can it answer listing questions?', answer: 'It can answer approved general questions and capture specific listing interest for your team to follow up.' },
        { question: 'Can it qualify seller leads?', answer: 'Yes. It can collect property type, location, timeline, and contact details.' },
        { question: 'Does it replace an agent?', answer: 'No. It helps agents respond faster with better context.' },
      ]}
      relatedLinks={[
        { label: 'Lead capture', href: '/lead-capture' },
        { label: 'Google Sheet CRM', href: '/google-sheets-crm-automation' },
        { label: 'Human handover', href: '/human-handover-live-chat' },
      ]}
    />
  )
}
