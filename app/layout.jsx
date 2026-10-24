import './globals.css'
import PwaInstall from '../components/PwaInstall'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Syne, Inter, JetBrains_Mono } from 'next/font/google'

const display = Syne({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-display', display: 'swap' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['600'], variable: '--font-mono', display: 'swap' })

const SITE = 'https://viralaiclipper.com'
const TITLE = 'Viral AI Clipper — Turn one video into up to 8 viral-ready clips'
const DESC = 'Paste a link. The AI finds the hooks, cuts the dead air, burns in captions and scores every clip for TikTok, Reels and Shorts.'

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: '%s · Viral AI Clipper' },
  description: DESC,
  applicationName: 'Viral AI Clipper',
  keywords: ['AI video clipper', 'YouTube to Shorts', 'TikTok clips', 'Reels', 'auto captions', 'viral clips'],
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: SITE, siteName: 'Viral AI Clipper', title: TITLE, description: DESC },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, title: 'AI Clipper', statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-touch-icon.png' },
  other: { 'mobile-web-app-capable': 'yes' },
}

export const viewport = {
  themeColor: '#0A0A0F',
  colorScheme: 'dark',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}<PwaInstall /><Analytics /><SpeedInsights /></body>
    </html>
  )
}
