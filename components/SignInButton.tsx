'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function SignInButton() {
  const [showMock, setShowMock] = useState(false)
  const [email, setEmail]       = useState('demo@jawsense.ai')
  const [name, setName]         = useState('Demo User')
  const [loading, setLoading]   = useState(false)

  async function handleGoogle() {
    setLoading(true)
    await signIn('google', { callbackUrl: '/dashboard' })
    setLoading(false)
  }

  async function handleMock() {
    setLoading(true)
    await signIn('mock', { email, name, callbackUrl: '/dashboard' })
    setLoading(false)
  }

  if (showMock) {
    return (
      <div className="space-y-3">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Display Name"
          className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <button onClick={handleMock} disabled={loading}
          className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium text-sm hover:bg-sky-700 disabled:opacity-50 transition-colors">
          {loading ? 'Signing in…' : 'Continue as Demo User'}
        </button>
        <button onClick={() => setShowMock(false)}
          className="w-full py-2 text-gray-400 text-sm hover:text-gray-600">
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button onClick={handleGoogle} disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-lg bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm">
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18Z"/>
          <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17Z"/>
          <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18Z"/>
          <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3Z"/>
        </svg>
        {loading ? 'Signing in…' : 'Sign in with Google'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-400">or</span>
        </div>
      </div>

      <button onClick={() => setShowMock(true)}
        className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
        Use demo account (no OAuth required)
      </button>
    </div>
  )
}
