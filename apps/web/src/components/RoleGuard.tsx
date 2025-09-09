import { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: ('user' | 'admin')[];
  fallback?: ReactNode;
  requireAuth?: boolean;
}

export function RoleGuard({
  children, 
  allowedRoles, 
  fallback = null,
  requireAuth = true 
}: RoleGuardProps) {
  const { state } = useAuth();
  const { isAuthenticated, user } = state;

  // If authentication is required but user is not authenticated
  if (requireAuth && !isAuthenticated) {
    return <>{fallback}</>;
  }

  // If user is authenticated, check role permissions
  if (isAuthenticated && user) {
    const hasPermission = allowedRoles.includes(user.role as 'user' | 'admin');
    if (!hasPermission) {
      return <>{fallback}</>;
    }
  }

  // If authentication is not required or user has permission
  return <>{children}</>;
}

// Specific role components for convenience
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['admin']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export function UserOrAdmin({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['user', 'admin']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export function UserOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['user']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

// Hook for checking permissions
export function usePermissions() {
  const { state } = useAuth();
  const { isAuthenticated, user } = state;

  const hasRole = (role: 'user' | 'admin'): boolean => {
    return isAuthenticated && user?.role === role;
  };

  const hasAnyRole = (roles: ('user' | 'admin')[]): boolean => {
    return isAuthenticated && user ? roles.includes(user.role as 'user' | 'admin') : false;
  };

  const isAdmin = (): boolean => hasRole('admin');
  const isUser = (): boolean => hasRole('user');
  const isUserOrAdmin = (): boolean => hasAnyRole(['user', 'admin']);

  return {
    isAuthenticated,
    user,
    hasRole,
    hasAnyRole,
    isAdmin,
    isUser,
    isUserOrAdmin,
  };
}