import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./App.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@trpc-template/client/styles/public.css";
import { Root, AppRouter } from "@trpc-template/client";

// When a deploy ships, the user's stale JS bundle may try to lazy-load chunks
// whose hashed filenames no longer exist on the CDN. Detect that and reload —
// guarded by a timestamp so we never get stuck in a reload loop.
const CHUNK_ERROR_PATTERN =
  /(ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed)/i;

const maybeReloadFromChunkError = () => {
  const KEY = "mh:lastChunkReload";
  const last = Number(sessionStorage.getItem(KEY) || "0");
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
};

window.addEventListener("error", (e) => {
  if (e?.message && CHUNK_ERROR_PATTERN.test(e.message)) {
    maybeReloadFromChunkError();
  }
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = (e.reason && (e.reason.message || String(e.reason))) || "";
  if (CHUNK_ERROR_PATTERN.test(reason)) {
    maybeReloadFromChunkError();
  }
});

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const app = (
  <Root>
    <AppRouter />
  </Root>
);

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || "0"
    ),
    integrations: [Sentry.browserTracingIntegration()],
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {sentryDsn ? (
      <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
        {app}
      </Sentry.ErrorBoundary>
    ) : (
      app
    )}
  </React.StrictMode>
);
