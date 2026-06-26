import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'Website Design for Local Businesses | InstantDesk',
  description: 'Premium local business websites with live chat, lead capture, Google Sheet CRM, SMS follow-up, and review request workflows.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Website design for local businesses"
      title="A website that captures leads, not just attention."
      description="InstantDesk builds local business websites around live chat, fast lead capture, simple CRM handoff, and follow-up workflows."
      problem="Many local websites look acceptable but do not give visitors a clear path to ask questions, leave details, or get followed up."
      solution="InstantDesk positions the website around conversion: live chat, AI assistance, lead capture, Google Sheet CRM, SMS follow-up, and review requests."
      offerTitle="Website + live chat system"
      offer={[
        'Premium website structure for local services',
        'Live chat and AI-assisted replies',
        'Lead capture forms connected to Google Sheets',
        'SMS follow-up and review request workflow',
      ]}
      useCases={[
        'A dental clinic captures patient questions after hours.',
        'A beauty salon answers price and availability questions from mobile visitors.',
        'A local service business routes urgent inquiries before competitors reply.',
      ]}
      howItWorks={[
        'Clarify the services, audience, proof points, and lead actions your website needs.',
        'Build or improve the site around chat, CTA placement, lead capture, and trust sections.',
        'Connect captured leads to Google Sheets, SMS follow-up, and review request workflows.',
      ]}
      useCaseExample="A local business replaces a static contact page with a website chat flow that captures service interest, contact details, and next action."
      faqs={[
        { question: 'Is this only website design?', answer: 'No. The offer combines website structure with live chat, lead capture, CRM handoff, and follow-up automation.' },
        { question: 'Can it work with my existing website?', answer: 'Yes. In many cases InstantDesk can add live chat and lead capture to your current website without rebuilding everything.' },
        { question: 'Do I need a complex CRM?', answer: 'No. Launch plans can use Google Sheets as a simple CRM so your team can start quickly.' },
      ]}
      relatedLinks={[
        { label: 'Website chatbot', href: '/website-chatbot' },
        { label: 'Lead capture', href: '/lead-capture' },
        { label: 'Google Sheet CRM', href: '/google-sheets-crm-automation' },
      ]}
    />
  )
}
