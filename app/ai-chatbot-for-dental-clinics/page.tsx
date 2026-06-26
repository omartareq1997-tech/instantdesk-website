import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Chatbot for Dental Clinics | InstantDesk',
  description: 'AI-assisted live chat for dental clinics that captures patient inquiries, organizes leads, and helps reduce missed appointment opportunities.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="AI chatbot for dental clinics"
      title="Capture new patient inquiries before they go cold."
      description="InstantDesk helps dental clinics answer common website questions, capture contact details, and prepare patient inquiries for reception."
      problem="New patient inquiries often arrive after reception hours or while staff are already helping patients. Without fast capture, those leads can book somewhere else."
      solution="InstantDesk answers approved clinic FAQs, captures treatment interest and contact details, and routes sensitive questions to reception."
      offerTitle="Dental inquiry intake"
      offer={[
        'Website chat for new patient questions',
        'Lead capture for treatment interest and contact details',
        'Google Sheet CRM for reception follow-up',
        'SMS follow-up and review request workflows',
      ]}
      useCases={[
        'A patient asks about implants after reception closes.',
        'A visitor wants pricing guidance before booking a consultation.',
        'Reception receives a clean lead summary the next morning.',
      ]}
      howItWorks={[
        'Configure approved answers for treatments, opening hours, consultation rules, and escalation boundaries.',
        'Capture treatment interest, preferred time, contact details, and consent from website visitors.',
        'Send qualified inquiries into Google Sheets and follow up with reception-ready context.',
      ]}
      useCaseExample="A visitor asks about implants at 21:30. InstantDesk explains the approved next step, captures contact details, and flags the inquiry for reception."
      faqs={[
        { question: 'Can the chatbot give medical advice?', answer: 'No. It should answer approved clinic FAQs, capture intent, and route medical questions to your team.' },
        { question: 'Can staff take over chats?', answer: 'Yes. Live chat handoff keeps your team in control when a patient needs a human response.' },
        { question: 'Can it request Google reviews?', answer: 'Yes. Review request workflows can be triggered after appointments or completed visits.' },
      ]}
      relatedLinks={[
        { label: 'AI receptionist', href: '/ai-receptionist' },
        { label: 'Human handover', href: '/human-handover-live-chat' },
        { label: 'Review requests', href: '/review-requests' },
      ]}
    />
  )
}
