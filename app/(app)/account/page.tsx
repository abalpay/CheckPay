'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-client'
import type { Database } from '@/lib/database.types'
import { isSubscriptionActive } from '@/lib/subscription'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type ProfileSelection = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'full_name' | 'stripe_subscription_status'
>

const supabase = createClient()

const formSchema = z.object({
  fullName: z
    .string()
    .min(1, 'Please enter your full name')
    .max(120, 'Full name must be 120 characters or fewer'),
})

type FormValues = z.infer<typeof formSchema>

export default function AccountPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [initialFullNameEmpty, setInitialFullNameEmpty] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
    },
  })

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        setIsLoading(true)

        const {
          data: { user: fetchedUser },
          error: sessionError,
        } = await supabase.auth.getUser()

        if (!isMounted) return

        if (sessionError) {
          if (
            sessionError.name !== 'AuthSessionMissingError' &&
            !sessionError.message.includes('Auth session missing')
          ) {
            console.error('Failed to load user session', sessionError)
            toast.error('Unable to load your account. Please try again.')
          }
          setUser(null)
          setSubscriptionStatus(null)
          setIsLoading(false)
          return
        }

        if (!fetchedUser) {
          setUser(null)
          setSubscriptionStatus(null)
          setIsLoading(false)
          router.replace('/auth/sign-in?redirectTo=/account')
          return
        }

        setUser(fetchedUser)

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, stripe_subscription_status')
          .eq('id', fetchedUser.id)
          .maybeSingle<ProfileSelection>()

        if (!isMounted) return

        if (profileError) {
          console.error('Failed to load profile data', profileError)
          toast.error('We could not load your profile details. Please try again later.')
          setSubscriptionStatus(null)
          setIsLoading(false)
          return
        }

        const loadedFullName = profileData?.full_name ?? ''
        form.reset({
          fullName: loadedFullName,
        })
        setInitialFullNameEmpty(!loadedFullName)
        setSubscriptionStatus(profileData?.stripe_subscription_status ?? null)
        setIsLoading(false)
      } catch (error) {
        if (!isMounted) return
        console.error('Unexpected error loading profile', error)
        toast.error('Something went wrong while loading your account.')
        setUser(null)
        setSubscriptionStatus(null)
        setIsLoading(false)
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [form, router])

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!user) {
        toast.error('You must be signed in to update your profile.')
        return
      }

      try {
        const payload: ProfileUpdate = {
          full_name: values.fullName.trim(),
        }

        const { error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', user.id)

        if (error) {
          throw error
        }

        toast.success('Profile updated successfully')
        setInitialFullNameEmpty(false)
      } catch (error) {
        console.error('Failed to update profile', error)
        toast.error('Unable to update profile. Please try again later.')
      }
    },
    [user]
  )

  const subscriptionBadge = useMemo(() => {
    if (!subscriptionStatus) {
      return (
        <Badge variant="outline" className="border-amber-300 text-amber-800">
          Subscription inactive
        </Badge>
      )
    }

    if (isSubscriptionActive(subscriptionStatus)) {
      return (
        <Badge variant="outline" className="border-emerald-300 text-emerald-800">
          Subscription {subscriptionStatus.replace(/_/g, ' ')}
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="border-amber-300 text-amber-800">
        Subscription {subscriptionStatus.replace(/_/g, ' ')}
      </Badge>
    )
  }, [subscriptionStatus])

  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Account settings</h1>
          <p className="text-muted-foreground">
            Update how your details appear across CheckPay and manage billing when needed.
          </p>
        </div>
        {subscriptionBadge}
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>Personalise how your name appears across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Alex Taylor" autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-4">
                <Button type="submit" disabled={isLoading || form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving
                    </span>
                  ) : (
                    'Save changes'
                  )}
                </Button>
                {initialFullNameEmpty && (
                  <p className="text-sm text-muted-foreground">
                    Add your name so we can personalise your dashboard.
                  </p>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Need to update payment details or invoices?</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/account/billing')}
            className="w-fit"
          >
            Go to billing
          </Button>
        </CardFooter>
      </Card>

      {!isSubscriptionActive(subscriptionStatus) && (
        <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p>Looks like you don’t have an active CheckPay subscription yet.</p>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => router.push('/pricing')}
            >
              Choose a plan
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
