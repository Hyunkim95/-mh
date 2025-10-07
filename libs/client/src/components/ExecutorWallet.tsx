import React, { useState } from "react";
import { useExecutor } from "../hooks/useExecutor";
import { BN } from "bn.js";

export interface ExecutorWalletProps {
  routeId: number;
  className?: string;
}

export const ExecutorWallet: React.FC<ExecutorWalletProps> = ({
  routeId,
  className = "",
}) => {
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  const {
    publicKey,
    balance,
    balanceSOL,
    withdraw,
    isLoading,
    isWithdrawing,
    error,
    refetchBalance,
  } = useExecutor(routeId);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawTo || !withdrawAmount) return;

    try {
      // Convert SOL to lamports for withdrawal
      const lamports = new BN(parseFloat(withdrawAmount) * 1e9);
      await withdraw(withdrawTo, lamports.toString());

      // Reset form
      setWithdrawTo("");
      setWithdrawAmount("");
      setShowWithdrawForm(false);
    } catch (err) {
      console.error("Withdrawal failed:", err);
    }
  };

  const formatPublicKey = (key: string | null) => {
    console.log("key", key);
    if (!key) return "Loading...";
    return key;
  };

  const baseInputStyles =
    "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelStyles = "block text-sm font-medium text-gray-700 mb-1";
  const buttonStyles =
    "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2";

  if (isLoading) {
    return (
      <div className={`p-6 bg-white rounded-lg shadow-md ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 bg-white rounded-lg shadow-md ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">Executor Wallet</h3>
        <span className="text-sm text-gray-500">Route #{routeId}</span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          Error: {error.message}
        </div>
      )}

      {/* Wallet Info */}
      <div className="space-y-4 mb-6">
        <div>
          <label className={labelStyles}>Public Key</label>
          <div className="p-3 bg-gray-50 rounded-md font-mono text-sm text-gray-800">
            {formatPublicKey(publicKey)}
          </div>
          {publicKey && (
            <button
              onClick={() => navigator.clipboard.writeText(publicKey)}
              className="mt-1 text-xs text-blue-600 hover:text-blue-800"
            >
              Copy full address
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyles}>Balance (SOL)</label>
            <div className="p-3 bg-gray-50 rounded-md font-mono text-lg text-gray-800">
              {balanceSOL !== null
                ? `${balanceSOL.toFixed(9)} SOL`
                : "Loading..."}
            </div>
          </div>
          <div>
            <label className={labelStyles}>Balance (Lamports)</label>
            <div className="p-3 bg-gray-50 rounded-md font-mono text-sm text-gray-800">
              {balance !== null ? balance.toString() : "Loading..."}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 mb-6">
        <button
          onClick={() => refetchBalance()}
          disabled={isLoading}
          className={`${buttonStyles} bg-blue-500 hover:bg-blue-600 focus:ring-blue-500 text-white ${
            isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Refresh Balance
        </button>

        <button
          onClick={() => setShowWithdrawForm(!showWithdrawForm)}
          disabled={isLoading || !balance || balance.isZero()}
          className={`${buttonStyles} bg-green-500 hover:bg-green-600 focus:ring-green-500 text-white ${
            isLoading || !balance || balance.isZero()
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          {showWithdrawForm ? "Cancel" : "Withdraw"}
        </button>
      </div>

      {/* Withdraw Form */}
      {showWithdrawForm && (
        <form onSubmit={handleWithdraw} className="border-t pt-6">
          <h4 className="font-semibold text-gray-800 mb-4">Withdraw Funds</h4>

          <div className="space-y-4">
            <div>
              <label className={labelStyles}>Recipient Address</label>
              <input
                type="text"
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
                placeholder="Enter recipient wallet address"
                className={baseInputStyles}
                required
              />
            </div>

            <div>
              <label className={labelStyles}>
                Amount (SOL)
                {balanceSOL && (
                  <span className="ml-2 text-sm text-gray-500">
                    (Max: {balanceSOL.toFixed(9)})
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.000000001"
                min="0"
                max={balanceSOL || undefined}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Enter amount in SOL"
                className={baseInputStyles}
                required
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={isWithdrawing || !withdrawTo || !withdrawAmount}
                className={`${buttonStyles} bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white ${
                  isWithdrawing || !withdrawTo || !withdrawAmount
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {isWithdrawing ? "Withdrawing..." : "Confirm Withdrawal"}
              </button>

              <button
                type="button"
                onClick={() => setShowWithdrawForm(false)}
                className={`${buttonStyles} bg-gray-500 hover:bg-gray-600 focus:ring-gray-500 text-white`}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
