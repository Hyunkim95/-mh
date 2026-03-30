import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTRPCReact: vi.fn(),
}));

vi.mock("@trpc/react-query", () => ({
  createTRPCReact: mocks.createTRPCReact,
}));

describe("shared trpc", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createTRPCReact.mockReturnValue({ marker: "shared-trpc" });
  });

  it("creates and exports the shared trpc react instance", async () => {
    const module = await import("./trpc");

    expect(mocks.createTRPCReact).toHaveBeenCalled();
    expect(module.trpc).toEqual({ marker: "shared-trpc" });
  });
});
