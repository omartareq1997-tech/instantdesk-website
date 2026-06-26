import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Receptionist for Local Businesses | InstantDesk',
  description: 'AI receptionist with live chat, lead capture, Google Sheet CRM, SMS follow-up, review requests, and human handover for local service businesses.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="AI receptionist"
      title="An AI receptionist for the leads your team cannot miss."
      description="InstantDesk answers website questions, captures lead details, routes important conversations to humans, and keeps follow-up organized."
      problem="Local teams miss high-intent inquiries when calls, appointments, and after-hours website visits happen at the same time."
      solution="InstantDesk gives your business a front-desk layer that responds quickly, collects the right details, and keeps your team in control."
      offerTitle="Reception support without adding headcount"
      offer={[
        'AI replies from your approved business knowledge',
        'Live chat handover for urgent or sensitive conversations',
        'Lead capture with contact details and service intent',
        'Google Sheet CRM records for every qualified inquiry',
      ]}
      featureBullets={[
        'Website AI chat',
        'Human handover',
        'Lead capture fields',
        'Google Sheet CRM',
        'SMS follow-up',
        'Review request workflows',
      ]}
      howItWorks={[
        'We map your services, FAQs, booking rules, contact fields, and escalation rules.',
        'InstantDesk launches on your website with AI replies and live handover enabled.',
        'Every qualified lead is organized for follow-up, tuning, and review request workflows.',
      ]}
      useCaseExample="A visitor asks about pricing after closing. InstantDesk answers the approved basics, captures phone and service interest, and flags the lead for follow-up."
      useCases={[
        'Answer common service and booking questions after hours.',
        'Capture high-intent website visitors before they compare competitors.',
        'Route complex conversations to your team with full context.',
      ]}
      faqs={[
        { question: 'Does it replace my receptionist?', answer: 'No. It supports your team by handling repetitive website questions and capturing leads when staff are busy or offline.' },
        { question: 'Can my team take over conversations?', answer: 'Yes. Human handover is part of the workflow when a lead needs a real person.' },
        { question: 'What happens to captured leads?', answer: 'Leads can be sent into a Google Sheet CRM with contact details, intent, source, and conversation summary.' },
      ]}
      relatedLinks={[
        { label: 'Website chatbot', href: '/website-chatbot' },
        { label: 'Live chat', href: '/live-chat-for-small-businesses' },
        { label: 'Lead capture', href: '/lead-capture' },
      ]}
    />
  )
}
