import CtaSection from '@/components/landing/cta-section'
import FaqSection from '@/components/landing/faq-section'
import { faqs } from '@/lib/faq-data'
import FeaturesSection from '@/components/landing/features-section'
import HeroSection from '@/components/landing/hero-section'
import HowItWorksSection from '@/components/landing/how-it-works-section'
import StatsSection from '@/components/landing/stats-section'
import WhoItsForSection from '@/components/landing/who-its-for-section'
import LandingLayout from '@/components/layout/landing-layout'

export default function HomePage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }

  return (
    <LandingLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HeroSection />
      <StatsSection />
      <HowItWorksSection />
      <WhoItsForSection />
      <FeaturesSection />
      <FaqSection />
      <CtaSection />
    </LandingLayout>
  )
}
