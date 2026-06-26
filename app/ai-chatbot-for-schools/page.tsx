import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Chatbot for Schools | InstantDesk',
  description: 'AI-assisted live chat for schools that captures parent inquiries, open-day interest, tour requests, and contact details.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="AI chatbot for schools"
      title="Help parents get answers before they call the office."
      description="InstantDesk helps schools capture website inquiries, open-day interest, tour requests, and parent contact details without adding office admin."
      problem="School offices receive repeated admissions, tour, calendar, and programme questions while also handling daily administration."
      solution="InstantDesk answers approved website questions, captures parent inquiries, and routes sensitive conversations to staff."
      offerTitle="School inquiry intake"
      offer={[
        'Website chat for admissions and tour questions',
        'Lead capture for parent contact details',
        'Google Sheet CRM for office follow-up',
        'Human handover for sensitive questions',
      ]}
      useCases={[
        'A parent asks about admissions requirements after office hours.',
        'A family requests a school tour from the website.',
        'Office staff receive a clean inquiry summary the next morning.',
      ]}
      howItWorks={[
        'Set approved admissions, tour, calendar, and contact rules.',
        'Capture parent name, child age/year, inquiry type, contact details, and preferred follow-up.',
        'Organize inquiries in Google Sheets for office staff to review and respond.',
      ]}
      useCaseExample="A parent asks about admissions after office hours. InstantDesk captures the child year group, parent contact details, and tour interest for staff follow-up."
      faqs={[
        { question: 'Can it answer policy questions?', answer: 'It should only answer approved school FAQs and route sensitive questions to staff.' },
        { question: 'Can staff take over live chat?', answer: 'Yes. Human handover is designed for questions that need direct staff support.' },
        { question: 'Can inquiries go to a spreadsheet?', answer: 'Yes. Parent inquiries can be organized in Google Sheets for simple follow-up.' },
      ]}
      relatedLinks={[
        { label: 'Live chat for small businesses', href: '/live-chat-for-small-businesses' },
        { label: 'Google Sheet CRM automation', href: '/google-sheets-crm-automation' },
        { label: 'Human handover live chat', href: '/human-handover-live-chat' },
      ]}
    />
  )
}
