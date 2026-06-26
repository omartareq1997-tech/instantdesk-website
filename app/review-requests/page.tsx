import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Review Request Automation for Local Businesses | InstantDesk',
  description: 'Review request automation for local service businesses using customer follow-up workflows, SMS prompts, and simple team oversight.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Review requests"
      title="Ask happy customers for reviews at the right moment."
      description="InstantDesk helps service businesses send polite review requests after completed visits, jobs, or appointments."
      problem="Reviews are easy to forget when your team is busy, even after customers have a good experience."
      solution="InstantDesk adds a simple review request workflow that supports your team without feeling pushy or generic."
      offerTitle="Review requests that protect your brand"
      offer={[
        'Review request messages after completed service moments',
        'SMS-friendly copy written in your business tone',
        'Status tracking in Google Sheets',
        'Human review for sensitive situations',
      ]}
      featureBullets={[
        'SMS review prompts',
        'Timing rules',
        'Google review link support',
        'Status tracking',
        'Team oversight',
        'Follow-up coordination',
      ]}
      useCaseExample="After a completed appointment, a customer receives a short thank-you message with a review link and your team sees the status in the lead sheet."
      useCases={[
        'Ask dental patients for reviews after completed visits.',
        'Follow up with salon clients after appointments.',
        'Request reviews after home service jobs are finished.',
      ]}
      faqs={[
        { question: 'Will review requests be spammy?', answer: 'No. The workflow should be polite, timed, and limited to appropriate customer moments.' },
        { question: 'Can we control the wording?', answer: 'Yes. Copy can match your brand voice and local market.' },
        { question: 'Does this replace reputation management software?', answer: 'No. It is a lightweight review request workflow designed for practical local business operations.' },
      ]}
      relatedLinks={[
        { label: 'Google reviews automation', href: '/google-reviews-automation' },
        { label: 'SMS follow-up', href: '/sms-follow-up-automation' },
        { label: 'AI receptionist', href: '/ai-receptionist' },
      ]}
    />
  )
}
