import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy - CheckPay',
  description: 'CheckPay privacy policy and data handling practices.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to home
        </Link>

        <h1 className="mb-2 text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mb-10 text-sm text-gray-500">Last updated: February 2025</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">1. Data Collection</h2>
            <p>
              We process payslip and AVAC PDF documents you upload. We do not collect personal
              information, create user accounts, or use cookies for tracking.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">2. Data Processing</h2>
            <p>
              Your uploaded documents are sent to our analysis service for reconciliation. The
              analysis is performed in real-time and results are returned immediately.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">3. Data Storage</h2>
            <p>
              Analysis results are stored temporarily in your browser&apos;s memory only. Data is
              automatically cleared when you close or refresh the page. We do not persist any
              uploaded documents or analysis results on our servers.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">4. Third-Party Services</h2>
            <p>
              We do not share your data with third parties. No analytics, advertising, or tracking
              services are used.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">5. Your Rights</h2>
            <p>
              Since we do not store personal data persistently, there is no data to request, export,
              or delete. Your data exists only for the duration of your browser session.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">6. Contact</h2>
            <p>
              For questions about this policy, contact us at{' '}
              <a
                href="mailto:privacy@checkpay.com.au"
                className="text-blue-600 hover:underline"
              >
                privacy@checkpay.com.au
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
