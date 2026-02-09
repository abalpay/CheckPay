import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  UploadCloud,
  Scale,
  ClipboardCheck,
  Stethoscope,
  Brain,
  Shield,
} from "lucide-react";

const workflowSteps = [
  {
    id: "01",
    title: "Upload QH docs",
    description: "Drag in your payslips and AVAC forms—no reformatting required.",
    icon: UploadCloud,
    accentIcon: "border-emerald-200 bg-emerald-50 text-emerald-600",
    accentTitle: "border-emerald-300",
  },
  {
    id: "02",
    title: "Auto-check against awards",
    description: "Award clauses and overtime rules are cross-referenced automatically.",
    icon: Scale,
    accentIcon: "border-sky-200 bg-sky-50 text-sky-600",
    accentTitle: "border-sky-300",
  },
  {
    id: "03",
    title: "Get clear next steps",
    description: "Receive a checklist to resolve potential underpayments confidently.",
    icon: ClipboardCheck,
    accentIcon: "border-violet-200 bg-violet-50 text-violet-600",
    accentTitle: "border-violet-300",
  },
];

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-20 bg-gradient-to-b from-[#f6f8ff] via-[#eff3ff] to-[#e8f1ff]"
        aria-hidden
      />
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(140%_95%_at_80%_10%,rgba(79,70,229,0.22),transparent_68%)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_110%_at_12%_35%,rgba(56,189,248,0.18),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1120px] px-6 pt-[7.5rem] pb-16 lg:pt-[9.5rem] lg:pb-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left" data-aos="fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              QH overtime assistant
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-slate-900 lg:text-5xl">
              Verify your QH overtime—accurately, in minutes.
            </h1>
            <p className="mt-4 max-w-[54ch] text-lg text-slate-600 lg:mx-0">
              Upload your payslips and AVAC forms. We cross-check against Queensland Health award rules and flag potential underpayments—privately and securely.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Button
                asChild
                size="lg"
                className="group min-w-[200px] bg-gradient-to-r from-blue-600 to-blue-500 text-base font-semibold text-white hover:from-blue-500 hover:to-blue-400"
              >
                <Link href="/check/new">
                  <span className="inline-flex items-center justify-center gap-2">
                    Start analysis
                    <span className="transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </Link>
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-slate-600 lg:justify-start">
              <div className="flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4 text-blue-600" />
                <span>Built for QH RMOs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-violet-600" />
                <span>AI-powered analysis</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span>Secure & private</span>
              </div>
            </div>
          </div>

          <div className="relative" data-aos="fade-left" data-aos-delay="150">
            <div className="rounded-xl border border-slate-200 bg-white/85 backdrop-blur-md p-7 shadow-lg">
              <div className="mb-5 flex items-baseline justify-between pt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-900">Workflow preview</span>
                <span className="text-xs uppercase tracking-[0.25em] text-slate-600">3 steps</span>
              </div>
              <ol aria-label="Workflow steps" className="space-y-4">
                {workflowSteps.map(({ id, title, description, icon: Icon, accentIcon, accentTitle }) => (
                  <li
                    key={id}
                    className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-lg border ${accentIcon}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-600">
                        Step {id}
                      </p>
                      <div className={`flex items-center gap-2 border-l-2 ${accentTitle} pl-4`}>
                        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                      </div>
                      <p className="text-sm text-slate-600">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
