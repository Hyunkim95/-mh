/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const toastMocks = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

const trpcMocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  invalidate: vi.fn(),
  reset: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  toast: toastMocks,
}));

vi.mock("../trpc", () => ({
  trpc: {
    routes: {
      replay: {
        useMutation: trpcMocks.useMutation,
      },
    },
    useUtils: () => ({
      routes: {
        getByCreator: {
          invalidate: trpcMocks.invalidate,
        },
      },
    }),
  },
}));

import { useReplayRoute } from "../hooks/useReplayRoute";

describe("useReplayRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trpcMocks.useMutation.mockReturnValue({
      mutateAsync: trpcMocks.mutateAsync,
      isPending: false,
      error: null,
      data: undefined,
      reset: trpcMocks.reset,
    });
  });

  it("replays a route and invalidates the history query", async () => {
    trpcMocks.mutateAsync.mockResolvedValue({
      data: { id: 42, name: "Replay" },
    });
    trpcMocks.invalidate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useReplayRoute());

    await act(async () => {
      await expect(result.current.replay({ id: 42 })).resolves.toEqual({
        id: 42,
        name: "Replay",
      });
    });

    expect(toastMocks.loading).toHaveBeenCalledWith(
      "Cloning route for replay...",
      { id: "replay-route" }
    );
    expect(trpcMocks.mutateAsync).toHaveBeenCalledWith({ id: 42 });
    expect(toastMocks.success).toHaveBeenCalledWith("Replay route created", {
      id: "replay-route",
    });
    expect(trpcMocks.invalidate).toHaveBeenCalledOnce();
  });

  it("shows an error toast and rethrows on failure", async () => {
    const error = new Error("Replay failed");
    trpcMocks.mutateAsync.mockRejectedValue(error);

    const { result } = renderHook(() => useReplayRoute());

    await act(async () => {
      await expect(result.current.replay({ id: 7 })).rejects.toThrow(
        "Replay failed"
      );
    });

    expect(toastMocks.error).toHaveBeenCalledWith("Replay failed", {
      id: "replay-route",
    });
  });
});
