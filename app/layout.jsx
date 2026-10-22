import './globals.css'
import { Syne, Inter, JetBrains_Mono } from 'next/font/google'

const display = Syne({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-display', display: 'swap' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['600'], variable: '--font-mono', display: 'swap' })

export const metadata = {
  title: 'Viral AI Clipper — Turn one video into ten clips that go viral',
  description: 'Paste a link. The AI finds the hooks, cuts the dead air, burns in captions and scores every clip for TikTok, Reels and Shorts.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
