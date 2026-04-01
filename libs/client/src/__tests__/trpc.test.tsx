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
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: mocks.fetch.mockResolvedValue({ ok: true }),
    });
  });

  afterEach(() => {
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
    expect(options.url).toBe("http://localhost:3001/trpc");
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

  it("omits auth headers when no token exists and exposes error handlers", async () => {
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

    expect(options.headers()).toEqual({
      "content-type": "application/json",
    });

    defaults.queries?.onError?.(new Error("query boom"));
    defaults.mutations?.onError?.(new Error("mutation boom"));

    expect(mocks.captureClientError).toHaveBeenCalledTimes(2);
  });
});
