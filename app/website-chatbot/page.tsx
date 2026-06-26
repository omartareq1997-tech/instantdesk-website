import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Website Chatbot for Local Businesses | InstantDesk',
  description: 'Website chatbot for local businesses that need AI replies, lead capture, live chat handover, Google Sheet CRM, and follow-up workflows.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Website chatbot"
      title="A website chatbot that turns visitors into organized leads."
      description="InstantDesk adds a premium website chat experience that answers questions, captures intent, and gives your team a clean follow-up path."
      problem="Most local websites get visitors who are interested but not ready to call. Without chat, many leave without sharing contact details."
      solution="InstantDesk gives visitors a low-friction way to ask questions while your team receives structured lead records and conversation context."
      offerTitle="Website chat built for conversion"
      offer={[
        'AI answers from approved website and business content',
        'Lead capture for name, phone, email, service, and timing',
        'Live chat takeover for valuable conversations',
        'Google Sheet CRM and SMS follow-up support',
      ]}
      featureBullets={[
        'Embeddable website chat widget',
        'Approved business knowledge base',
        'Lead qualification prompts',
        'Human handover',
        'Mobile-friendly visitor experience',
        'Conversation summaries',
      ]}
      useCaseExample="A visitor asks if your service is available this week. The chatbot answers basic availability rules, captures contact details, and sends the lead to your team."
      useCases={[
        'Capture visitors who are browsing service pages.',
        'Answer pricing, availability, and location questions.',
        'Route high-intent conversations into live chat.',
      ]}
      faqs={[
        { question: 'Can the chatbot match our tone?', answer: 'Yes. Replies are configured around your approved service information and preferred tone.' },
        { question: 'Can it work without a full CRM?', answer: 'Yes. Google Sheets can act as a simple CRM for early lead tracking.' },
        { question: 'Can staff review conversations?', answer: 'Yes. The system is designed so your team can see context and improve workflows over time.' },
      ]}
      relatedLinks={[
        { label: 'AI receptionist', href: '/ai-receptionist' },
        { label: 'Human handover', href: '/human-handover-live-chat' },
        { label: 'Google Sheet CRM', href: '/google-sheets-crm-automation' },
      ]}
    />
  )
}
