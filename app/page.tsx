import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SignInButton from '@/components/SignInButton'

export default async function LandingPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-8 max-w-sm mx-auto px-6">

        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-sky-600 flex items-center justify-center shadow-lg">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 6C13.16 6 6 13.16 6 22s7.16 16 16 16 16-7.16 16-16S30.84 6 22 6z"
                fill="white" fillOpacity="0.15"/>
              <path d="M10 22C10 22 13 15 22 15s12 7 12 7-3 7-12 7-12-7-12-7z"
                fill="white"/>
              <circle cx="22" cy="22" r="3.5" fill="#0ea5e9"/>
              <path d="M6 22 Q10 13 22 13 Q34 13 38 22"
                stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">JawSense</h1>
          <p className="mt-2 text-gray-500 text-sm">Sleep &amp; Clenching Analytics</p>
        </div>

        <SignInButton />

        <p className="text-xs text-gray-400">
          By signing in you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  )
}
