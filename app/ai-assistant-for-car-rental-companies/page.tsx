import type { Metadata } from 'next'
import SeoServicePage from '../components/SeoServicePage'

export const metadata: Metadata = {
  title: 'AI Assistant for Car Rental Companies | InstantDesk',
  description: 'Operational AI assistant for car rental companies: availability checks, bookings, extensions, documents, pickup instructions, live chat, and human handover.',
}

export default function Page() {
  return (
    <SeoServicePage
      eyebrow="Car rental operations"
      title="AI Assistant for Car Rental Companies"
      description="Automate availability checks, bookings, extensions, document collection, pickup instructions, and WhatsApp customer support."
      problem="Rental teams lose time on repeated availability questions, unclear pickup instructions, document chasing, extension requests, and booking updates across website chat, WhatsApp, and live support."
      solution="InstantDesk combines AI receptionist, live chat, fleet availability logic, Google Sheet CRM, booking workflows, document review, pickup instructions, and human handover rules in one operational assistant."
      offerTitle="24/7 rental assistant for real booking work"
      offer={[
        'Checks fleet availability with cleaning and turnaround buffers',
        'Captures pickup and dropoff dates, locations, car class, transmission, seats, and budget',
        'Creates booking records and blocks unavailable periods',
        'Prepares confirmation PDFs and WhatsApp-ready messages',
        'Collects driver licenses, passports, and ID documents with OCR review placeholders',
        'Handles extension requests with same-car and alternative-car checks',
        'Sends airport terminal, parking zone, meeting point, and Google Maps pickup instructions',
        'Supports external website booking calendar API sync for imports, exports, and webhooks',
      ]}
      featureBullets={[
        '24/7 rental website chat and live chat handover',
        'Fleet availability checker',
        'Booking and extension workflow',
        'Confirmation PDF generation',
        'Driver document collection and OCR review layer',
        'Pickup/dropoff location instruction cards',
        'External booking calendar API connection fields',
        'Human handover for no availability, discounts, refunds, documents, angry customers, and low confidence',
      ]}
      howItWorks={[
        'Connect the rental knowledge base, fleet classes, cars, prices, deposits, locations, and handover rules.',
        'InstantDesk checks availability from internal bookings and optional external calendar data before offering cars.',
        'Confirmed bookings create records, block the calendar, prepare PDFs, and notify staff for follow-up or live handover.',
      ]}
      useCaseExample="A visitor asks if an automatic compact car is available from Krakow Airport tomorrow. InstantDesk checks booking logs with a 2-hour buffer, offers exact matches first, captures contact details, prepares the confirmation, and hands over if no suitable option exists."
      useCases={[
        'Website visitors ask for car availability outside office hours.',
        'Customers request booking extensions and need a fast price update.',
        'Travelers need airport pickup instructions, terminal guidance, or Google Maps pins.',
        'Staff need documents collected before pickup without manual chasing.',
        'Existing website calendar bookings need to be considered before the AI offers a car.',
      ]}
      faqs={[
        { question: 'Can InstantDesk check real fleet availability?', answer: 'Yes. The rental module is designed to check internal bookings first, apply configurable cleaning buffers, and optionally consider an external booking calendar integration.' },
        { question: 'Can customers upload licenses or passports?', answer: 'Yes. The document collection flow includes a consent notice, secure document records, and an OCR service layer placeholder for extracting document details before human review.' },
        { question: 'What happens when no car is available?', answer: 'The assistant offers same-class alternatives first, then nearest-class alternatives. If there is still no good option, it triggers human handover.' },
        { question: 'Can this push bookings to our existing website system?', answer: 'The module includes provider name, API URL, API token, sync direction, webhook URL, sync status, and manual sync controls so custom integrations can be added cleanly.' },
      ]}
      relatedLinks={[
        { label: 'Live chat for small businesses', href: '/live-chat-for-small-businesses' },
        { label: 'Human handover', href: '/human-handover-live-chat' },
        { label: 'Lead capture', href: '/lead-capture' },
        { label: 'Google Sheet CRM', href: '/google-sheets-crm-automation' },
        { label: 'SMS follow-up automation', href: '/sms-follow-up-automation' },
      ]}
    />
  )
}
