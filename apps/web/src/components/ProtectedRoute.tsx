import React, { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  requiredRole?: 'user' | 'admin';
}

export function ProtectedRoute({ 
  children, 
  fallback = <div>Please connect your wallet to access this page.</div>,
  requiredRole = 'user'
}: ProtectedRouteProps) {
  const { state } = useAuth();
  const { isAuthenticated, isLoading, user } = state;

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  // Show fallback if not authenticated
  if (!isAuthenticated || !user) {
    return <>{fallback}</>;
  }

  // Check role requirements
  if (requiredRole === 'admin' && user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Convenience component for admin-only routes
export function AdminRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedRoute requiredRole="admin" fallback={fallback}>
      {children}
    </ProtectedRoute>
  );
}

// Higher-order component version
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options?: { requiredRole?: 'user' | 'admin'; fallback?: ReactNode }
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute requiredRole={options?.requiredRole} fallback={options?.fallback}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}