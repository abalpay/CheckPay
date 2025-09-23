'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'

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
          // Don't log AuthSessionMissingError as it's expected when user is signed out
          if (sessionError.name !== 'AuthSessionMissingError' && !sessionError.message.includes('Auth session missing')) {
            console.error('Failed to load user session', sessionError)
            toast.error('Unable to load your account. Please try again.')
          }
          setIsLoading(false)
          return
        }

        if (!fetchedUser) {
          setUser(null)
          setIsLoading(false)
          router.replace('/auth/sign-in?redirectTo=/dashboard/account')
          return
        }

        setUser(fetchedUser)

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', fetchedUser.id)
          .maybeSingle()

        if (!isMounted) return

        if (profileError) {
          console.error('Failed to load profile data', profileError)
          toast.error('We could not load your profile details. Please try again later.')
          setIsLoading(false)
          return
        }

        const loadedFullName = profileData?.full_name ?? ''
        form.reset({
          fullName: loadedFullName,
        })
        setInitialFullNameEmpty(!loadedFullName)
        setIsLoading(false)
      } catch (error) {
        if (!isMounted) return
        console.error('Unexpected error loading profile', error)
        toast.error('Something went wrong while loading your account.')
        setIsLoading(false)
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [form, router])

  const isSubmitting = form.formState.isSubmitting

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!user) {
        toast.error('You need to be signed in to update your profile.')
        return
      }

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: values.fullName })
          .eq('id', user.id)

        if (error) {
          console.error('Failed to update full name', error)
          toast.error('We could not save your name. Please try again.')
          return
        }

        toast.success('Your full name has been updated.')
        form.reset(values)
        router.refresh()
      } catch (error) {
        console.error('Unexpected error updating full name', error)
        toast.error('Something went wrong while saving. Please try again.')
      }
    },
    [form, user]
  )

  const handleSignOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Failed to sign out', error)
        toast.error('We could not sign you out. Please try again.')
        return
      }

      toast.success('Signed out successfully.')
      router.push('/auth/sign-in')
    } catch (error) {
      console.error('Unexpected error signing out', error)
      toast.error('Something went wrong. Please try again.')
    }
  }, [router])

  const disableActions = isLoading || isSubmitting

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>Update the information linked to your CheckPay profile.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
            <CardContent className="space-y-6">
              {initialFullNameEmpty && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Add your display name so it appears in the app header and reports.
                </div>
              )}
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your full name" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={handleSignOut}
                disabled={disableActions}
              >
                Sign Out
              </Button>
              <Button type="submit" disabled={disableActions}>
                {isSubmitting ? 'Saving...' : 'Save changes'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
