import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
} from "@tanstack/react-router";
import { Login } from "./pages/Login";
import App from "./pages/Multihop";
import { AuthHOC } from "./components/AuthHOC";

// Root route component
const RootComponent = () => {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
};

// Create root route
const rootRoute = createRootRoute({
  component: RootComponent,
});

// Login route - only accessible when not authenticated
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

// Multihopper route - requires authentication
const multihopperRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/multihopper",
  component: () => (
    <AuthHOC>
      <App />
    </AuthHOC>
  ),
});

// Index route - redirects based on auth status
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

// Create route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  multihopperRoute,
]);

// Create router
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

// Register router for maximum type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
