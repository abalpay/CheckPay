import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
        <span className="text-sm font-bold text-white">CP</span>
      </div>
      <span className="text-lg font-bold text-gray-900">CheckPay</span>
    </Link>
  );
}