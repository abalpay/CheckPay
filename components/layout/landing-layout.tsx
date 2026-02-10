import LandingHeader from './landing-header'
import Footer from './footer'

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--cp-bg-primary)] text-[var(--cp-text-primary)]">
      <LandingHeader />
      <main className="grow">{children}</main>
      <Footer border={false} />
    </div>
  )
}
