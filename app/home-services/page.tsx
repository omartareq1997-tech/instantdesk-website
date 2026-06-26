import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Receptionist for Home Services | InstantDesk',
  description: 'AI receptionist and live chat for home service businesses that need urgent lead capture, Google Sheet CRM, SMS follow-up, and human handover.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Home services"
      title="Capture urgent home service inquiries before competitors do."
      description="InstantDesk helps home service teams answer website questions, collect job details, and route urgent leads to humans quickly."
      problem="Home service leads often contact several companies at once. Slow replies can lose the job before your team sees the message."
      solution="InstantDesk captures job type, location, urgency, contact details, and conversation context so your team can respond faster."
      offerTitle="Lead intake for service teams"
      offer={[
        'Website chat for urgent and routine service questions',
        'Lead capture for location, issue, timing, and phone',
        'Human handover for quote-sensitive conversations',
        'Google Sheet CRM and SMS follow-up workflows',
      ]}
      featureBullets={[
        'Urgency capture',
        'Location and service fields',
        'Email alerts',
        'Live handover',
        'SMS follow-up',
        'Simple CRM tracking',
      ]}
      useCaseExample="A homeowner asks about an urgent repair after hours. InstantDesk captures the address area, issue, phone number, and preferred callback time."
      useCases={[
        'Capture plumbing, repair, cleaning, and maintenance inquiries.',
        'Route emergency requests with complete context.',
        'Follow up when a lead does not answer the first response.',
      ]}
      faqs={[
        { question: 'Can it handle emergency requests?', answer: 'It can capture urgency and route the lead quickly, but emergency handling rules should be approved by your team.' },
        { question: 'Can we qualify by location?', answer: 'Yes. Location can be one of the required lead capture fields.' },
        { question: 'Can it support quote requests?', answer: 'Yes. It can capture job details and route custom quote conversations to a human.' },
      ]}
      relatedLinks={[
        { label: 'Lead capture', href: '/lead-capture' },
        { label: 'SMS follow-up', href: '/sms-follow-up-automation' },
        { label: 'Human handover', href: '/human-handover-live-chat' },
      ]}
    />
  )
}
