import './globals.css'
import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import localFont from 'next/font/local'

const isProduction = process.env.NODE_ENV === 'production'

const generalSans = localFont({
  src: [
    { path: './fonts/general-sans-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/general-sans-medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/general-sans-semibold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/general-sans-bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-general-sans',
  display: 'swap',
})

const dmSerif = localFont({
  src: [{ path: './fonts/dm-serif-display-regular.woff2', weight: '400', style: 'normal' }],
  variable: '--font-dm-serif',
  display: 'swap',
})

const jetbrainsMono = localFont({
  src: [
    { path: './fonts/jetbrains-mono-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/jetbrains-mono-medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://checkpay.ai'),
  title: {
    default: 'Queensland Health Overtime Verification — Free & Confidential | CheckPay',
    template: '%s | CheckPay',
  },
  description:
    'Upload your QH payslips and AVAC forms to instantly verify overtime payments against award rules. Free, confidential, and results in under 60 seconds.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'CheckPay — Free QH Overtime Verification for Doctors',
    description:
      'Upload payslips and AVAC forms to verify Queensland Health overtime payments against award rules. Confidential results in under 60 seconds.',
    url: 'https://checkpay.ai',
    siteName: 'CheckPay',
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CheckPay — Free QH Overtime Verification for Doctors',
    description:
      'Upload payslips and AVAC forms to verify Queensland Health overtime payments against award rules. Confidential results in under 60 seconds.',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  name: 'CheckPay',
                  url: 'https://checkpay.ai',
                  description:
                    'Free overtime verification tool for Queensland Health medical officers.',
                },
                {
                  '@type': 'WebApplication',
                  name: 'CheckPay',
                  url: 'https://checkpay.ai/check/new',
                  applicationCategory: 'FinanceApplication',
                  operatingSystem: 'Any',
                  offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'AUD',
                  },
                  description:
                    'Upload QH payslips and AVAC forms to verify overtime payments against award rules in under 60 seconds.',
                },
              ],
            }),
          }}
        />
      </head>
      <body
        className={`${generalSans.className} ${generalSans.variable} ${dmSerif.variable} ${jetbrainsMono.variable} bg-gray-50 text-gray-900 antialiased`}
      >
        {children}
        {isProduction ? <SpeedInsights /> : null}
        {isProduction ? <Analytics /> : null}
      </body>
    </html>
  )
}
