const AUTH_TOKEN_STORAGE_KEY = "token";
const AUTH_TOKEN_EVENT = "auth-token-changed";

function emitAuthTokenChanged() {
  window.dispatchEvent(new Event(AUTH_TOKEN_EVENT));
}

export function getStoredAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setStoredAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  emitAuthTokenChanged();
}

export function clearStoredAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  emitAuthTokenChanged();
}

export function subscribeToAuthTokenChange(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === AUTH_TOKEN_STORAGE_KEY) {
      onChange();
    }
  };

  window.addEventListener(AUTH_TOKEN_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(AUTH_TOKEN_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}
