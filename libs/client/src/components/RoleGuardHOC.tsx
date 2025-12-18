import React, { useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'

type Role = 'user' | 'admin'
const roleRank: Record<Role, number> = { user: 1, admin: 2 }

export const RoleGuardHOC = ({
  requiredRole,
  children,
}: {
  requiredRole: Role
  children: React.ReactNode
}) => {
  const { userData } = useSolanaAuth()
  const { publicKey } = useWallet()
  const navigate = useNavigate()

  const isLoggedIn =
    !!userData && !!publicKey && userData.publicKey === publicKey.toString()
  const userRole = (userData?.role as Role) || 'user'

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoggedIn) {
      navigate({ to: '/login', replace: true })
    }
  }, [isLoggedIn, navigate])

  // Redirect if logged in but lacks required role
  useEffect(() => {
    if (isLoggedIn && roleRank[userRole] < roleRank[requiredRole]) {
      toast.error('Insufficient role. Redirecting...')
      navigate({ to: '/my-assets', replace: true })
    }
  }, [isLoggedIn, userRole, requiredRole, navigate])

  if (!isLoggedIn || roleRank[userRole] < roleRank[requiredRole]) {
    return null
  }

  return <>{children}</>
}
