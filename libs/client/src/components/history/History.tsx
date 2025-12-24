import { useMemo, useState, useEffect } from "react";
import { RouteItem } from "./RouteItem";
import { trpc } from "../../trpc";
import { useSolanaAuth } from "../../hooks/useSolanaAuth";
import { useWalletChangeEffect } from "../..";
import { partition } from "lodash";

// skeeleton loader component
const SkeletonRouteItem = () => (
  <div className="animate-pulse bg-[#1A1C1F] p-4 rounded-xl flex flex-row justify-between items-start gap-6">
    <div className="flex flex-col gap-2 flex-1">
      <div className="h-4 bg-gray-700 rounded w-1/3"></div>
      <div className="h-3 bg-gray-700 rounded w-1/2"></div>
    </div>

    <div className="flex flex-col gap-2 flex-1">
      <div className="h-4 bg-gray-700 rounded w-1/4"></div>
      <div className="h-3 bg-gray-700 rounded w-1/3"></div>
    </div>

    <div className="flex flex-row items-center gap-3">
      <div className="h-8 bg-gray-700 rounded-md w-[90px]"></div>

      <div className="h-8 bg-gray-700 rounded-full w-8"></div>
    </div>
  </div>
);

export const History = ({ reloadTrigger }: { reloadTrigger: number }) => {
  const [openRouteId, setOpenRouteId] = useState<number | null>(null);
  const { userData } = useSolanaAuth();

  // Paginated infinite query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = trpc.routes.getByCreator.useInfiniteQuery(
    {
      creator: userData?.publicKey ?? "",
      limit: 10,
    },
    {
      enabled: !!userData?.publicKey,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }
  );

  const isInitialLoading = !data && !isFetchingNextPage;
  const isLoading = isInitialLoading || isRefetching;

  // Flatten all pages into a single list
  const routes = useMemo(() => {
    return (data?.pages ?? []).flatMap((p) => p.data);
  }, [data]);

  // Scroll handler for infinite load
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;

    if (nearBottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  // Parent-triggered reload
  useEffect(() => {
    if (reloadTrigger) {
      refetch();
    }
  }, [reloadTrigger, refetch]);

  // Handle wallet changes
  useWalletChangeEffect({
    onWalletChange: () => setOpenRouteId(null),
    showToast: false,
    invalidateQueries: false,
  });

  // Auto-close route if it disappears
  useEffect(() => {
    if (openRouteId && !routes.some((r) => r.id === openRouteId)) {
      setOpenRouteId(null);
    }
  }, [routes, openRouteId]);

  const summary = useMemo(() => {
    const [completed, pending] = partition(
      routes,
      (r) => r.status === "completed"
    );
    return `${completed.length} routes completed & ${pending.length} pending`;
  }, [routes]);

  const handleToggle = (id: number) => {
    setOpenRouteId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col md:bg-[var(--chinese-black-800)] md:rounded-3xl md:p-6 md:border md:border-[var(--white-100-transparency-05)]">
      <div className="rounded-2xl shadow-lg flex flex-col max-h-[590px]">
        <div
          className="overflow-y-auto md:bg-[var(--chinese-black-800)] md:p-6 md:space-y-4 rounded-b-2xl scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
          onScroll={handleScroll}
        >
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <SkeletonRouteItem />
              <SkeletonRouteItem />
              <SkeletonRouteItem />
              <SkeletonRouteItem />
              <SkeletonRouteItem />
            </div>
          ) : routes.length > 0 ? (
            routes.map((route) => (
              <RouteItem
                key={route.id}
                route={route}
                isOpen={openRouteId === route.id}
                onToggle={() => handleToggle(route.id)}
              />
            ))
          ) : (
            <p className="text-gray-400 text-sm text-center">No routes found</p>
          )}

          {/* Infinite loading indicator */}
          {isFetchingNextPage && (
            <p className="text-center text-gray-500 text-sm py-4">
              Loading more...
            </p>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-400 pt-3 text-center">{summary}</div>
    </div>
  );
};
