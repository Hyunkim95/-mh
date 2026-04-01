import * as Sentry from "@sentry/react";

type MonitoringContext = {
  area: string;
  action: string;
  level?: "error" | "warning";
  extra?: Record<string, unknown>;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown client error";
};

const isExpectedNoise = (message: string): boolean =>
  message.includes("UNAUTHORIZED") ||
  message.includes("WalletNotSelectedError");

const isSentryEnabled = (): boolean =>
  typeof Sentry.getClient === "function" && !!Sentry.getClient();

export const captureClientError = (
  error: unknown,
  { area, action, level = "error", extra = {} }: MonitoringContext
): void => {
  const message = getErrorMessage(error);
  if (isExpectedNoise(message)) {
    return;
  }

  if (!isSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("app.area", area);
    scope.setTag("app.action", action);
    scope.setLevel(level);
    for (const [key, value] of Object.entries(extra)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(error instanceof Error ? error : new Error(message));
  });
};
