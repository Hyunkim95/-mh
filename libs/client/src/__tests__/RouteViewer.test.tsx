/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeConfigRefetch: vi.fn(),
  routeStateRefetch: vi.fn(),
  routeConfigUseQuery: vi.fn(),
  routeStateUseQuery: vi.fn(),
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  useTriggerHop: vi.fn(),
}));

vi.mock("../trpc", () => ({
  trpc: {
    contract: {
      getRouteConfig: {
        useQuery: mocks.routeConfigUseQuery,
      },
      getRouteState: {
        useQuery: mocks.routeStateUseQuery,
      },
    },
  },
}));

vi.mock("../hooks", () => ({
  useTriggerHop: mocks.useTriggerHop,
}));

vi.mock("../components/ExecutorWallet", () => ({
  ExecutorWallet: ({ routeId }: { routeId: number }) => (
    <div data-testid="executor-wallet">executor:{routeId}</div>
  ),
}));

import { RouteViewer } from "../components/RouteViewer";

describe("RouteViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.routeConfigRefetch.mockResolvedValue(undefined);
    mocks.routeStateRefetch.mockResolvedValue(undefined);

    mocks.routeConfigUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: mocks.routeConfigRefetch,
    });

    mocks.routeStateUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: mocks.routeStateRefetch,
    });

    mocks.useTriggerHop.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
      error: null,
      isSuccess: false,
      data: null,
      reset: mocks.reset,
    });
  });

  it("searches for a route and renders its config and state", async () => {
    mocks.routeConfigUseQuery.mockReturnValue({
      data: {
        data: {
          creator: "creator-1",
          routeId: 42,
          tokenConfig: "token-config-1",
          sourceOwner: "source-owner-1",
          executor: "executor-1",
          hopAmount: "1000",
          isFinalized: true,
          createdAt: "1700000000",
          hops: [
            { recipient: "hop-1", delaySeconds: 0 },
            { recipient: "hop-2", delaySeconds: 120 },
          ],
        },
      },
      isLoading: false,
      error: null,
      refetch: mocks.routeConfigRefetch,
    });
    mocks.routeStateUseQuery.mockReturnValue({
      data: {
        data: {
          currentHopIndex: 1,
        },
      },
      isLoading: false,
      error: null,
      refetch: mocks.routeStateRefetch,
    });

    render(<RouteViewer />);

    fireEvent.change(screen.getByPlaceholderText("Enter route ID"), {
      target: { value: "42" },
    });
    fireEvent.submit(screen.getByText("Search Route"));

    await waitFor(() => {
      expect(mocks.routeConfigRefetch).toHaveBeenCalled();
      expect(mocks.routeStateRefetch).toHaveBeenCalled();
    });

    expect(screen.getByText("Route Configuration")).toBeInTheDocument();
    expect(screen.getByText("creator-1")).toBeInTheDocument();
    expect(screen.getByText("Route Hops (2)")).toBeInTheDocument();
    expect(screen.getByText("Current Hop Details")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByTestId("executor-wallet")).toHaveTextContent("executor:42");
  });

  it("triggers the next hop and refreshes route state", async () => {
    vi.useFakeTimers();

    mocks.routeConfigUseQuery.mockReturnValue({
      data: {
        data: {
          creator: "creator-1",
          routeId: 7,
          tokenConfig: "token-config-1",
          sourceOwner: "source-owner-1",
          executor: "executor-1",
          hopAmount: "1000",
          isFinalized: false,
          createdAt: "1700000000",
          hops: [{ recipient: "hop-1", delaySeconds: 0 }],
        },
      },
      isLoading: false,
      error: null,
      refetch: mocks.routeConfigRefetch,
    });
    mocks.routeStateUseQuery.mockReturnValue({
      data: {
        data: {
          currentHopIndex: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: mocks.routeStateRefetch,
    });

    let onSuccessRefetch: (() => void) | undefined;
    mocks.useTriggerHop.mockImplementation((onSuccess?: () => void) => {
      onSuccessRefetch = onSuccess;
      return {
        mutateAsync: async (input: unknown) => {
          await mocks.mutateAsync(input);
          onSuccess?.();
          return { success: true, data: { signature: "sig-123" } };
        },
        isPending: false,
        error: null,
        isSuccess: true,
        data: { success: true, data: { signature: "sig-123" } },
        reset: mocks.reset,
      };
    });

    render(<RouteViewer />);

    fireEvent.change(screen.getByPlaceholderText("Enter route ID"), {
      target: { value: "7" },
    });
    fireEvent.submit(screen.getByText("Search Route"));

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Next Hop"));
    });

    expect(mocks.reset).toHaveBeenCalled();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ routeId: 7 });
    expect(mocks.routeStateRefetch).toHaveBeenCalled();
    expect(
      screen.getByText(/Hop triggered successfully!/i)
    ).toBeInTheDocument();
    expect(screen.getByText("sig-123")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSuccessRefetch).toBeDefined();
    expect(mocks.routeConfigRefetch).toHaveBeenCalled();
    expect(mocks.routeStateRefetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("shows an error state when route loading fails", () => {
    mocks.routeConfigUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "boom" },
      refetch: mocks.routeConfigRefetch,
    });

    render(<RouteViewer />);

    fireEvent.change(screen.getByPlaceholderText("Enter route ID"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByText("Search Route"));

    expect(screen.getByText("Error loading route:")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
