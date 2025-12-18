import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSolanaAuth } from '../hooks/useSolanaAuth'
import { useWallet } from '@solana/wallet-adapter-react'
import { Login } from './Login'
// import { NavBar } from '../components/NavBar'
// import { Card } from '../components/Card'

export const RoleRedirect: React.FC = () => {
  const navigate = useNavigate()
  const { userData } = useSolanaAuth()
  const { publicKey } = useWallet()
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const isSessionValid =
    !!userData && !!publicKey && userData.publicKey === publicKey.toString()
  const isAdmin = isSessionValid && userData?.role === 'admin'

  // For authenticated users, redirect based on role
  React.useEffect(() => {
    if (!token) return

    if (!isSessionValid) return
    navigate({ to: isAdmin ? '/admin/multihopper' : '/my-assets' })
  }, [token, isSessionValid, isAdmin])

  // If no token at all, show Login immediately (avoid long loading)
  if (!token) {
    return <Login />
  }

  if (!isSessionValid) {
    return <Login />
  }

  return (
    <div className='min-h-screen flex items-center justify-center text-[var(--white-100)]'>
      Redirecting...
    </div>
  )
}
