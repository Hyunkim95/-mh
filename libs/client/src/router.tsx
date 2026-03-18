import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { Login } from './pages/Login'
import { AdminMultihop } from './pages/AdminMultihop'
import { TokenConfigDetail } from './pages/TokenConfigDetail'
import { AuthHOC } from './components/AuthHOC'
import { RoleGuardHOC } from './components/RoleGuardHOC'
import { MyAssets } from './pages/MyAssets'
import { ConfigureHops } from './pages/ConfigureHops'
import { LandingPage } from './pages/LandingPage'
import { History } from './pages/History'

// Root route component
const RootComponent = () => {
  return (
    <div className='min-h-screen'>
      <Outlet />
    </div>
  )
}

const NotFoundComponent = () => {
  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-[#16181A] text-white'>
      <h1 className='text-6xl font-bold mb-4'>404</h1>
      <p className='text-lg text-gray-400 mb-8'>Page not found</p>
      <a href='/' className='text-blue-400 hover:text-blue-300 underline'>
        Back to home
      </a>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
})

// Admin Multihopper route - admin only
const adminMultihopperRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/multihopper',
  component: () => (
    <AuthHOC>
      <RoleGuardHOC requiredRole='admin'>
        <AdminMultihop />
      </RoleGuardHOC>
    </AuthHOC>
  ),
})

// Token config detail route - requires authentication
const tokenConfigDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/token-config/$tokenConfigId',
  component: () => (
    <AuthHOC>
      <TokenConfigDetail />
    </AuthHOC>
  ),
})

// Index route - shows landing page for all users
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
})

const myAssetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-assets',
  component: () => (
    <AuthHOC>
      <MyAssets />
    </AuthHOC>
  ),
})

const configureHopsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configure-hops',
  component: () => (
    <AuthHOC>
      <ConfigureHops />
    </AuthHOC>
  ),
})

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: () => (
    <AuthHOC>
      <History />
    </AuthHOC>
  ),
})

// Create route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  adminMultihopperRoute,
  tokenConfigDetailRoute,
  myAssetsRoute,
  configureHopsRoute,
  historyRoute,
])

// Create router
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})
