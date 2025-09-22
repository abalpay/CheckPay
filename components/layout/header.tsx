import Link from "next/link";
import { Button } from "@/components/ui/button";
import Logo from "./logo";

export default function Header() {
  return (
    <header className="fixed top-2 z-30 w-full md:top-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative flex h-14 items-center justify-between gap-3 rounded-2xl bg-white/90 px-3 shadow-lg shadow-black/[0.03] backdrop-blur-sm border border-gray-200/50">
          {/* Site branding */}
          <div className="flex flex-1 items-center">
            <Logo />
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="#how-it-works"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              How it Works
            </Link>
            <Link
              href="#features"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Features
            </Link>
          </nav>

          {/* Action buttons */}
          <div className="flex flex-1 items-center justify-end gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/sign-in">
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm" className="bg-gray-800 text-gray-200 shadow-sm hover:bg-gray-900">
              <Link href="/dashboard">
                Launch dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
