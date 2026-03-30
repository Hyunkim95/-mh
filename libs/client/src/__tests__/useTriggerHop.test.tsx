/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const trpcMocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
}));

vi.mock("../trpc", () => ({
  trpc: {
    contract: {
      triggerHop: {
        useMutation: trpcMocks.useMutation,
      },
    },
  },
}));

import { useTriggerHop } from "../hooks/useTriggerHop";

describe("useTriggerHop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires success and error handlers into the mutation", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const callback = vi.fn();
    const mutationResult = { mutateAsync: vi.fn() };

    trpcMocks.useMutation.mockImplementation((options) => {
      options.onSuccess?.({ signature: "abc" });
      options.onError?.(new Error("boom"));
      return mutationResult;
    });

    const result = useTriggerHop(callback);

    expect(result).toBe(mutationResult);
    expect(callback).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith("Hop triggered successfully:", {
      signature: "abc",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to trigger hop:",
      expect.any(Error)
    );

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
