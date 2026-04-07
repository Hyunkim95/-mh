import React, { useState, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useDeploy } from "../hooks/useDeploy";
import { extractErrorMessage } from "../utils/extractErrorMessage";
import { trpc } from "../trpc";

export interface DeployModalRoute {
  id: number;
  routeId: number;
  name?: string | null;
  tokenType: "SOL" | "SPL";
  tokenMint?: string | null;
  tokenSymbol?: string | null;
  hopAmountTokens: string;
  hopAmountRaw: string;
  totalSpendTokens?: string; // User's total spend (before fee deduction)
  hasObfuscation?: boolean; // Whether route uses obfuscation wallets
  hops: {
    recipient: string;
    scheduledAt: string;
    delayMinutes?: number; // Optional delay metadata
    isCustomTime?: boolean; // Flag for custom times
  }[];
}

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: DeployModalRoute | null;
  onDeploySuccess: () => void;
}

type DeployStatus = "idle" | "deploying" | "confirming" | "success" | "error";

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen,
  onClose,
  route,
  onDeploySuccess,
}) => {
  const [status, setStatus] = useState<DeployStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { deploy } = useDeploy();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const utils = trpc.useUtils();

  // Format time display
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Computed values
  const firstHopTime = useMemo(() => {
    if (!route?.hops?.length) return null;
    return formatTime(route.hops[0].scheduledAt);
  }, [route]);

  const lastHopTime = useMemo(() => {
    if (!route?.hops?.length) return null;
    return formatTime(route.hops[route.hops.length - 1].scheduledAt);
  }, [route]);

  // Calculate total transactions needed for deployment
  // 1 transaction for initialize + ceil(hops/3) for adding hops in batches
  const HOPS_PER_BATCH = 3;
  const transactionCount = useMemo(() => {
    if (!route?.hops?.length) return 0;
    const hopBatches = Math.ceil(route.hops.length / HOPS_PER_BATCH);
    return 1 + hopBatches; // 1 init + N hop batches
  }, [route]);

  // Fetch deployment cost estimate
  const amountLamports = useMemo(() => {
    if (!route?.hopAmountRaw) return 0;
    return parseInt(route.hopAmountRaw, 10) || 0;
  }, [route]);

  // Token decimals for formatting routeFees in the route's native units.
  // SOL is always 9 decimals; for SPL we derive from the ratio of raw to
  // display amount on the route (same approach as the deploy pre-flight check).
  const tokenDecimals = useMemo(() => {
    if (!route) return 9;
    if (route.tokenType === "SOL") return 9;
    const rawAmount = parseInt(route.hopAmountRaw, 10) || 0;
    const displayAmount = parseFloat(route.hopAmountTokens);
    if (rawAmount > 0 && displayAmount > 0) {
      return Math.round(Math.log10(rawAmount / displayAmount));
    }
    return 6;
  }, [route]);

  const formatRouteFee = (baseUnits: number) => {
    const value = baseUnits / 10 ** tokenDecimals;
    // Choose precision: more decimals for SOL (9) than typical SPL tokens (6)
    const precision = route?.tokenType === "SOL" ? 6 : Math.min(tokenDecimals, 6);
    return value.toFixed(precision);
  };

  const feeTokenLabel = route?.tokenSymbol || route?.tokenType || "SOL";

  const costEstimate = trpc.contract.estimateDeploymentCost.useQuery(
    {
      hopCount: route?.hops?.length || 1,
      amountLamports,
      type: route?.tokenType || "SOL",
    },
    {
      enabled: isOpen && !!route && amountLamports > 0,
    }
  );

  // Fetch obfuscation cost estimate when route has obfuscation enabled
  const obfuscationCostEstimate = trpc.routes.getObfuscationCostEstimate.useQuery(
    { routeId: route?.routeId || 0 },
    {
      enabled: isOpen && !!route && route.hasObfuscation === true,
    }
  );

  const handleDeployNow = async () => {
    if (!route || !publicKey || !connection) return;

    setStatus("deploying");
    setErrorMessage(null);

    try {
      // Pre-flight: verify on-chain balances are sufficient before submitting.
      //
      // For obfuscated routes the funding txs transfer the route allocation
      // PLUS per-wallet SOL overhead (deployment share, aggregation reserve,
      // cleanup reservation, Wallet X cleanup buffer, ATA rent for SPL).
      // The frontend MUST check SOL against the gross up-front amount
      // returned by getObfuscationCostEstimate.requiredSolUpFrontLamports —
      // NOT the displayed "Net Privacy Cost", which is post-refund.
      const totalSpend = parseFloat(route.totalSpendTokens || route.hopAmountTokens);
      const hopAmountTokens = parseFloat(route.hopAmountTokens);

      // Always fetch SOL balance — we may need it for obfuscation overhead
      // even on SPL routes.
      let solLamports: number | null = null;
      try {
        solLamports = await connection.getBalance(publicKey);
      } catch {
        console.warn("[DeployModal] Failed to fetch SOL balance");
      }

      // Token-specific balance (for SPL, the SPL token account; for SOL,
      // mirrors solLamports).
      let tokenBalance: number | null = null;
      try {
        if (route.tokenType === "SOL") {
          tokenBalance =
            solLamports !== null ? solLamports / LAMPORTS_PER_SOL : null;
        } else if (route.tokenMint) {
          const mintPubkey = new PublicKey(route.tokenMint);
          const ata = getAssociatedTokenAddressSync(mintPubkey, publicKey, false);
          const accountInfo = await getAccount(connection, ata);
          // Derive decimals from the ratio of raw to display amount
          const rawAmount = parseInt(route.hopAmountRaw, 10) || 0;
          const decimals =
            rawAmount > 0 && hopAmountTokens > 0
              ? Math.round(Math.log10(rawAmount / hopAmountTokens))
              : 6;
          tokenBalance = Number(accountInfo.amount / BigInt(10 ** decimals));
        }
      } catch {
        // If balance check fails, proceed with deployment (fail on-chain instead)
        console.warn("[DeployModal] Pre-flight token balance check failed, proceeding anyway");
      }

      // Token-side check: do we have enough of the route's spend token?
      if (tokenBalance !== null && totalSpend > tokenBalance) {
        setStatus("error");
        setErrorMessage(
          `Insufficient balance. You're trying to deploy ${totalSpend.toLocaleString()} ` +
          `${route.tokenSymbol || route.tokenType} but your wallet only has ` +
          `${tokenBalance.toLocaleString()}. Please go back and adjust the amount.`
        );
        return;
      }

      // SOL-side check (only matters for obfuscated routes).
      // requiredSolUpFrontLamports = gross SOL the wallet must hold at funding
      // time. For SOL routes it already includes the route deposit; for SPL it
      // is just the obfuscation overhead.
      if (route.hasObfuscation) {
        try {
          // Refetch fresh — priority fees & dynamic fee cache may have moved
          // since the modal opened.
          const fresh = await utils.routes.getObfuscationCostEstimate.fetch(
            { routeId: route.routeId },
            { staleTime: 0 },
          );
          const requiredLamports = fresh?.data?.requiredSolUpFrontLamports;

          if (
            solLamports !== null &&
            typeof requiredLamports === "number" &&
            solLamports < requiredLamports
          ) {
            setStatus("error");
            const requiredSol = (requiredLamports / LAMPORTS_PER_SOL).toFixed(6);
            const haveSol = (solLamports / LAMPORTS_PER_SOL).toFixed(6);
            setErrorMessage(
              `Insufficient SOL for deployment. This route needs at least ${requiredSol} SOL ` +
              `in your wallet to cover the route amount, privacy wallet funding, and network ` +
              `fees, but your wallet only has ${haveSol} SOL. Most of this is refunded after ` +
              `cleanup, but you must hold the full amount up front.`
            );
            return;
          }
        } catch (err) {
          console.warn(
            "[DeployModal] Failed to refetch obfuscation cost estimate; proceeding without SOL pre-flight",
            err,
          );
        }
      }

      const deployData = {
        routeId: route.routeId,
        databaseId: route.id,
        hops: route.hops.map((hop) => ({
          recipient: hop.recipient,
          scheduledAt: new Date(hop.scheduledAt).getTime(),
          delayMinutes: hop.delayMinutes, // Pass delay metadata
          isCustomTime: hop.isCustomTime, // Pass custom time flag
        })),
        hopAmount: route.hopAmountRaw,
        splMint: route.tokenMint || undefined,
      };

      setStatus("confirming");
      await deploy(deployData, route.tokenType);
      setStatus("success");

      // Brief delay before calling success callback
      setTimeout(() => {
        onDeploySuccess();
      }, 1500);
    } catch (error: unknown) {
      console.error("Deploy error:", error);
      setStatus("error");
      setErrorMessage(extractErrorMessage(error, "Deployment failed"));
    }
  };

  const handleRetry = () => {
    setStatus("idle");
    setErrorMessage(null);
  };

  if (!isOpen || !route) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={status === "idle" || status === "error" ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--chinese-black-800)] border border-[var(--white-100-transparency-10)] p-6"
        style={{
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0px 1px 0px var(--white-100-transparency-08)",
        }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-medium text-[var(--white-100)] mb-1">
            {status === "success"
              ? "Route Deployed!"
              : status === "error"
              ? "Deployment Failed"
              : "Deploy Your Route"}
          </h2>
          {route.name && status === "idle" && (
            <p className="text-sm text-[var(--philippine-gray-500)]">
              {route.name}
            </p>
          )}
        </div>

        {/* Content based on status */}
        {status === "idle" && (
          <>
            {/* Route Summary */}
            <div className="bg-[var(--eerie-black-700)] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  Amount
                </span>
                <span className="text-[var(--white-100)] font-medium">
                  {route.totalSpendTokens || route.hopAmountTokens} {route.tokenSymbol || route.tokenType}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  Hops
                </span>
                <span className="text-[var(--white-100)] font-medium">
                  {route.hops.length}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  First Hop
                </span>
                <span className="text-[var(--white-100)] font-medium">
                  {firstHopTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--philippine-gray-500)]">
                  Completion
                </span>
                <span className="text-[var(--laser-lemon-500)] font-medium">
                  {lastHopTime}
                </span>
              </div>
            </div>

            {/* Cost Breakdown */}
            {costEstimate.data?.data && (
              <div className="bg-[var(--eerie-black-700)] rounded-2xl p-4 mb-6" data-testid="cost-breakdown">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-[var(--philippine-gray-500)]">
                      Execution Fees
                    </span>
                    <span className="text-xs text-[var(--philippine-gray-500)]/70">
                      0.02 base + {route.hops.length} hops × 0.002
                    </span>
                  </div>
                  <span className="text-[var(--white-100)] font-medium">
                    {costEstimate.data.data.breakdown.executorFundingSOL} SOL
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-[var(--philippine-gray-500)]">
                    Transaction Fees
                  </span>
                  <span className="text-[var(--white-100)] font-medium">
                    {costEstimate.data.data.breakdown.transactionFeesSOL} SOL
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-[var(--philippine-gray-500)]">
                      Account Rent
                    </span>
                    <span className="text-xs text-[var(--philippine-gray-500)]/70">
                      wSOL + route accounts
                    </span>
                  </div>
                  <span className="text-[var(--white-100)] font-medium">
                    {costEstimate.data.data.breakdown.accountRentSOL} SOL
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-[var(--philippine-gray-500)]">
                      Network Flat Fee
                    </span>
                    <span className="text-xs text-[var(--philippine-gray-500)]/70">
                      Configured per-route flat fee
                    </span>
                  </div>
                  <span className="text-[var(--white-100)] font-medium" data-testid="cost-flat-fee-value">
                    {costEstimate.data.data.breakdown.flatFeeSOL} SOL
                  </span>
                </div>
                <div className="border-t border-[var(--white-100-transparency-10)] my-3" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--white-100)]">
                    Total Cost
                  </span>
                  <span className="text-[var(--laser-lemon-500)] font-semibold" data-testid="cost-total-value">
                    {costEstimate.data.data.breakdown.totalCostSOL} SOL
                  </span>
                </div>

                {/* Platform Fee (percentage) — deducted from the user's
                    deposit, NOT additional infrastructure cost. Shown
                    separately so the Total Cost above stays in pure SOL
                    infra terms. The flat fee is already counted above
                    because it's a SOL lamport outflow regardless of token
                    type. */}
                <div className="border-t border-[var(--white-100-transparency-10)] my-3" />
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-[var(--philippine-gray-500)]">
                      Platform Fee ({((costEstimate.data.data.feeBps ?? 50) / 100).toFixed(1)}%)
                    </span>
                    <span className="text-xs text-[var(--philippine-gray-500)]/70">
                      Deducted from your deposit
                    </span>
                  </div>
                  <span className="text-[var(--white-100)] font-medium" data-testid="cost-platform-fee-value">
                    {formatRouteFee(costEstimate.data.data.routeFees.percentageFee)} {feeTokenLabel}
                  </span>
                </div>
              </div>
            )}

            {/* Abstraction Cost Breakdown - Only shown when route has obfuscation */}
            {route.hasObfuscation && (
              <div className="bg-[var(--eerie-black-700)] rounded-2xl p-4 mb-6">
                {/* Header with privacy icon */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-[var(--laser-lemon-500)]/20 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-[var(--laser-lemon-500)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-[var(--white-100)]">
                    Privacy Protection Costs
                  </span>
                </div>

                {/* Loading state */}
                {obfuscationCostEstimate.isLoading && (
                  <div className="flex items-center justify-center py-3">
                    <div className="w-4 h-4 border-2 border-[var(--laser-lemon-500)] border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-[var(--philippine-gray-500)]">
                      Calculating...
                    </span>
                  </div>
                )}

                {/* Error state */}
                {obfuscationCostEstimate.isError && (
                  <div className="text-sm text-red-400 text-center py-2">
                    Unable to calculate abstraction costs
                  </div>
                )}

                {/* Cost data */}
                {obfuscationCostEstimate.data?.success && obfuscationCostEstimate.data.data && (
                  <>
                    {/* Privacy Wallets count */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--philippine-gray-500)]">
                        Privacy Wallets
                      </span>
                      <span className="text-[var(--white-100)] font-medium">
                        {obfuscationCostEstimate.data.data.intermediateCount}
                      </span>
                    </div>

                    {/* Transaction Fees */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--philippine-gray-500)]">
                        Transaction Fees
                      </span>
                      <span className="text-[var(--white-100)] font-medium">
                        {obfuscationCostEstimate.data.data.breakdown.transactionFeesSOL} SOL
                      </span>
                    </div>

                    {/* Account Deposits (SPL only) */}
                    {obfuscationCostEstimate.data.data.tokenType === "SPL" && (
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-[var(--philippine-gray-500)]">
                          Account Deposits
                        </span>
                        <span className="text-[var(--white-100)] font-medium">
                          {obfuscationCostEstimate.data.data.breakdown.accountDepositsSOL} SOL
                        </span>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-[var(--white-100-transparency-10)] my-3" />

                    {/* Refundable Section - Green styling */}
                    <div className="bg-emerald-500/10 rounded-xl p-3 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="w-4 h-4 text-emerald-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                          Returned After Completion
                        </span>
                      </div>

                      {/* Rent Recovery (SPL only) */}
                      {obfuscationCostEstimate.data.data.tokenType === "SPL" && (
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-[var(--philippine-gray-500)]">
                            Account Rent Recovery
                          </span>
                          <span className="text-emerald-400 font-medium">
                            +{obfuscationCostEstimate.data.data.breakdown.refundableSOL} SOL
                          </span>
                        </div>
                      )}

                      {/* Dust Refund */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--philippine-gray-500)]">
                          Dust Refund
                        </span>
                        <span className="text-emerald-400 font-medium">
                          +{obfuscationCostEstimate.data.data.breakdown.dustRefundSOL} SOL
                        </span>
                      </div>
                    </div>

                    {/* Required Up Front (gross — must be in wallet at funding time) */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[var(--white-100)]">
                          Required Up Front
                        </span>
                        <span className="text-xs text-[var(--philippine-gray-500)]/70">
                          Must be in your wallet to deploy
                        </span>
                      </div>
                      <span className="text-[var(--laser-lemon-500)] font-semibold">
                        {obfuscationCostEstimate.data.data.breakdown.requiredSolUpFrontSOL} SOL
                      </span>
                    </div>

                    {/* Net Privacy Cost (after refunds) */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-[var(--philippine-gray-500)]">
                        Net Privacy Cost (after refunds)
                      </span>
                      <span className="text-[var(--white-100)] font-medium">
                        {obfuscationCostEstimate.data.data.breakdown.netCostSOL} SOL
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Transaction count notice for routes with >4 hops */}
            {route.hops.length > 4 && (
              <div className="flex items-center gap-3 bg-[var(--laser-lemon-500)]/10 border border-[var(--laser-lemon-500)]/30 rounded-xl p-3 mb-6">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--laser-lemon-500)]/20 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-[var(--laser-lemon-500)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-[var(--laser-lemon-500)]">
                  This route requires{" "}
                  <span className="font-semibold">
                    {transactionCount} wallet approvals
                  </span>{" "}
                  to deploy
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-3xl border border-[var(--white-100-transparency-20)] text-[var(--white-100)] font-medium transition hover:bg-[var(--white-100-transparency-05)]"
              >
                Deploy Later
              </button>
              <button
                type="button"
                data-testid="deploy-now-btn"
                onClick={handleDeployNow}
                className="flex-1 h-12 rounded-3xl bg-[var(--laser-lemon-500)] text-[var(--black-900)] font-medium transition hover:brightness-95"
              >
                Deploy Now
              </button>
            </div>
          </>
        )}

        {(status === "deploying" || status === "confirming") && (
          <div className="py-8 text-center">
            {/* Loading spinner */}
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-[var(--laser-lemon-500)] border-t-transparent rounded-full animate-spin" />
            <p className="text-[var(--white-100)] font-medium mb-1">
              {status === "deploying"
                ? "Please sign the transaction..."
                : "Confirming transaction..."}
            </p>
            <p className="text-sm text-[var(--philippine-gray-500)]">
              {status === "deploying"
                ? "Check your wallet for the signing request"
                : "Waiting for blockchain confirmation"}
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-8 text-center" data-testid="deploy-success">
            {/* Success checkmark */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--laser-lemon-500)] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[var(--black-900)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-[var(--white-100)] font-medium mb-1">
              Your route is now live!
            </p>
            <p className="text-sm text-[var(--philippine-gray-500)]">
              Hops will execute according to schedule
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            {/* Error icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-[var(--white-100)] font-medium mb-1 text-center">
              Deployment failed
            </p>
            {errorMessage && (
              <p className="text-sm text-red-400 text-center mb-6 px-2">
                {errorMessage}
              </p>
            )}

            {/* Retry buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-3xl border border-[var(--white-100-transparency-20)] text-[var(--white-100)] font-medium transition hover:bg-[var(--white-100-transparency-05)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="flex-1 h-12 rounded-3xl bg-[var(--laser-lemon-500)] text-[var(--black-900)] font-medium transition hover:brightness-95"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
