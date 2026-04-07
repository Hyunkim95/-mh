import { useEffect, useState } from "react";

declare const __APP_VERSION__: string;

const DEFAULT_POLL_INTERVAL_MS = 60_000;

/**
 * Polls `/version.json` (emitted at build time by the `emit-version-json` Vite
 * plugin) and reports when the deployed version differs from the version that
 * was baked into the currently-running bundle.
 *
 * Only runs in production builds — in dev there is no `version.json` to fetch.
 */
export function useDeploymentCheck(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (cancelled) return;
        if (data?.version && data.version !== __APP_VERSION__) {
          setUpdateAvailable(true);
        }
      } catch {
        // Network blips are expected — silently retry on the next tick.
      }
    };

    check();
    const id = setInterval(check, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return updateAvailable;
}
