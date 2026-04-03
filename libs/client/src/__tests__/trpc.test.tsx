/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createTRPCReact: vi.fn(),
  httpBatchLink: vi.fn(),
  fetch: vi.fn(),
  storage: new Map<string, string>(),
  captureClientError: vi.fn(),
}));

describe("client trpc", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_API_URL", "");
    mocks.storage.clear();
    mocks.createClient.mockReturnValue({ kind: "trpc-client" });
    mocks.createTRPCReact.mockReturnValue({
      createClient: mocks.createClient,
    });
    mocks.httpBatchLink.mockImplementation((options: unknown) => options);

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => mocks.storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mocks.storage.set(key, value);
        },
        removeItem: (key: string) => {
          mocks.storage.delete(key);
        },
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: mocks.fetch.mockResolvedValue({ ok: true }),
    });

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          pathname: "/my-assets",
          replace: vi.fn(),
        },
        dispatchEvent: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@trpc/react-query");
    vi.doUnmock("@trpc/client");
    vi.doUnmock("../utils/monitoring");
  });

  it("creates a client with auth headers and conservative retry rules", async () => {
    vi.doMock("@trpc/react-query", () => ({
      createTRPCReact: mocks.createTRPCReact,
    }));
    vi.doMock("@trpc/client", () => ({
      httpBatchLink: mocks.httpBatchLink,
    }));
    vi.doMock("../utils/monitoring", () => ({
      captureClientError: mocks.captureClientError,
    }));

    mocks.storage.set("token", "jwt-token");

    const module = await import("../trpc");
    const options = mocks.httpBatchLink.mock.calls[0]?.[0];

    expect(mocks.createTRPCReact).toHaveBeenCalled();
    expect(mocks.createClient).toHaveBeenCalled();
    expect(options.url).toBe("/trpc");
    expect(options.headers()).toEqual({
      authorization: "Bearer jwt-token",
      "content-type": "application/json",
    });

    await options.fetch("http://api.test", { method: "POST" });
    expect(mocks.fetch).toHaveBeenCalledWith("http://api.test", {
      method: "POST",
      credentials: "include",
    });

    const defaults = module.queryClient.getDefaultOptions();
    expect(defaults.queries?.retry?.(0, { data: { httpStatus: 401 } })).toBe(
      false
    );
    expect(defaults.queries?.retry?.(0, { message: "UNAUTHORIZED" })).toBe(
      false
    );
    expect(defaults.queries?.retry?.(2, { message: "boom" })).toBe(true);
    expect(defaults.queries?.retry?.(3, { message: "boom" })).toBe(false);
  });

  it("omits auth headers, clears invalid auth tokens, and exposes error handlers", async () => {
    vi.doMock("@trpc/react-query", () => ({
      createTRPCReact: mocks.createTRPCReact,
    }));
    vi.doMock("@trpc/client", () => ({
      httpBatchLink: mocks.httpBatchLink,
    }));
    vi.doMock("../utils/monitoring", () => ({
      captureClientError: mocks.captureClientError,
    }));

    const module = await import("../trpc");
    const defaults = module.queryClient.getDefaultOptions();
    const options = mocks.httpBatchLink.mock.calls[0]?.[0];
    const cancelQueriesSpy = vi.spyOn(module.queryClient, "cancelQueries");
    expect(options.headers()).toEqual({
      "content-type": "application/json",
    });

    mocks.storage.set("token", "stale-token");
    defaults.queries?.onError?.({ data: { httpStatus: 401 }, message: "UNAUTHORIZED" });
    expect(mocks.storage.get("token")).toBeUndefined();
    expect(cancelQueriesSpy).toHaveBeenCalledTimes(1);
    expect(globalThis.window.location.replace).toHaveBeenCalledWith("/login");

    mocks.storage.set("token", "bad-signature-token");
    defaults.mutations?.onError?.(
      new Error("The token signature is invalid.")
    );
    expect(mocks.storage.get("token")).toBeUndefined();
    expect(cancelQueriesSpy).toHaveBeenCalledTimes(2);
    expect(globalThis.window.location.replace).toHaveBeenCalledWith("/login");

    mocks.storage.set("token", "still-valid");
    defaults.queries?.onError?.(new Error("query boom"));
    expect(mocks.storage.get("token")).toBe("still-valid");
    defaults.mutations?.onError?.(new Error("mutation boom"));
    expect(mocks.storage.get("token")).toBe("still-valid");
    expect(cancelQueriesSpy).toHaveBeenCalledTimes(2);

    expect(mocks.captureClientError).toHaveBeenCalledTimes(4);
  });
});
