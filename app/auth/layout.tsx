import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in · CheckPay',
  description: 'Access your CheckPay dashboard and manage overtime analyses.',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
