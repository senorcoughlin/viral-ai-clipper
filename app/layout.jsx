import './globals.css'

export const metadata = {
  title: 'Viral AI Clipper — Turn Long Videos into Viral Shorts',
  description: 'AI-powered batch clip generation for TikTok, Reels, and Shorts. Create high-virality content in seconds.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
