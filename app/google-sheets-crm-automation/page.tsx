import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Google Sheets CRM Automation | InstantDesk',
  description: 'Simple Google Sheets CRM automation for local businesses using website chat, lead capture, SMS follow-up, and review requests.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Google Sheets CRM automation"
      title="Turn website chats into a simple lead CRM."
      description="InstantDesk sends qualified lead details from website chat into Google Sheets so your team can track every inquiry without a heavy CRM."
      problem="Many local teams do not need a complex CRM, but they still need one reliable place for website leads, statuses, notes, and follow-up."
      solution="InstantDesk uses Google Sheets as a practical CRM layer for captured chat leads, conversation summaries, and next actions."
      offerTitle="Simple CRM for local teams"
      offer={[
        'Name, phone, email, interest, and source captured',
        'Conversation summaries added to Google Sheets',
        'Lead status fields for follow-up',
        'Works with SMS follow-up and review requests',
      ]}
      useCases={[
        'A salon tracks all website chat leads in one sheet.',
        'A real estate agency sees budget, location, and listing interest.',
        'A clinic team reviews new patient inquiries each morning.',
      ]}
      howItWorks={[
        'Define the lead fields your business needs, such as service, location, timing, and source.',
        'Send every qualified website chat lead into a structured Google Sheet row.',
        'Use status, owner, and next-action fields to manage follow-up without a heavy CRM.',
      ]}
      useCaseExample="A clinic receives three after-hours inquiries. In the morning, reception sees each lead with treatment interest, contact details, source, and next action."
      faqs={[
        { question: 'Why use Google Sheets instead of a CRM?', answer: 'For many local businesses, Google Sheets is faster to launch, easier to understand, and enough for early lead tracking.' },
        { question: 'Can this later connect to a CRM?', answer: 'Yes. The same lead capture structure can be adapted to a dedicated CRM later.' },
        { question: 'Can staff edit the sheet?', answer: 'Yes. Your team can update statuses, notes, and ownership directly in the sheet.' },
      ]}
      relatedLinks={[
        { label: 'Website design for local businesses', href: '/website-design-for-local-businesses' },
        { label: 'SMS follow-up automation', href: '/sms-follow-up-automation' },
        { label: 'Live chat for small businesses', href: '/live-chat-for-small-businesses' },
      ]}
    />
  )
}
