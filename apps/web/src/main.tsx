import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./App.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@trpc-template/client/styles/public.css";
import { Root, AppRouter } from "@trpc-template/client";

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
