import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'SMS Follow-Up Automation | InstantDesk',
  description: 'SMS follow-up automation for local businesses that need to respond faster, recover missed leads, and keep prospects moving.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="SMS follow-up automation"
      title="Follow up before a warm lead forgets you."
      description="InstantDesk helps local businesses send timely SMS follow-ups after website chat, missed booking intent, or unanswered lead capture forms."
      problem="Interested leads often stop responding after the first interaction. Without a simple follow-up rhythm, warm opportunities disappear."
      solution="InstantDesk supports timely SMS follow-up tied to chat capture, Google Sheet CRM status, and human handover when a reply needs attention."
      offerTitle="Follow-up that supports your team"
      offer={[
        'SMS messages after captured website leads',
        'Follow-up prompts for leads that do not book',
        'Google Sheet tracking for lead status',
        'Human handover when a lead replies',
      ]}
      useCases={[
        'A dental lead asks a question but does not book.',
        'A salon visitor leaves a phone number but stops responding.',
        'A home service inquiry gets a next-day follow-up reminder.',
      ]}
      howItWorks={[
        'Capture a lead from website chat with phone number, service intent, and status.',
        'Trigger a short follow-up when the lead does not book, confirm, or reply.',
        'Route replies or high-intent responses back to your team for human follow-up.',
      ]}
      useCaseExample="A visitor leaves a phone number but does not book. InstantDesk sends a short follow-up and updates the lead status for the team."
      faqs={[
        { question: 'Will SMS messages feel automated?', answer: 'They should be short, clear, and written in your brand voice. The goal is helpful follow-up, not spam.' },
        { question: 'Can my team reply manually?', answer: 'Yes. Human handover is available when a lead needs a real conversation.' },
        { question: 'Can follow-up rules be customized?', answer: 'Yes. Timing, message copy, and triggers should match your workflow.' },
      ]}
      relatedLinks={[
        { label: 'Live chat for small businesses', href: '/live-chat-for-small-businesses' },
        { label: 'Google Sheet CRM automation', href: '/google-sheets-crm-automation' },
        { label: 'Human handover live chat', href: '/human-handover-live-chat' },
      ]}
    />
  )
}
