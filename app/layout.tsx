import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solventis Bankers & Advisors | Investment Banking',
  description: 'Trusted investment banking advisory. Mergers & acquisitions, capital raising, IPO advisory, and financial restructuring for the middle market.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/icons/icon-180.png',
    shortcut: '/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Solventis',
  },
}

export const viewport: Viewport = {
  themeColor: '#1C1610',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Raleway:wght@200;300;400;500;600&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Solventis" />
      </head>
      <body>{children}</body>
    </html>
  )
}
