import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Lead Capture for Local Business Websites | InstantDesk',
  description: 'Website lead capture for local businesses using AI chat, live handover, Google Sheet CRM, SMS follow-up, and review request workflows.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Lead capture"
      title="Capture the details your team needs before the lead goes cold."
      description="InstantDesk turns website chats into structured lead records with contact details, service interest, urgency, and follow-up status."
      problem="Forms are often too rigid and calls are easy to miss. High-intent visitors need a faster way to explain what they need."
      solution="InstantDesk captures leads conversationally, then sends clean records into a Google Sheet CRM for follow-up."
      offerTitle="Lead capture that feels like a conversation"
      offer={[
        'Contact details, service interest, location, and timing',
        'Conversation summary and website source tracking',
        'Email alerts for new qualified leads',
        'Google Sheet CRM status fields for your team',
      ]}
      featureBullets={[
        'Custom lead fields',
        'Qualification questions',
        'Email alerts',
        'Google Sheet CRM rows',
        'Lead source tracking',
        'Follow-up status fields',
      ]}
      useCaseExample="A homeowner asks about an urgent job. InstantDesk collects location, phone, service type, and timing before alerting the team."
      useCases={[
        'Qualify visitors by service, location, budget, or urgency.',
        'Send new leads to the right person quickly.',
        'Keep every website inquiry visible in one simple sheet.',
      ]}
      faqs={[
        { question: 'Can the lead fields be customized?', answer: 'Yes. Fields should match the details your team actually needs to follow up.' },
        { question: 'Can leads be scored?', answer: 'Growth and Scale workflows can include simple scoring based on urgency, service type, and fit.' },
        { question: 'Can leads trigger SMS follow-up?', answer: 'Yes. Lead capture can connect to SMS follow-up workflows.' },
      ]}
      relatedLinks={[
        { label: 'SMS follow-up', href: '/sms-follow-up-automation' },
        { label: 'Google Sheet CRM', href: '/google-sheets-crm-automation' },
        { label: 'Website chatbot', href: '/website-chatbot' },
      ]}
    />
  )
}
