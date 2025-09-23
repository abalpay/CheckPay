import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText, BarChart3 } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="pb-12 pt-32 md:pb-20 md:pt-40">
          <div className="pb-12 text-center md:pb-16">
            {/* Trust indicators */}
            <div
              className="mb-8 border-y border-gray-200/50 py-4"
              data-aos="zoom-y-out"
            >
              <div className="-mx-0.5 flex justify-center items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Secure Document Processing</span>
                </div>
                <div className="hidden sm:block">•</div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span>Healthcare Focused</span>
                </div>
                <div className="hidden sm:block">•</div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-purple-500" />
                  <span>Instant Analysis</span>
                </div>
              </div>
            </div>

            {/* Main heading */}
            <h1
              className="mb-6 text-5xl font-bold tracking-tight border-y border-gray-200/50 py-8 md:text-6xl"
              data-aos="zoom-y-out"
              data-aos-delay="150"
            >
              Verify Your Healthcare
              <br className="max-lg:hidden" />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Overtime Pay
              </span>
            </h1>

            {/* Subtitle */}
            <div className="mx-auto max-w-3xl">
              <p
                className="mb-8 text-lg text-gray-700"
                data-aos="zoom-y-out"
                data-aos-delay="300"
              >
                Upload your payslips and AVAC forms to automatically detect overtime payment discrepancies.
                Get detailed analysis in minutes, not hours.
              </p>

              {/* CTA Buttons */}
              <div className="relative before:absolute before:inset-0 before:border-y before:border-gray-200/50">
                <div
                  className="mx-auto max-w-xs sm:flex sm:max-w-none sm:justify-center gap-4"
                  data-aos="zoom-y-out"
                  data-aos-delay="450"
                >
                  <Button asChild size="lg" className="w-full sm:w-auto mb-4 sm:mb-0 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg">
                    <Link href="/auth/sign-in">
                      <span className="relative inline-flex items-center">
                        Check Your Pay
                        <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                          →
                        </span>
                      </span>
                    </Link>
                  </Button>

                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto border-gray-300 hover:bg-gray-50">
                    <Link href="#how-it-works">
                      Learn More
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Demo/Preview Section */}
          <div
            className="mx-auto max-w-4xl"
            data-aos="zoom-y-out"
            data-aos-delay="600"
          >
            <div className="relative aspect-video rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl border border-gray-200/20">
              <div className="relative mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                </div>
                <span className="text-sm font-medium text-white/80">
                  CheckPay Analysis Dashboard
                </span>
              </div>

              <div className="space-y-4 font-mono text-sm">
                <div className="text-green-400">
                  ✓ Payslip uploaded and processed
                </div>
                <div className="text-green-400">
                  ✓ AVAC forms analyzed
                </div>
                <div className="text-blue-400">
                  → Detecting overtime discrepancies...
                </div>
                <div className="text-yellow-400">
                  ⚠ Found potential underpayment: $247.50
                </div>
                <div className="text-white/60">
                  📊 Generating detailed report...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
