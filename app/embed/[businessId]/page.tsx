export default async function EmbedChatPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  return (
    <main className="min-h-dvh bg-transparent">
      <div className="sr-only">InstantDesk website chat widget for {businessId}</div>
    </main>
  )
}
