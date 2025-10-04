import { redirect } from 'next/navigation'

export default function LegacyBillingRedirect() {
  redirect('/account/billing')
}
