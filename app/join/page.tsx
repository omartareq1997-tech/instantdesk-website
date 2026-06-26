import { createAdminClient } from '../lib/supabase-server'
import JoinFlow from './JoinFlow'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ token?: string }> }

export default async function JoinPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorPage title="Invalid link" message="This invite link is missing a token. Please ask your team administrator to resend the invite." />
  }

  const sb = createAdminClient()
  const { data: member, error } = await sb
    .from('team_members')
    .select('id, name, email, role, status, invited_by')
    .eq('invite_token', token)
    .maybeSingle()

  if (error) {
    console.error('[JoinPage] DB error:', error.message)
    return <ErrorPage title="Something went wrong" message="We couldn't look up your invite. Please try again or contact support." />
  }

  if (!member) {
    return <ErrorPage title="Invite not found" message="This invite link is invalid or has expired. Please ask your team administrator to send a new invite." />
  }

  if (member.status === 'active') {
    return <ErrorPage title="Already accepted" message="This invite has already been accepted. Sign in to access your dashboard." showLogin />
  }

  return (
    <JoinFlow
      token={token}
      memberName={member.name as string}
      memberEmail={member.email as string}
      memberRole={member.role as string}
      invitedBy={(member.invited_by as string | null) ?? 'your team'}
    />
  )
}

function ErrorPage({ title, message, showLogin = false }: { title: string; message: string; showLogin?: boolean }) {
  return (
    <div
      className="auth-premium-bg min-h-screen flex items-center justify-center px-4"
    >
      <div
        className="auth-premium-card w-full max-w-sm rounded-2xl px-8 py-10 flex flex-col items-center gap-4 text-center"
        style={{
          border:     '1px solid rgba(248,113,113,0.2)',
        }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }}
        >
          ✕
        </div>
        <h1 className="text-lg font-black text-white">{title}</h1>
        <p className="text-sm text-white/40 leading-relaxed">{message}</p>
        {showLogin && (
          <a
            href="/client-login"
            className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'rgba(244,122,99,0.15)',
              border:     '1px solid rgba(244,122,99,0.3)',
              color:      '#f8a36d',
            }}
          >
            Go to Login
          </a>
        )}
      </div>
    </div>
  )
}
