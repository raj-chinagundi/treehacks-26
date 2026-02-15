import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      id: 'mock',
      name: 'Demo Account',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'demo@sleepsense.ai' },
        name: { label: 'Name', type: 'text', placeholder: 'Demo User' },
      },
      async authorize(credentials) {
        const email = credentials?.email || 'demo@sleepsense.ai'
        const name = credentials?.name || 'Demo User'
        return {
          id: Buffer.from(email).toString('base64').slice(0, 16),
          email,
          name,
          image: null,
        }
      },
    }),
  ],
  pages: { signIn: '/' },
  session: { strategy: 'jwt' },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'sleepsense-dev-secret-change-in-production',
}
