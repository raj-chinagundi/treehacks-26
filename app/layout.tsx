import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'JawSense – Sleep & Clenching Analytics',
  description: 'Monitor and analyze sleep bruxism and stress-related jaw clenching',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0e1a] text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
