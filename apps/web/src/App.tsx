import { AuthButton, AuthStatus } from './components/AuthButton'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import { AdminOnly, UserOrAdmin, usePermissions } from './components/RoleGuard'
import { useAuth, useUser } from './hooks/useAuth'
import { useHealthQuery } from './hooks/useAuthQueries'
import './App.css'

// Protected component example
function UserDashboard() {
  const user = useUser()
  const healthQuery = useHealthQuery()
  
  return (
    <div className="p-6 bg-blue-50 rounded-lg">
      <h2 className="text-xl font-bold mb-4">User Dashboard</h2>
      <p className="mb-2">Welcome, {user?.publicKey?.slice(0, 8)}...!</p>
      <p className="mb-4">Role: {user?.role}</p>
      
      <div className="text-sm">
        <p>API Health: {healthQuery.isLoading ? 'Checking...' : healthQuery.data?.data?.status || 'Unknown'}</p>
      </div>
    </div>
  )
}

// Admin-only component example
function AdminPanel() {
  return (
    <div className="p-6 bg-red-50 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Admin Panel</h2>
      <p>This is only visible to admins!</p>
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Admin Actions:</h3>
        <ul className="list-disc pl-5">
          <li>Manage users</li>
          <li>View system logs</li>
          <li>Configure settings</li>
        </ul>
      </div>
    </div>
  )
}

// Role-based content examples
function RoleBasedContent() {
  const { isAdmin, isUser } = usePermissions()
  
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Role-Based Content</h2>
      
      <UserOrAdmin>
        <div className="p-4 bg-green-50 rounded">
          <p>This content is visible to all authenticated users.</p>
        </div>
      </UserOrAdmin>
      
      <AdminOnly fallback={
        <div className="p-4 bg-gray-50 rounded">
          <p>Admin content not available - you need admin role.</p>
        </div>
      }>
        <div className="p-4 bg-purple-50 rounded">
          <p>This content is only visible to admins.</p>
        </div>
      </AdminOnly>
      
      <div className="text-sm text-gray-600">
        <p>Your permissions: Admin: {isAdmin() ? 'Yes' : 'No'}, User: {isUser() ? 'Yes' : 'No'}</p>
      </div>
    </div>
  )
}

function App() {
  const { state } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <header className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Solana Authentication Demo
            </h1>
            <AuthStatus />
          </div>
          
          <div className="flex justify-center">
            <AuthButton 
              onSuccess={() => console.log('Authentication successful!')}
              onError={(error) => console.error('Authentication failed:', error)}
            />
          </div>
          
          {state.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              <p>Error: {state.error}</p>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="space-y-8">
          {/* Public content */}
          <section className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold mb-4">Public Content</h2>
            <p className="text-gray-600 mb-4">
              This content is always visible, regardless of authentication status.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2">Features:</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Solana wallet integration</li>
                  <li>Challenge-response authentication</li>
                  <li>Role-based access control</li>
                  <li>Automatic token refresh</li>
                  <li>Protected routes</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Supported Wallets:</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Phantom</li>
                  <li>Solflare</li>
                  <li>Torus</li>
                  <li>Hardware wallets (Ledger)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Protected content */}
          <ProtectedRoute fallback={
            <section className="bg-white rounded-lg shadow-sm p-6 text-center">
              <h2 className="text-xl font-bold mb-4">Protected Content</h2>
              <p className="text-gray-600">
                Connect your wallet and sign a message to access protected features.
              </p>
            </section>
          }>
            <section className="space-y-6">
              <UserDashboard />
              <RoleBasedContent />
            </section>
          </ProtectedRoute>

          {/* Admin-only section */}
          <AdminRoute fallback={
            <section className="bg-white rounded-lg shadow-sm p-6 text-center">
              <h2 className="text-xl font-bold mb-4">Admin Section</h2>
              <p className="text-gray-600">
                This section requires admin privileges.
              </p>
            </section>
          }>
            <AdminPanel />
          </AdminRoute>
        </main>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>Built with React, tRPC, and Solana Web3.js</p>
        </footer>
      </div>
    </div>
  )
}

export default App
