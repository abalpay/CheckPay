import { Upload, BarChart3, CheckCircle, FileText, Shield, Clock } from "lucide-react";

export default function FeaturesSection() {
  const features = [
    {
      icon: Upload,
      title: "Secure Upload",
      description: "Upload payslips and AVAC forms with bank-level encryption. All documents are automatically deleted after analysis."
    },
    {
      icon: BarChart3,
      title: "AI-Powered Analysis",
      description: "Advanced document processing identifies overtime calculation errors and payment discrepancies with high accuracy."
    },
    {
      icon: CheckCircle,
      title: "Instant Verification",
      description: "Get detailed reports highlighting underpayments, overtime violations, and calculation errors in under 60 seconds."
    },
    {
      icon: FileText,
      title: "Healthcare Focused",
      description: "Built specifically for healthcare workers and AVAC overtime systems. Understands complex shift patterns and rates."
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your sensitive payroll data never leaves our secure processing environment. GDPR and HIPAA compliant processing."
    },
    {
      icon: Clock,
      title: "Save Time",
      description: "No more manual calculations or spreadsheets. Get professional-grade analysis that would take hours to do manually."
    }
  ];

  return (
    <section className="relative py-12 md:py-20 bg-gradient-to-b from-background to-slate-50 dark:to-slate-900/50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div className="mx-auto max-w-3xl pb-16 text-center md:pb-20">
          <h2
            className="text-3xl font-bold md:text-4xl mb-4"
            data-aos="fade-up"
          >
            Built for Healthcare Workers
          </h2>
          <p
            className="text-lg text-gray-600"
            data-aos="fade-up"
            data-aos-delay="150"
          >
            CheckPay helps healthcare professionals ensure they&apos;re paid correctly for their overtime work
          </p>
        </div>

        {/* Features grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div
                key={index}
                className="relative p-6 bg-white/50 backdrop-blur-sm rounded-lg border border-gray-200/50 hover:border-gray-300 transition-colors duration-200 group"
                data-aos="fade-up"
                data-aos-delay={200 + index * 100}
              >
                <div className="mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 group-hover:from-blue-500/30 group-hover:to-purple-500/30 transition-colors duration-200">
                    <IconComponent className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>

                <h3 className="mb-2 text-lg font-semibold">
                  {feature.title}
                </h3>

                <p className="text-gray-600 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-700"
            data-aos="fade-up"
            data-aos-delay="800"
          >
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Trusted by 1000+ healthcare workers</span>
          </div>
        </div>
      </div>
    </section>
  );
}