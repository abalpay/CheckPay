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
                How CheckPay Works
              </h2>
              <p
                className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto"
                data-aos="fade-up"
                data-aos-delay="150"
              >
                Get your overtime analysis in three simple steps
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
                    <CardTitle className="text-xl">1. Upload Documents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Securely upload your payslip and AVAC forms. Bank-level encryption protects your sensitive data.
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
                    <CardTitle className="text-xl">2. AI Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Our AI analyzes your documents to identify overtime calculation errors and payment discrepancies.
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
                    <CardTitle className="text-xl">3. Get Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600">
                      Receive a detailed report highlighting underpayments and calculation errors in under 60 seconds.
                    </CardDescription>
                  </CardContent>
                </Card>
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