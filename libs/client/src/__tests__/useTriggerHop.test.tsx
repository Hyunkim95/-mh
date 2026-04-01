/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const trpcMocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  captureClientError: vi.fn(),
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

vi.mock("../utils/monitoring", () => ({
  captureClientError: trpcMocks.captureClientError,
}));

import { useTriggerHop } from "../hooks/useTriggerHop";

describe("useTriggerHop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires success and error handlers into the mutation", () => {
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
    expect(trpcMocks.captureClientError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        area: "routes",
        action: "trigger-hop",
      })
    );
  });
});
