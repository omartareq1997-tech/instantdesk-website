import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Chatbot for Beauty Salons | InstantDesk',
  description: 'Live chat and AI-assisted lead capture for beauty salons, med spas, barbers, and appointment-based local businesses.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="AI chatbot for beauty salons"
      title="Turn price and availability questions into booked leads."
      description="InstantDesk helps salons respond to website visitors, collect service interest, and follow up when clients do not book right away."
      problem="Salon visitors often ask about prices, services, and openings outside working hours. If nobody responds, they move to another salon."
      solution="InstantDesk captures service interest, contact details, preferred timing, and follow-up status while keeping staff available for human takeover."
      offerTitle="Salon lead capture"
      offer={[
        'Website chat for services, prices, and availability',
        'Live handoff when staff need to step in',
        'Lead records in Google Sheets',
        'SMS follow-up and review requests',
      ]}
      useCases={[
        'A visitor asks about balayage pricing on Sunday evening.',
        'A client asks if a stylist has availability this week.',
        'A completed appointment triggers a polite review request.',
      ]}
      howItWorks={[
        'Load approved services, price guidance, booking links, and salon policies.',
        'Capture the requested service, timing, contact details, and preferred next step.',
        'Use SMS follow-up and review request workflows to keep client communication moving.',
      ]}
      useCaseExample="A visitor asks about colour pricing on Sunday. InstantDesk collects the service, hair length note, phone number, and preferred appointment window."
      faqs={[
        { question: 'Can it connect to booking software?', answer: 'Where possible, InstantDesk can link or integrate with your existing booking flow. Otherwise it captures booking intent for staff follow-up.' },
        { question: 'Will it replace reception?', answer: 'No. It supports reception by answering basic questions and capturing leads when staff are busy.' },
        { question: 'Can I approve the answers?', answer: 'Yes. The chatbot should be configured from your approved services, prices, and policies.' },
      ]}
      relatedLinks={[
        { label: 'Website chatbot', href: '/website-chatbot' },
        { label: 'SMS follow-up', href: '/sms-follow-up-automation' },
        { label: 'Review requests', href: '/review-requests' },
      ]}
    />
  )
}
