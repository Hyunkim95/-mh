// Debug utilities for testing auth persistence
export function logAuthState() {
  try {
    const tokens = localStorage.getItem('auth_tokens');
    const user = localStorage.getItem('auth_user');
    
    console.log('🔐 Auth Debug State:', {
      tokens: tokens ? JSON.parse(tokens) : null,
      user: user ? JSON.parse(user) : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to parse auth state:', error);
  }
}

export function clearAuthState() {
  localStorage.removeItem('auth_tokens');
  localStorage.removeItem('auth_user');
  console.log('🧹 Cleared auth state from localStorage');
}

export function simulateSessionRestore() {
  console.log('🔄 Simulating session restore...');
  logAuthState();
  
  const hasTokens = localStorage.getItem('auth_tokens');
  const hasUser = localStorage.getItem('auth_user');
  
  if (hasTokens && hasUser) {
    console.log('✅ Session can be restored from localStorage');
    return true;
  } else {
    console.log('❌ Session cannot be restored - missing data');
    return false;
  }
}

// Add to window for easy debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).authDebug = {
    log: logAuthState,
    clear: clearAuthState,
    restore: simulateSessionRestore
  };
}
