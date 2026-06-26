import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Human Handover Live Chat | InstantDesk',
  description: 'Human handover live chat for local businesses that want AI-assisted replies without losing control of important conversations.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Human handover live chat"
      title="AI can start the chat. Your team can take over."
      description="InstantDesk gives local businesses AI-assisted website chat with clear human handover for urgent, sensitive, or high-value leads."
      problem="AI should not handle every conversation alone. Sensitive, urgent, or high-value leads need a clear path to a real person."
      solution="InstantDesk keeps AI useful for common questions while giving your team the context and control to take over important chats."
      offerTitle="Control when it matters"
      offer={[
        'Live chat dashboard for team takeover',
        'AI-assisted replies for common questions',
        'Lead context visible before handover',
        'Google Sheet CRM and SMS follow-up support',
      ]}
      useCases={[
        'A patient asks a question that needs reception.',
        'A property buyer wants to speak with an agent.',
        'A service lead needs a custom quote before booking.',
      ]}
      howItWorks={[
        'Define which topics, keywords, or lead types should trigger handover.',
        'Show staff the conversation history, lead details, and recommended next action.',
        'Continue the workflow with Google Sheet CRM status and SMS follow-up when needed.',
      ]}
      useCaseExample="A prospect asks for a custom quote. InstantDesk captures context, then alerts the team so a human can continue with the full conversation history."
      faqs={[
        { question: 'Can I turn AI off for certain questions?', answer: 'Yes. Handover rules can route sensitive or high-value conversations to your team.' },
        { question: 'Will the team see conversation history?', answer: 'Yes. Staff can see the context before replying.' },
        { question: 'Is this only for large teams?', answer: 'No. It is useful for small businesses that want faster replies without losing human control.' },
      ]}
      relatedLinks={[
        { label: 'Live chat for small businesses', href: '/live-chat-for-small-businesses' },
        { label: 'SMS follow-up automation', href: '/sms-follow-up-automation' },
        { label: 'AI chatbot for dental clinics', href: '/ai-chatbot-for-dental-clinics' },
      ]}
    />
  )
}
