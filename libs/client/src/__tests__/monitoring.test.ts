/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/react", () => sentryMocks);

import { captureClientError } from "../utils/monitoring";

describe("captureClientError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a safe no-op when Sentry is not initialized", () => {
    sentryMocks.getClient.mockReturnValue(undefined);

    captureClientError(new Error("boom"), {
      area: "routes",
      action: "deploy",
    });

    expect(sentryMocks.withScope).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it("captures unexpected errors when Sentry is initialized", () => {
    sentryMocks.getClient.mockReturnValue({ id: "client" });
    sentryMocks.withScope.mockImplementation((callback) => {
      callback({
        setTag: vi.fn(),
        setLevel: vi.fn(),
        setExtra: vi.fn(),
      });
    });

    captureClientError(new Error("boom"), {
      area: "routes",
      action: "deploy",
      extra: { routeId: 42 },
    });

    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
  });

  it("still captures network failures when Sentry is initialized", () => {
    sentryMocks.getClient.mockReturnValue({ id: "client" });
    sentryMocks.withScope.mockImplementation((callback) => {
      callback({
        setTag: vi.fn(),
        setLevel: vi.fn(),
        setExtra: vi.fn(),
      });
    });

    captureClientError(new Error("Failed to fetch"), {
      area: "trpc",
      action: "query",
    });

    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
  });

  it("still ignores expected auth noise", () => {
    sentryMocks.getClient.mockReturnValue({ id: "client" });

    captureClientError(new Error("UNAUTHORIZED"), {
      area: "trpc",
      action: "query",
    });

    expect(sentryMocks.withScope).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });
});
