import LandingLayout from '@/components/layout/landing-layout'
import HeroSection from '@/components/landing/hero-section'
import FeaturesSection from '@/components/landing/features-section'
import CtaSection from '@/components/landing/cta-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Upload, BarChart3 } from 'lucide-react'

export default function HomePage() {
  return (
    <LandingLayout>
      <HeroSection />

      {/* How it Works Section */}
      <section id="how-it-works" className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="mb-12">
              <h2
                className="text-3xl font-bold text-center mb-4"
                data-aos="fade-up"
              >
                How CheckPay Works for QH Staff
              </h2>
              <p
                className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto"
                data-aos="fade-up"
                data-aos-delay="150"
              >
                Verify your Queensland Health overtime in three focused steps.
              </p>
              <div className="grid md:grid-cols-3 gap-8">
                <Card
                  className="text-center border-gray-200/50 hover:border-gray-300 transition-colors"
                  data-aos="fade-up"
                  data-aos-delay="200"
                >
                  <CardHeader>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
                      <Upload className="h-8 w-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-xl">1. Upload Your QH Documents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Add your latest Queensland Health payslip and matching AVAC forms—everything is encrypted and auto-deletes after analysis.
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card
                  className="text-center border-gray-200/50 hover:border-gray-300 transition-colors"
                  data-aos="fade-up"
                  data-aos-delay="300"
                >
                  <CardHeader>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10">
                      <BarChart3 className="h-8 w-8 text-purple-600" />
                    </div>
                    <CardTitle className="text-xl">2. Smart Rules Engine</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Our rules engine checks every allowance and overtime rule against the latest Queensland Health awards to spot discrepancies.
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card
                  className="text-center border-gray-200/50 hover:border-gray-300 transition-colors"
                  data-aos="fade-up"
                  data-aos-delay="400"
                >
                  <CardHeader>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <CardTitle className="text-xl">3. Get Your Clear Report</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Receive an actionable report in under a minute showing potential underpayments and what to review next.
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why it matters section */}
      <section className="py-12 md:py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2
              className="text-3xl font-bold mb-6"
              data-aos="fade-up"
            >
              Why This Matters for Queensland Health Staff
            </h2>
            <p
              className="text-lg text-gray-700 mb-8"
              data-aos="fade-up"
              data-aos-delay="150"
            >
              Complex shift penalties, allowances, and AVAC processes make manual checks almost impossible. Queensland Health payroll issues have impacted thousands of employees, leading to both underpayments and overpayments.
            </p>
            <div
              className="grid gap-6 md:grid-cols-3"
              data-aos="fade-up"
              data-aos-delay="300"
            >
              <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200/60">
                <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">Common Risk</p>
                <p className="text-gray-700">
                  Healthcare is one of Australia&apos;s highest risk sectors for payroll errors due to complex awards.
                </p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200/60">
                <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">QH Reality</p>
                <p className="text-gray-700">
                  Historical payroll reviews uncovered widespread miscalculations across Queensland Health teams.
                </p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200/60">
                <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">Why Automate</p>
                <p className="text-gray-700">
                  CheckPay cross-checks every AVAC claim automatically, so you get clarity without spreadsheets.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div id="features">
        <FeaturesSection />
      </div>
      <CtaSection />
    </LandingLayout>
  )
}
