'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase-client'

type Profile = {
  full_name: string | null
}

const supabase = createClient()

export function useHeaderAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadUserAndProfile = async () => {
      try {
        const {
          data: { user: fetchedUser },
          error,
        } = await supabase.auth.getUser()

        if (!isMounted) return

        if (error) {
          if (error.name !== 'AuthSessionMissingError' && !error.message.includes('Auth session missing')) {
            console.error('Error fetching user session', error)
          }
          setUser(null)
          setProfile(null)
          return
        }

        setUser(fetchedUser)

        if (!fetchedUser) {
          setProfile(null)
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', fetchedUser.id)
          .maybeSingle()

        if (!isMounted) return

        if (profileError) {
          console.error('Error fetching profile data', profileError)
          setProfile(null)
          return
        }

        setProfile(profileData ?? null)
      } catch (err) {
        if (!isMounted) return
        console.error('Unexpected error loading user information', err)
        setUser(null)
        setProfile(null)
      }
    }

    void loadUserAndProfile()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUserAndProfile()
    })

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Error signing out', error)
      return
    }

    setUser(null)
    setProfile(null)
    router.push('/auth/sign-in')
  }, [router])

  const displayName = useMemo(() => {
    const fullName = profile?.full_name?.trim()
    if (fullName) return fullName
    return user?.email ?? 'Account'
  }, [profile?.full_name, user?.email])

  const avatarInitials = useMemo(() => {
    if (!displayName) return '?'

    const parts = displayName
      .split(/\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean)

    if (parts.length === 0) {
      return '?'
    }

    if (parts.length === 1) {
      return parts[0]!.charAt(0).toUpperCase() || '?'
    }

    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
  }, [displayName])

  return {
    user,
    profile,
    displayName,
    avatarInitials,
    isAuthenticated: Boolean(user),
    handleSignOut,
  }
}
