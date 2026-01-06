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

const rootRoute = createRootRoute({
  component: RootComponent,
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
