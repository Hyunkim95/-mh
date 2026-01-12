import type { Route } from "./types";
import OpenIcon from "./../../../assets/history/open-icon.svg";
import CloseIcon from "../../../assets/history/closed-icon.svg";
import { useReplayRoute } from "../../hooks/useReplayRoute";
import { useDeploy } from "../../hooks/useDeploy";
import { trpc } from "../../trpc";
import { useState, useMemo } from "react";
import { Button } from "../Button";
import { useMobileDevice } from "../../hooks/useMobileDevice";

// Format date for display
function formatScheduledTime(isoString: string | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RouteItemProps {
  route: Route;
  isOpen?: boolean;
  onToggle?: () => void;
}
export function trimAddress(address: string, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getSolscanAccountUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}

export const RouteItem = ({ route }: RouteItemProps) => {
  const [open, setOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const { replay, isPending } = useReplayRoute();
  const { deploy } = useDeploy();
  const utils = trpc.useUtils();
  const isCompleted = route.status === "completed";
  const isDeployed = route.deploymentStatus === "deployed";
  const isDraft = !isDeployed;
  const hopsCount = route.hops?.length ?? 0;
  const { isMobile } = useMobileDevice();

  // Fetch route state to get current hop index
  const routeStateQuery = trpc.contract.getRouteState.useQuery(
    {
      routeId: route.routeId || 0,
    },
    {
      enabled:
        route.deploymentStatus === "deployed" && route.status !== "completed",
    }
  );
  const currentHopIndex = routeStateQuery.data?.data?.currentHopIndex || 0;

  // Check if route has hops on-chain
  const routeHasHopsQuery = trpc.contract.routeHasHops.useQuery(
    {
      routeId: route.routeId || 0,
    },
    {
      enabled: route.deploymentStatus === "deployed",
    }
  );
  const hasHopsOnChain = routeHasHopsQuery.data?.data?.hasHops || false;
  const isIncomplete =
    route.deploymentStatus === "deployed" &&
    !hasHopsOnChain &&
    hopsCount > 0;
  const formattedAmount =
    route.hopAmountTokens != null
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(
          Number(route.hopAmountTokens)
        )
      : null;

  // Get expected arrival time (last hop's scheduledAt)
  const expectedArrival = useMemo(() => {
    if (!route.hops || route.hops.length === 0) return null;
    const lastHop = route.hops[route.hops.length - 1];
    return lastHop?.scheduledAt || null;
  }, [route.hops]);

  const handleReplay = async () => {
    const numericId = Number(route.id);
    if (!Number.isFinite(numericId)) {
      // silently ignore if this mock item doesn't have a numeric DB id
      return;
    }
    // fromWallet is rendered as the wallet in this component; assume it's the creator
    await replay({ id: numericId, creator: route.creator });
  };

  const handleDeploy = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    try {
      const hopsArray = Array.isArray(route.hops) ? route.hops : [];

      // Use reduce to calculate timestamps based on delaySeconds
      const formattedHops = hopsArray.reduce<
        Array<{ recipient: string; scheduledAt: number }>
      >((acc, hop, index) => {
        let scheduledAt: number;

        if (index === 0) {
          // First hop executes immediately
          scheduledAt = Math.floor(Date.now() / 1000);
        } else {
          // Calculate based on previous hop's scheduledAt + current hop's delaySeconds
          const prevScheduledAt = acc[index - 1].scheduledAt;
          const delaySeconds = hop.delaySeconds || 0;
          scheduledAt = prevScheduledAt + delaySeconds;
        }

        return [
          ...acc,
          {
            recipient: hop.recipient,
            scheduledAt,
          },
        ];
      }, []);

      await deploy(
        {
          routeId: route.routeId,
          databaseId: route.id,
          hops: formattedHops,
          hopAmount: route.hopAmountRaw,
          splMint:
            route.tokenType === "SPL"
              ? route.tokenMint ?? undefined
              : undefined,
        },
        route.tokenType as "SPL" | "SOL"
      );
      // Refresh the list after successful deploy to update status/button
      await utils.routes.getByCreator.invalidate({ creator: route.creator });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCompleteDeployment = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    try {
      const hopsArray = Array.isArray(route.hops) ? route.hops : [];

      // Recalculate fresh timestamps (10 minutes apart)
      const now = Date.now();
      const formattedHops = hopsArray.map((hop, index) => ({
        recipient: hop.recipient,
        scheduledAt: now + (index + 1) * 10 * 60 * 1000, // 10 minutes apart
        delayMinutes: 10,
        isCustomTime: false,
      }));

      await deploy(
        {
          routeId: route.routeId,
          databaseId: route.id,
          hops: formattedHops,
          hopAmount: route.hopAmountRaw,
          splMint:
            route.tokenType === "SPL"
              ? route.tokenMint ?? undefined
              : undefined,
        },
        route.tokenType as "SPL" | "SOL"
      );
      // Refresh queries after successful completion
      await utils.routes.getByCreator.invalidate({ creator: route.creator });
      await routeHasHopsQuery.refetch();
    } finally {
      setIsDeploying(false);
    }
  };

  const onToggle = () => {
    setOpen(!open);
  };

  return (
    <div className="relative flex flex-col bg-[var(--dark-jungle-green-500)] rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex flex-col sm:flex-row items-center justify-between w-full p-4 gap-3"
      >
        {/* Route Name & ID - Flexible with overflow */}
        {!isMobile && (
          <div className="flex flex-col items-start text-left min-w-0 flex-1 max-w-[140px]">
            <div className="text-sm text-white font-medium truncate w-full overflow-x-auto scrollbar-hide">
              {route.name || `Route`}
            </div>
            <div className="text-xs text-gray-400 truncate w-full">
              #{route.id}
            </div>
          </div>
        )}

        {/* Token info - Flexible with overflow */}
        <div className="flex flex-row gap-[10px] text-left min-w-0 flex-1 max-w-[120px]">
          {/* <img
            src={route.token}
            alt={route.symbol}
            className="w-10 h-10 rounded-full justify-center items-center"
          /> */}
          <div className="flex flex-col items-start text-left min-w-0">
            <div className="font-medium text-white truncate w-full">
              {route.tokenSymbol || route.tokenType}
            </div>
            {formattedAmount ? (
              <div className="text-xs text-gray-400 truncate w-full overflow-x-auto scrollbar-hide">
                {formattedAmount}
              </div>
            ) : null}
          </div>
        </div>

        {/* Creator/Wallet - Flexible with overflow */}
        <div className="flex flex-col items-start text-left min-w-0 flex-1 max-w-[140px]">
          <a
            href={getSolscanAccountUrl(route.creator)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-white truncate w-full overflow-x-auto scrollbar-hide hover:underline hover:text-yellow-400 transition-colors duration-200 cursor-pointer"
          >
            {trimAddress(route.creator)}
          </a>
          <div className="text-xs text-gray-400 truncate w-full">Creator</div>
        </div>

        {/* Hops - Flexible */}
        {!isMobile && (
          <div className="flex flex-col items-start text-left min-w-0 flex-1 max-w-[80px]">
            <div className="text-sm text-white font-medium">Hops</div>
            <div className="text-xs text-gray-400">{hopsCount}</div>
          </div>
        )}

        {/* Expected Arrival - Desktop */}
        {!isMobile && expectedArrival && !isCompleted && (
          <div className="flex flex-col items-start text-left min-w-0 flex-1 max-w-[120px]">
            <div className="text-sm text-white font-medium">Arrival</div>
            <div className="text-xs text-[var(--laser-lemon-500)]">
              {formatScheduledTime(expectedArrival)}
            </div>
          </div>
        )}

        {isMobile && (
          <div className="flex flex-col gap-3 col-start-1 col-end-3">
            <div className="flex items-start justify-between text-left min-w-0 flex-1 gap-3 w-full">
              <div className="text-xs text-gray-400">Creator</div>
              <a
                href={getSolscanAccountUrl(route.creator)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-white font-medium hover:underline hover:text-yellow-400 transition-colors duration-200 cursor-pointer"
              >
                {trimAddress(route.creator)}
              </a>
            </div>
            <div className="flex items-start justify-between text-left min-w-0 flex-1 gap-3 w-full">
              <div className="text-xs text-gray-400 truncate ">Route</div>
              <div className="text-sm text-white font-medium truncate overflow-x-auto scrollbar-hide">
                #{route.id}
              </div>
            </div>
            {expectedArrival && !isCompleted && (
              <div className="flex items-start justify-between text-left min-w-0 flex-1 gap-3 w-full">
                <div className="text-xs text-gray-400">Expected Arrival</div>
                <div className="text-sm text-[var(--laser-lemon-500)] font-medium">
                  {formatScheduledTime(expectedArrival)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status - Flexible */}
        <div className="flex flex-col items-start text-left -order-1 md:order-0 min-w-0 flex-1 max-w-[100px]">
          <div className="text-xs text-gray-400">Status</div>
          <div
            className={`text-sm font-medium ${
              isCompleted
                ? "text-green-400"
                : isIncomplete
                ? "text-red-400"
                : isDraft
                ? "text-gray-400"
                : "text-yellow-400"
            }`}
          >
            {isCompleted
              ? "Completed"
              : isIncomplete
              ? "Incomplete"
              : isDraft
              ? "Draft"
              : "Pending"}
          </div>
        </div>

        {/* Right side status + toggle icon - Fixed width */}
        <div className="flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
          {isDraft ? (
            <Button
              onClick={handleDeploy}
              disabled={isDeploying}
              variant="ghost"
              // className='px-3 py-1 rounded-lg text-[var(--black-900)] bg-yellow-400 hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed'
              className="!py-0 rounded-lg hover:text-[var(--black-900)] hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed h-8 w-[72px] order-1 md:order-0"
            >
              Deploy
            </Button>
          ) : (
            <Button
              onClick={handleReplay}
              disabled={isPending}
              variant="ghost"
              // className='px-3 py-1 rounded-lg text-black bg-yellow-400 hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed'
              className="!py-0 rounded-lg hover:text-[var(--black-900)] hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed h-8 w-[72px]"
            >
              Replay
            </Button>
          )}
          {open ? (
            <img src={OpenIcon} alt="open" className="w-7 h-7" />
          ) : (
            <img src={CloseIcon} alt="close" className="w-7 h-7" />
          )}
        </div>
      </button>

      {/* Incomplete deployment warning */}
      {isIncomplete && (
        <div className="mx-4 mt-3 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-yellow-400 font-medium text-sm mb-1">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Incomplete Deployment
              </div>
              <p className="text-xs text-gray-300">
                This route was initialized but the hops were never added
                on-chain. Your {route.hopAmountTokens} {route.tokenSymbol || route.tokenType} is safe as route tokens. Click Complete Deployment to add the hops with fresh timestamps.
              </p>
            </div>
            <Button
              onClick={handleCompleteDeployment}
              disabled={isDeploying}
              variant="ghost"
              className="!py-2 px-4 rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap text-sm"
            >
              {isDeploying ? "Adding Hops..." : "Complete Deployment"}
            </Button>
          </div>
        </div>
      )}

      {/* Expanded section */}
      {open && (
        <div className="relative bg-[var(--dark-jungle-green-500)] pl-10 pr-4 pb-4 space-y-4">
          {(route.hops ?? []).map((step, index, steps) => {
            const isLast = index === steps.length - 1;
            // Use currentHopIndex to determine progress (1-indexed from blockchain)
            // index 0 = hop 1, so completed if index < currentHopIndex
            const isCompleted = index < currentHopIndex;
            const isCurrentHop = index === currentHopIndex;
            const isUpcoming = index > currentHopIndex;

            // Colors based on progress
            const dotColor = isUpcoming
              ? "bg-gray-600 border-gray-600"
              : "bg-yellow-400 border-yellow-400";
            const lineColor = isUpcoming ? "bg-gray-600" : "bg-yellow-400";

            return (
              <div
                key={`${route.id}-${index}`}
                className={`relative flex items-start bg-[var(--white-100-transparency-03)] gap-3 border ${
                  isCurrentHop ? "border-yellow-400" : "border-transparent"
                } rounded-2xl p-3`}
              >
                {/* Dot + connecting line */}
                <div className="absolute -left-[1rem] flex flex-col items-center">
                  <div className={`w-[2px] h-[100px] ${lineColor}`} />
                  <div
                    className={`w-3 h-3 absolute -top-[-15px] left-[-5px] rounded-full border-2 ${dotColor}`}
                  />
                </div>

                {/* Step content */}
                <div className="flex-1 flex flex-row gap-3 items-center">
                  <div
                    className={`text-[11px] w-11 h-11 flex items-center justify-center rounded-2xl ${
                      isCurrentHop
                        ? "text-[var(--black-900)] bg-yellow-300"
                        : "text-[var(--white-100)] bg-[var(--white-100-transparency-05)]"
                    }`}
                  >
                    {isLast ? "Final" : `#${index + 1}`}
                  </div>

                  {/* Wallet address and details */}
                  <div className="flex flex-col flex-1">
                    <div className="flex flex-row items-center gap-2 justify-between">
                      <div className="flex flex-row items-center gap-2">
                        {isCompleted && (
                          <div className="text-[10px] text-[var(--black-900)] bg-yellow-400 w-3 h-3 rounded-[3px] flex items-center justify-center">
                            ✓
                          </div>
                        )}
                        <a
                          href={getSolscanAccountUrl(step.recipient)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-white hover:underline hover:text-yellow-400 transition-colors duration-200 cursor-pointer"
                        >
                          {trimAddress(step.recipient)}
                        </a>
                      </div>
                      {isCurrentHop && (
                        <span className="bg-blue-900 text-blue-200 px-2 py-1 rounded-full text-xs font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                    {/* Scheduled time for this hop */}
                    {step.scheduledAt && (
                      <div
                        className={`text-xs mt-1 ${
                          isCompleted
                            ? "text-gray-500"
                            : isUpcoming
                            ? "text-gray-400"
                            : "text-[var(--laser-lemon-500)]"
                        }`}
                      >
                        {isCompleted
                          ? "Completed"
                          : isCurrentHop
                          ? "Scheduled: "
                          : "ETA: "}
                        {!isCompleted && formatScheduledTime(step.scheduledAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
