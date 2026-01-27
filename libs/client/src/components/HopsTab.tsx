import React, { useState } from "react";
import { trpc } from "../trpc";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { RouteDetailView } from "./RouteDetailView";
import toast from "react-hot-toast";
import { TimestampHopInput } from "../types/route";
import { useWalletChangeEffect } from "../hooks/useWalletChangeEffect";
import { Transaction } from "@solana/web3.js";
import { useSolanaAuth } from "../hooks/useSolanaAuth";
import { extractErrorMessage } from "../utils/extractErrorMessage";

interface Route {
  id: number;
  routeId: number;
  name: string | null; //route name
  description?: string | null;
  tokenType: string;
  tokenMint?: string | null;
  hopAmountTokens: string;
  hopAmountRaw: string;
  hops?: Array<{
    recipient: string;
    scheduledAt: string; // ISO string from database
    delayMinutes?: number;
    delaySeconds?: number;
    status?: "completed" | "active" | "upcoming";
  }>;
  creator: string;
  status: string;
  createdAt: string;
  deployedAt?: string | null;
  deploymentTxHash?: string | null;
  routeConfigPda?: string | null;
  canDeploy: boolean;
  deploymentStatus: "draft" | "deploying" | "deployed" | "failed";
}

export const HopsTab: React.FC = () => {
  const { userData } = useSolanaAuth();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [showRouteDetail, setShowRouteDetail] = useState(false);

  // Handle wallet changes and clear selected route
  useWalletChangeEffect({
    onWalletChange: () => {
      // Clear selected route and close detail view when wallet changes
      setSelectedRouteId(null);
      setShowRouteDetail(false);
    },
    showToast: false, // Don't show toast here since App.tsx already shows it
    invalidateQueries: false, // Don't invalidate here since App.tsx already does it
  });

  // Fetch routes for the current user
  const {
    data: routesData,
    isLoading,
    refetch,
  } = trpc.routes.getByCreator.useQuery(
    { creator: userData?.publicKey ?? "" },
    { enabled: !!userData?.publicKey }
  );

  // Deploy route mutations
  const initializeRoute = trpc.contract.initializeRoute.useMutation();
  const initializeRouteSOL = trpc.contract.initializeRouteSOL.useMutation();
  const markDeployed = trpc.routes.markDeployed.useMutation();

  const routes = routesData?.data ?? [];

  const handleViewRoute = (routeId: number) => {
    setSelectedRouteId(routeId);
    setShowRouteDetail(true);
  };

  const handleBackToList = () => {
    setShowRouteDetail(false);
    setSelectedRouteId(null);
  };

  // TODO: replace with useDeploy hook
  const handleDeploy = async (route: Route) => {
    console.log('----------------------------')
    if (!publicKey || !sendTransaction) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      toast.loading("Preparing deployment transaction...", { id: "deploy" });

      // Convert hops to the format expected by the contract
      const hopsArray = Array.isArray(route.hops) ? route.hops : [];
      const formattedHops = hopsArray.map((hop: any, index: number) => {
        let scheduledAt: number;

        if (index === 0) {
          // First hop executes immediately
          scheduledAt = new Date().getTime();
        } else {
          // Calculate scheduledAt based on previous hop's scheduledAt + delaySeconds
          const prevHop = formattedHops[index - 1];
          const prevTime = new Date(prevHop.scheduledAt).getTime();
          const delayMillis = (hop.delaySeconds || 0) * 1000;
          scheduledAt = new Date(prevTime + delayMillis).getTime();
        }

        return {
          recipient: hop.recipient,
          scheduledAt,
        };
      });

      debugger;

      let transactionSignature;

      if (route.tokenType === "SPL") {
        if (!route.tokenMint) {
          throw new Error("SPL mint address is required for SPL routes");
        }
        console.log(formattedHops)
        transactionSignature = await initializeRoute.mutateAsync({
          routeId: route.routeId,
          hops: formattedHops,
          hopAmount: route.hopAmountRaw,
          creator: publicKey.toBase58(),
          splMint: route.tokenMint,
        });
      } else {
        transactionSignature = await initializeRouteSOL.mutateAsync({
          routeId: route.routeId,
          hops: formattedHops,
          hopAmount: route.hopAmountRaw,
          creator: publicKey.toBase58(),
          splMint: "So11111111111111111111111111111111111111112", // Native SOL mint
        });
      }

      toast.loading("Please sign the transaction...", { id: "deploy" });

      // Convert the serialized transaction and send it
      const transaction = Transaction.from(
        Buffer.from(transactionSignature.data.transaction, "base64")
      );
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
      });

      toast.loading("Confirming transaction...", { id: "deploy" });

      const latestBlockhash = await connection.getLatestBlockhash();

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature: signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      // Mark route as deployed in the database
      await markDeployed.mutateAsync({
        id: route.id,
        creator: publicKey.toBase58(),
        deploymentTxHash: signature,
      });

      toast.success(
        `${
          route.tokenType
        } Route deployed successfully! Signature: ${signature.slice(0, 8)}...`,
        { id: "deploy" }
      );

      // Refresh the routes list
      refetch();
    } catch (error) {
      console.error(`${route.tokenType} Route deployment failed:`, error);
      toast.error(
        `${route.tokenType} Route deployment failed: ${extractErrorMessage(error)}`,
        { id: "deploy" }
      );
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      draft: "bg-gray-100 text-gray-800",
      deploying: "bg-[var(--laser-lemon-500-transparency-13)] text-[var(--laser-lemon-500)]",
      deployed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          statusColors[status as keyof typeof statusColors] ||
          statusColors.draft
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!publicKey) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500">
          Please connect your wallet to view your routes.
        </div>
      </div>
    );
  }

  if (showRouteDetail && selectedRouteId !== null) {
    const selectedRoute = routes.find((r) => r.id === selectedRouteId);

    // Convert database route to RouteDetailView format
    const convertedRoute = selectedRoute
      ? {
          ...selectedRoute,
          hops: selectedRoute.hops?.map((hop) => ({
            recipient: hop.recipient,
            scheduledAt: hop.scheduledAt, // Already a UTC ISO string
          })) as TimestampHopInput[],
        }
      : undefined;

    return (
      <RouteDetailView
        route={convertedRoute}
        onBack={handleBackToList}
        onRouteUpdate={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Your Hops</h2>
        <div className="text-sm text-gray-500">
          {routes.length} route{routes.length !== 1 ? "s" : ""} found
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading your routes...</div>
        </div>
      ) : routes.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No routes created yet.</div>
          <div className="text-sm text-gray-400">
            Create your first route in the "Routes" tab to get started.
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Route
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hop Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hops
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {routes.map((route) => (
                  <tr key={route.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">
                          {route.name || "Un named Route"}
                        </div>
                        {route.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {route.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-400">
                          ID: {route.routeId}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {route.tokenType}
                      </div>
                      {route.tokenMint && (
                        <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
                          {route.tokenMint}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {route.hopAmountTokens} {route.tokenType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {Array.isArray(route.hops) ? route.hops.length : 0} hop
                      {Array.isArray(route.hops) && route.hops.length !== 1
                        ? "s"
                        : ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(route.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(route.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleViewRoute(route.id)}
                          className="text-blue-600 hover:text-blue-900 px-3 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                        >
                          View Route
                        </button>
                        {route.canDeploy && (
                          <button
                            onClick={() => handleDeploy(route)}
                            className="bg-[var(--laser-lemon-500)] hover:brightness-95 text-[var(--black-900)] px-3 py-1 rounded transition-colors"
                          >
                            Deploy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
