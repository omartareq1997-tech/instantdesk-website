import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  return NextResponse.json({
    status: 'human_review',
    confidence: 0.42,
    extracted: {
      name: body.nameHint ?? null,
      documentNumber: null,
      expiryDate: null,
      dateOfBirth: null,
    },
    validationStatus: 'needs_review',
    notice: 'OCR service layer placeholder. Connect provider before processing real identity documents.',
  })
}
