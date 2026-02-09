import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function CtaSection() {
  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-center shadow-2xl"
          data-aos="zoom-y-out"
        >
          {/* Background glow effect */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"
            aria-hidden="true"
          >
            <div className="h-56 w-[480px] rounded-full border-[20px] border-blue-500/30 blur-3xl" />
          </div>

          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgb(255,255,255,0.15) 1px, transparent 0)`,
              backgroundSize: '20px 20px'
            }}
          />

          <div className="relative px-6 py-12 md:px-12 md:py-20">
            <h2 className="mb-6 text-3xl font-bold text-white md:mb-8 md:text-4xl border-y border-white/20 py-6">
              Don&apos;t Leave Your Hard-Earned Pay to Chance
            </h2>

            <p className="mb-8 text-lg text-white/80 max-w-2xl mx-auto">
              Queensland Health staff have lost thousands to payroll mistakes. A quick, confidential check shows you exactly where you stand.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-white/90 shadow-lg group min-w-[200px]">
                <Link href="/check/new">
                  <span className="relative inline-flex items-center">
                    Get Your QH Analysis
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </Button>

              <div className="text-white/60 text-sm">
                Free to start · Results in under a minute
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
