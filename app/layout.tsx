import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solventis Bankers & Advisors | Investment Banking',
  description: 'Trusted investment banking advisory. Mergers & acquisitions, capital raising, IPO advisory, and financial restructuring for the middle market.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Raleway:wght@200;300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
