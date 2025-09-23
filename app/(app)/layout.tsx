import AppHeader from '@/components/layout/app-header'
import { Toaster } from '@/components/ui/sonner'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-gray-50">
      <AppHeader />
      <main className="grow pt-20">{children}</main>
      <Toaster position="top-right" richColors closeButton />
    </div>
  )
}
