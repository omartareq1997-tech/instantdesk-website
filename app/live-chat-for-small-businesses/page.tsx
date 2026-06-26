import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Live Chat for Small Businesses | InstantDesk',
  description: 'Premium live chat for small businesses with AI-assisted replies, lead capture, Google Sheet CRM, SMS follow-up, and review requests.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Live chat for small businesses"
      title="Reply faster without hiring a full-time receptionist."
      description="InstantDesk gives small businesses a premium live chat system backed by AI assistance, lead capture, and simple follow-up automation."
      problem="Small teams cannot watch every website visit while serving customers, answering calls, and handling appointments."
      solution="InstantDesk combines live chat, AI assistance, lead capture, and human handover so website visitors get a response and your team keeps control."
      offerTitle="Small business live chat"
      offer={[
        'Website live chat widget',
        'AI-assisted answers for common questions',
        'Lead capture and Google Sheet CRM',
        'SMS follow-up and review request automation',
      ]}
      useCases={[
        'A visitor asks a question while staff are with customers.',
        'A lead leaves contact details instead of bouncing from the website.',
        'The owner reviews every inquiry from one simple lead sheet.',
      ]}
      howItWorks={[
        'Install the website chat widget and configure your services, FAQs, and lead fields.',
        'Let InstantDesk answer common questions and notify your team when a human should step in.',
        'Review captured leads, statuses, follow-up, and outcomes in a simple workflow.',
      ]}
      useCaseExample="A website visitor asks if you are available this week while staff are busy. InstantDesk captures the request and alerts the team with context."
      faqs={[
        { question: 'Is this live chat or a chatbot?', answer: 'It is both: live chat for human handoff, with AI assistance for common questions and lead capture.' },
        { question: 'Can my team answer from the dashboard?', answer: 'Yes. The dashboard is designed so staff can monitor and take over conversations.' },
        { question: 'Is this suitable for one-location businesses?', answer: 'Yes. The Launch plan is designed for local teams that need practical lead capture without enterprise complexity.' },
      ]}
      relatedLinks={[
        { label: 'Website chatbot', href: '/website-chatbot' },
        { label: 'Lead capture', href: '/lead-capture' },
        { label: 'AI receptionist', href: '/ai-receptionist' },
      ]}
    />
  )
}
