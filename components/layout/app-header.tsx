'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Logo from './logo'
import { useHeaderAuth } from './use-header-auth'

export default function AppHeader() {
  const router = useRouter()
  const { user, displayName, avatarInitials, handleSignOut } = useHeaderAuth()

  return (
    <header className="fixed top-0 z-30 w-full bg-white/95 backdrop-blur-sm border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Site branding and App Navigation */}
          <div className="flex flex-1 items-center gap-6">
            <Logo />
            <nav className="hidden md:flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/check/new"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                New Analysis
              </Link>
            </nav>
          </div>

          {/* User profile menu */}
          <div className="flex items-center justify-end gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative h-10 w-10 rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage
                      src={
                        typeof user?.user_metadata?.avatar_url === 'string'
                          ? user.user_metadata.avatar_url
                          : undefined
                      }
                      alt={displayName}
                    />
                    <AvatarFallback className="text-sm font-semibold">{avatarInitials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/dashboard')}>
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/check/new')}>
                  New Analysis
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/account')}>
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    void handleSignOut()
                  }}
                  className="text-red-600 focus:text-red-600"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
