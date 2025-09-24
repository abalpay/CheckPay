import { Upload, BrainCircuit, CheckCircle, FileText, Shield, ClipboardCheck } from "lucide-react";

export default function FeaturesSection() {
  const features = [
    {
      icon: FileText,
      title: "Expertly Tailored for Queensland Health",
      description: "Purpose-built to interpret QH payslips and AVAC forms, delivering accuracy generic payroll tools miss."
    },
    {
      icon: BrainCircuit,
      title: "AVAC Form Intelligence",
      description: "Automatically links every AVAC code to the correct shift allowances and penalty rates for your pay period."
    },
    {
      icon: CheckCircle,
      title: "Award Compliance Engine",
      description: "Cross-references your overtime against the latest Queensland Health awards and enterprise agreements."
    },
    {
      icon: Upload,
      title: "Secure Upload & Auto-Delete",
      description: "Encrypted uploads keep your files safe and every document is automatically removed after analysis."
    },
    {
      icon: Shield,
      title: "Confidential by Design",
      description: "Data stays in Australia within our secure environment—only you can see the results."
    },
    {
      icon: ClipboardCheck,
      title: "Actionable Next Steps",
      description: "Clear summaries highlight potential underpayments, discrepancies, and the evidence you can share."
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
            Built for Queensland Health Teams
          </h2>
          <p
            className="text-lg text-gray-600"
            data-aos="fade-up"
            data-aos-delay="150"
          >
            Every feature is designed to give Queensland Health employees clarity on overtime, allowances, and AVAC claims.
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
            <span className="text-sm font-medium">Trusted by Queensland Health colleagues</span>
          </div>
        </div>
      </div>
    </section>
  );
}
