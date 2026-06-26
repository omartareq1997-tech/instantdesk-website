import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Google Reviews Automation | InstantDesk',
  description: 'Automated Google review request workflows for local businesses, connected to live chat, lead capture, and customer follow-up.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Google reviews automation"
      title="Ask happy customers for reviews at the right time."
      description="InstantDesk helps local businesses request Google reviews after appointments, jobs, or visits while keeping the workflow simple and professional."
      problem="Happy customers often leave without being asked for a review, and busy teams rarely remember to follow up consistently."
      solution="InstantDesk adds a polite review request step to your customer workflow so satisfied customers can leave feedback at the right moment."
      offerTitle="Review request workflow"
      offer={[
        'Review request messages after completed work',
        'SMS follow-up for happy customers',
        'Simple tracking in Google Sheets',
        'Connected with live chat and lead records',
      ]}
      useCases={[
        'A salon sends a review request after a completed appointment.',
        'A clinic asks satisfied patients to share feedback after a visit.',
        'A home service business follows up after a completed job.',
      ]}
      howItWorks={[
        'Define when a customer should receive a review request.',
        'Send a short, brand-safe message with the correct review link.',
        'Track sent requests and customer status alongside your lead workflow.',
      ]}
      useCaseExample="After a completed appointment, InstantDesk sends a polite thank-you and review link while your team keeps visibility in the lead sheet."
      faqs={[
        { question: 'Can you guarantee reviews?', answer: 'No. The system can ask professionally and consistently, but customers decide whether to leave a review.' },
        { question: 'Does this follow Google policy?', answer: 'The workflow should ask for honest feedback and avoid incentives, gating, or misleading review practices.' },
        { question: 'Can this connect with lead capture?', answer: 'Yes. Review requests can sit alongside your live chat, lead capture, and CRM workflow.' },
      ]}
      relatedLinks={[
        { label: 'Review requests', href: '/review-requests' },
        { label: 'SMS follow-up', href: '/sms-follow-up-automation' },
        { label: 'Beauty salons', href: '/ai-chatbot-for-beauty-salons' },
      ]}
    />
  )
}
