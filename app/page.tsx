import CtaSection from '@/components/landing/cta-section'
import FeaturesSection from '@/components/landing/features-section'
import HeroSection from '@/components/landing/hero-section'
import HowItWorksSection from '@/components/landing/how-it-works-section'
import WhoItsForSection from '@/components/landing/who-its-for-section'
import LandingLayout from '@/components/layout/landing-layout'

export default function HomePage() {
  return (
    <LandingLayout>
      <HeroSection />
      <HowItWorksSection />
      <WhoItsForSection />
      <FeaturesSection />
      <CtaSection />
    </LandingLayout>
  )
}
