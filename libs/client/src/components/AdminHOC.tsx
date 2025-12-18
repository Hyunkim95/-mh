import React, { useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { useWallet } from '@solana/wallet-adapter-react'
import toast from 'react-hot-toast'

export const AdminHOC = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate()
  const { userData } = useSolanaAuth()
  const { publicKey } = useWallet()

  const isLoggedIn =
    useMemo(() => !!userData && !!publicKey && userData.publicKey === publicKey.toString(), [userData, publicKey])
  const isAdmin = useMemo(() => userData?.role === 'admin', [userData]) 

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) {
      toast.error('Unauthorized; the user is not an administrator. Redirecting...')      
      setTimeout(() => {
        navigate({ to: '/' })
      }, 1200)
    }
  }, [isLoggedIn, isAdmin, navigate])

  return <>{children}</>
}