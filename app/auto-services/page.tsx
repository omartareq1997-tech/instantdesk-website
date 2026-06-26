import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Chat and Lead Capture for Auto Services | InstantDesk',
  description: 'AI receptionist and live chat for auto dealers, rentals, repair shops, and service businesses with lead capture and follow-up workflows.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Auto services"
      title="Turn vehicle questions into qualified conversations."
      description="InstantDesk helps auto service teams capture inquiries about rentals, repairs, availability, pricing, and callbacks from website visitors."
      problem="Auto leads often need fast answers about availability, timing, price range, or next steps before they choose another provider."
      solution="InstantDesk captures vehicle/service interest, contact details, timing, and handover needs so the team can follow up with context."
      offerTitle="Lead intake for auto teams"
      offer={[
        'Website chat for availability, service, and rental questions',
        'Lead capture for vehicle, timing, contact, and intent',
        'Human handover for quote or booking conversations',
        'Google Sheet CRM and SMS follow-up support',
      ]}
      featureBullets={[
        'Vehicle and service interest fields',
        'Live chat handover',
        'Email alerts',
        'Google Sheet CRM',
        'SMS follow-up',
        'Multilingual reply support',
      ]}
      useCaseExample="A visitor asks about a rental or repair slot. InstantDesk captures the vehicle details, timing, phone number, and preferred next step."
      useCases={[
        'Qualify rental inquiries by date, vehicle type, and contact details.',
        'Capture repair requests with service category and urgency.',
        'Route high-value buyer or booking conversations to staff.',
      ]}
      faqs={[
        { question: 'Can it work for rentals and repairs?', answer: 'Yes. Lead fields and answers can be configured around your business model.' },
        { question: 'Can staff take over sales conversations?', answer: 'Yes. Human handover is designed for higher-value or custom inquiries.' },
        { question: 'Can leads go into a simple CRM?', answer: 'Yes. Google Sheets can track each inquiry, status, source, and next action.' },
      ]}
      relatedLinks={[
        { label: 'Human handover', href: '/human-handover-live-chat' },
        { label: 'Lead capture', href: '/lead-capture' },
        { label: 'Google Sheet CRM', href: '/google-sheets-crm-automation' },
      ]}
    />
  )
}
