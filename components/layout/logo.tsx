import Link from "next/link";
import { cn } from "@/lib/utils";

export default function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0057FF]">
        <span className="text-sm font-bold text-white">CP</span>
      </div>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight",
          inverted ? "text-[#FAFAF9]" : "text-[#1A1A1A]",
        )}
      >
        CheckPay
      </span>
    </Link>
  );
}
