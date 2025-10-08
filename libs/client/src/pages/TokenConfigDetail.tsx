import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { TokenConfigForm } from "../components/TokenConfigForm";
import { trpc } from "../trpc";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useUpdateTokenConfig } from "../hooks";

interface TokenConfig {
  id: number;
  tokenConfigAddress: string;
  creator: string;
  minTransferAmount: number;
  feeBps: number;
  feeTreasury: string;
  maxHops: number;
  maxDelaySeconds: number;
  timelockSeconds: number;
  flatFeeLamports: number;
  pairAddress: string;
  tokenDecimals: number;
}

export const TokenConfigDetail: React.FC = () => {
  const { publicKey } = useWallet();
  const { tokenConfigId } = useParams({ strict: false });
  const { connection } = useConnection();
  const { handleUpdateTokenConfig, handleUpdateTokenConfigSOL } =
    useUpdateTokenConfig({
      publicKey: publicKey,
    });
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const { data: tokenConfig, isLoading: loading } =
    trpc.tokenConfigs.getTokenConfigById.useQuery(Number(tokenConfigId), {
      enabled: !!tokenConfigId,
    });

  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  const formatLamports = (lamports: number) => {
    return (lamports / 1_000_000_000).toFixed(6);
  };

  const formatFeeBps = (bps: number) => {
    return (bps / 100).toFixed(2);
  };

  const getTokenDecimals = useCallback(async () => {
    if (!tokenConfig) {
      return 6;
    }
    try {
      const mintPublicKey = new PublicKey(tokenConfig.tokenMint);
      const mintInfo = await getMint(connection, mintPublicKey);
      return mintInfo.decimals;
    } catch (error) {
      console.error("Error fetching token decimals:", error);
      return 6;
    }
  }, [tokenConfig, connection]);

  useEffect(() => {
    getTokenDecimals().then(setTokenDecimals);
  }, [getTokenDecimals]);

  const isSPL = useMemo(() => {
    return !tokenConfig?.tokenMint.startsWith(
      "So11111111111111111111111111111111111111112"
    );
  }, [tokenConfig]);

  const handleUpdate = async (updatedConfig: any) => {
    debugger;
    if (isSPL) {
      await handleUpdateTokenConfig(updatedConfig);
    } else {
      await handleUpdateTokenConfigSOL(updatedConfig);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!tokenConfig) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Token Config Not Found
            </h2>
            <p className="text-gray-600 mb-4">
              The requested token configuration could not be found.
            </p>
            <button
              onClick={() => navigate({ to: "/multihopper" })}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Back to Multihopper
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate({ to: "/multihopper" })}
                className="text-blue-500 hover:text-blue-700 mb-2 inline-flex items-center"
              >
                ← Back to Multihopper
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Token Config #{formatAddress(tokenConfig.tokenMint)}
              </h1>
              <p className="text-gray-600 mt-1">
                Configuration details and update form
              </p>
            </div>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                isEditing
                  ? "bg-gray-500 text-white hover:bg-gray-600"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {isEditing ? "Cancel Edit" : "Edit Config"}
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Update Token Configuration
            </h2>
            <TokenConfigForm
              type={isSPL ? "SOL" : "SPL"}
              isUpdate
              creator={tokenConfig.creator}
              feeTreasury={tokenConfig.feeTreasury}
              onSubmit={handleUpdate}
              initialValues={{
                address: tokenConfig.tokenMint,
                minTransferAmount: (
                  tokenConfig.minTransferAmount /
                  10 ** tokenDecimals
                ).toString(),
                feePercentage: Number(tokenConfig.feeBps / 100).toString(),
                feeTreasury: tokenConfig.feeTreasury,
                maxHops: tokenConfig.maxHops.toString(),
                maxDelayHours: (tokenConfig.maxDelaySeconds / 3600).toString(),
                timelockHours: (tokenConfig.timelockSeconds / 3600).toString(),
                flatFeeSol: (
                  tokenConfig.flatFeeLamports / 1_000_000_000
                ).toString(),
              }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Configuration Details
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Token Mint
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">{tokenConfig.tokenMint}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Config Address
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span
                        className="font-mono text-sm"
                        title={tokenConfig.tokenConfigAddress}
                      >
                        {tokenConfig.tokenConfigAddress}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Creator
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span
                        className="font-mono text-sm"
                        title={tokenConfig.creator}
                      >
                        {tokenConfig.creator}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fee Treasury
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span
                        className="font-mono text-sm"
                        title={tokenConfig.feeTreasury}
                      >
                        {tokenConfig.feeTreasury}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pair Address
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span
                        className="font-mono text-sm"
                        title={tokenConfig.pairAddress}
                      >
                        {tokenConfig.pairAddress}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Transfer Amount
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">
                        {(
                          tokenConfig.minTransferAmount /
                          10 ** tokenDecimals
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fee Percentage
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">
                        {formatFeeBps(tokenConfig.feeBps)}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum Hops
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">{tokenConfig.maxHops}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum Delay
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">
                        {formatDuration(tokenConfig.maxDelaySeconds)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timelock Duration
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">
                        {formatDuration(tokenConfig.timelockSeconds)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Flat Fee (SOL)
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-sm">
                        {formatLamports(tokenConfig.flatFeeLamports)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
