/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  useSolanaAuth: vi.fn(),
  useWallet: vi.fn(),
  routeItem: vi.fn(),
}));

vi.mock("../trpc", () => ({
  trpc: {
    routes: {
      getByCreator: {
        useInfiniteQuery: mocks.useInfiniteQuery,
      },
    },
  },
}));

vi.mock("../hooks/useSolanaAuth", () => ({
  useSolanaAuth: mocks.useSolanaAuth,
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: mocks.useWallet,
}));

vi.mock("../components/history/RouteItem", () => ({
  RouteItem: (props: {
    route: { id: number; name: string; status: string };
    isOpen: boolean;
    onToggle: () => void;
  }) => {
    mocks.routeItem(props);
    return (
      <button data-testid={`route-${props.route.id}`} onClick={props.onToggle}>
        {props.route.name}:{props.isOpen ? "open" : "closed"}
      </button>
    );
  },
}));

import { History } from "../components/history/History";

const renderWithQueryClient = (ui: React.ReactNode) => {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

describe("History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSolanaAuth.mockReturnValue({
      userData: { publicKey: "wallet-1" },
    });
    mocks.useWallet.mockReturnValue({
      publicKey: { toBase58: () => "wallet-1" },
    });
  });

  it("renders an empty state when there are no routes", () => {
    mocks.useInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: [], nextCursor: null }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
      isRefetching: false,
    });

    renderWithQueryClient(<History reloadTrigger={0} />);

    expect(screen.getByTestId("history-empty")).toBeInTheDocument();
    expect(screen.getByTestId("history-summary")).toHaveTextContent(
      "0 routes completed & 0 pending"
    );
  });

  it("toggles route details and fetches the next page near the bottom", () => {
    const fetchNextPage = vi.fn();

    mocks.useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              { id: 1, name: "Route One", status: "completed" },
              { id: 2, name: "Route Two", status: "pending" },
            ],
            nextCursor: 3,
          },
        ],
      },
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
      refetch: vi.fn(),
      isRefetching: false,
    });

    const { container } = renderWithQueryClient(<History reloadTrigger={0} />);

    expect(screen.getByTestId("history-summary")).toHaveTextContent(
      "1 routes completed & 1 pending"
    );

    fireEvent.click(screen.getByTestId("route-1"));
    expect(screen.getByTestId("route-1")).toHaveTextContent("Route One:open");

    const scrollContainer = container.querySelector(".overflow-y-auto");
    expect(scrollContainer).not.toBeNull();

    Object.defineProperty(scrollContainer!, "scrollHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(scrollContainer!, "scrollTop", {
      configurable: true,
      value: 420,
    });
    Object.defineProperty(scrollContainer!, "clientHeight", {
      configurable: true,
      value: 50,
    });

    fireEvent.scroll(scrollContainer!);

    expect(fetchNextPage).toHaveBeenCalled();
  });
});
