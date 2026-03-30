/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "../components/history/types";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  replay: vi.fn(),
  deploy: vi.fn(),
  invalidateRoutes: vi.fn(),
  updateHopTimestamps: vi.fn(),
  addHopsBatched: vi.fn(),
  routeStateRefetch: vi.fn(),
  getRouteStateUseQuery: vi.fn(),
  useMobileDevice: vi.fn(),
  sendTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  transactionFrom: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  toast: toastMock,
}));

vi.mock("../../assets/history/open-icon.svg", () => ({ default: "open.svg" }));
vi.mock("../../assets/history/closed-icon.svg", () => ({ default: "close.svg" }));

vi.mock("../hooks/useReplayRoute", () => ({
  useReplayRoute: () => ({
    replay: mocks.replay,
    isPending: false,
  }),
}));

vi.mock("../hooks/useDeploy", () => ({
  useDeploy: () => ({
    deploy: mocks.deploy,
  }),
}));

vi.mock("../hooks/useMobileDevice", () => ({
  useMobileDevice: mocks.useMobileDevice,
}));

vi.mock("../trpc", () => ({
  trpc: {
    useUtils: () => ({
      routes: {
        getByCreator: {
          invalidate: mocks.invalidateRoutes,
        },
      },
    }),
    routes: {
      updateHopTimestamps: {
        useMutation: () => ({
          mutateAsync: mocks.updateHopTimestamps,
        }),
      },
    },
    contract: {
      addHopsBatched: {
        useMutation: () => ({
          mutateAsync: mocks.addHopsBatched,
        }),
      },
      getRouteState: {
        useQuery: mocks.getRouteStateUseQuery,
      },
    },
  },
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    sendTransaction: mocks.sendTransaction,
  }),
  useConnection: () => ({
    connection: {
      confirmTransaction: mocks.confirmTransaction,
    },
  }),
}));

vi.mock("@solana/web3.js", () => ({
  Transaction: {
    from: mocks.transactionFrom,
  },
}));

vi.mock("../components/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

import { RouteItem } from "../components/history/RouteItem";

const baseRoute = (): Route => ({
  id: 1,
  routeId: 101,
  name: "Payroll Route",
  tokenType: "SOL",
  tokenMint: null,
  tokenSymbol: "SOL",
  hopAmountTokens: "1.25",
  hopAmountRaw: "1250000000",
  hops: [
    {
      recipient: "Wallet111111111111111111111111111111111",
      scheduledAt: "2026-04-01T10:00:00.000Z",
      delaySeconds: 0,
      executedAt: null,
    },
    {
      recipient: "Wallet222222222222222222222222222222222",
      scheduledAt: "2026-04-01T10:02:00.000Z",
      delaySeconds: 120,
      executedAt: null,
    },
    {
      recipient: "Wallet333333333333333333333333333333333",
      scheduledAt: "2026-04-01T10:04:00.000Z",
      delaySeconds: 120,
      executedAt: null,
    },
  ],
  creator: "Creator111111111111111111111111111111111",
  status: "pending",
  createdAt: "2026-04-01T09:00:00.000Z",
  deployedAt: "2026-04-01T09:05:00.000Z",
  canDeploy: true,
  deploymentStatus: "draft",
  hasObfuscation: false,
  obfuscationStatus: null,
});

describe("RouteItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useMobileDevice.mockReturnValue({ isMobile: false });
    mocks.invalidateRoutes.mockResolvedValue(undefined);
    mocks.deploy.mockResolvedValue("tx-hash");
    mocks.updateHopTimestamps.mockResolvedValue(undefined);
    mocks.addHopsBatched.mockResolvedValue({
      data: {
        transactions: [
          {
            transaction: "batch-1",
            recentBlockhash: "blockhash-1",
            lastValidBlockHeight: 10,
          },
        ],
        totalBatches: 1,
      },
    });
    mocks.sendTransaction.mockResolvedValue("wallet-sig");
    mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
    mocks.transactionFrom.mockReturnValue({ serialize: () => Buffer.from("tx") });
    mocks.routeStateRefetch.mockResolvedValue(undefined);
    mocks.getRouteStateUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: mocks.routeStateRefetch,
    });
  });

  it("renders a draft route and deploys it with calculated hop timestamps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    render(<RouteItem route={baseRoute()} />);

    expect(screen.getByTestId("route-status-1")).toHaveTextContent("Draft");
    expect(screen.getByText("Deploy")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Deploy"));

    await waitFor(() => {
      expect(mocks.deploy).toHaveBeenCalledWith(
        {
          routeId: 101,
          databaseId: 1,
          hops: [
            {
              recipient: "Wallet111111111111111111111111111111111",
              scheduledAt: 1_700_000_000,
            },
            {
              recipient: "Wallet222222222222222222222222222222222",
              scheduledAt: 1_700_000_120,
            },
            {
              recipient: "Wallet333333333333333333333333333333333",
              scheduledAt: 1_700_000_240,
            },
          ],
          hopAmount: "1250000000",
          splMint: undefined,
        },
        "SOL"
      );
    });

    expect(mocks.invalidateRoutes).toHaveBeenCalled();
  });

  it("renders replay for deployed routes and expands hop details", async () => {
    mocks.getRouteStateUseQuery.mockReturnValue({
      data: { data: { currentHopIndex: 1, hopsCount: 3 } },
      isLoading: false,
      refetch: mocks.routeStateRefetch,
    });

    const { container } = render(
      <RouteItem
        route={{
          ...baseRoute(),
          deploymentStatus: "deployed",
          status: "completed",
        }}
      />
    );

    expect(screen.getByText("Replay")).toBeInTheDocument();
    expect(screen.getByTestId("route-status-1")).toHaveTextContent("Completed");

    fireEvent.click(container.querySelector('[data-testid="route-item-1"] > button')!);
    expect(screen.getByTestId("route-detail-1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Replay"));

    await waitFor(() => {
      expect(mocks.replay).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("shows the incomplete deployment recovery flow and updates timestamps after recovery", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mocks.deploy.mockRejectedValueOnce(new Error("verification timeout"));
    const route = {
      ...baseRoute(),
      deploymentStatus: "deployed" as const,
      status: "pending",
    };

    render(<RouteItem route={route} />);

    expect(screen.getByText("Incomplete Deployment")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Complete Deployment"));

    await waitFor(() => {
      expect(mocks.deploy).toHaveBeenCalled();
      expect(mocks.updateHopTimestamps).toHaveBeenCalledWith({
        routeId: 1,
        hops: [
          {
            recipient: "Wallet111111111111111111111111111111111",
            scheduledAt: 1_700_000_120_000,
          },
          {
            recipient: "Wallet222222222222222222222222222222222",
            scheduledAt: 1_700_000_240_000,
          },
          {
            recipient: "Wallet333333333333333333333333333333333",
            scheduledAt: 1_700_000_360_000,
          },
        ],
      });
    });

    expect(mocks.routeStateRefetch).toHaveBeenCalled();
  });

  it("shows the partial deployment recovery flow and adds missing hops", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mocks.getRouteStateUseQuery.mockReturnValue({
      data: { data: { currentHopIndex: 1, hopsCount: 1 } },
      isLoading: false,
      refetch: mocks.routeStateRefetch,
    });

    render(
      <RouteItem
        route={{
          ...baseRoute(),
          deploymentStatus: "deployed",
          status: "completed",
          deployedAt: "2022-01-01T09:05:00.000Z",
        }}
      />
    );

    expect(screen.getByTestId("route-status-1")).toHaveTextContent("Partial");
    fireEvent.click(screen.getByText("Add 2 Missing Hop(s)"));

    await waitFor(() => {
      expect(mocks.addHopsBatched).toHaveBeenCalledWith({
        routeId: 101,
        hops: [
          {
            recipient: "Wallet222222222222222222222222222222222",
            scheduledAt: 1_700_000_120_000,
          },
          {
            recipient: "Wallet333333333333333333333333333333333",
            scheduledAt: 1_700_000_240_000,
          },
        ],
      });
      expect(mocks.sendTransaction).toHaveBeenCalled();
      expect(mocks.updateHopTimestamps).toHaveBeenCalled();
      expect(toastMock.success).toHaveBeenCalledWith(
        "Successfully added 2 missing hop(s)!",
        { id: "add-hops" }
      );
    });
  });
});
