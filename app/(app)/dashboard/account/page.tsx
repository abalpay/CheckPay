import { redirect } from 'next/navigation'

export default function LegacyAccountRedirect() {
  redirect('/account')
}
