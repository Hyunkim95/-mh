import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  TokenConfigInput,
  HumanReadableTokenConfigInput,
  convertHumanReadableToTokenConfigInput,
} from "../types/tokenConfig";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { trpc } from "../trpc";

export interface TokenConfigFormProps {
  type: "SPL" | "SOL";
  creator: string;
  feeTreasury: string;
  isUpdate?: boolean;
  onSubmit: (data: { address: string; tokenConfig: TokenConfigInput }) => void;
  isLoading?: boolean;
  error?: string;
  tokenDecimals?: number;
  initialValues?: {
    address?: string;
    minTransferAmount?: string;
    feePercentage?: string;
    feeTreasury?: string;
    maxHops?: string;
    maxDelayHours?: string;
    timelockHours?: string;
    flatFeeSol?: string;
  };
}

export const TokenConfigForm: React.FC<TokenConfigFormProps> = ({
  type,
  creator,
  feeTreasury,
  isUpdate = false,
  onSubmit,
  isLoading = false,
  error,
  tokenDecimals = 6,
  initialValues,
}) => {
  const [address, setAddress] = useState(initialValues?.address || creator);
  const [detectedDecimals, setDetectedDecimals] =
    useState<number>(tokenDecimals);
  const [isDetectingDecimals, setIsDetectingDecimals] = useState(false);
  const [decimalsError, setDecimalsError] = useState<string>("");
  const [inputMode, setInputMode] = useState<"select" | "manual">(
    initialValues?.address ? "manual" : "select"
  );
  const [selectedTokenId, setSelectedTokenId] = useState<string>(
    initialValues?.address || ""
  );
  const { connection } = useConnection();

  // Fetch token accounts for SPL tokens
  const { data: tokenAccounts, isLoading: isLoadingTokens } =
    trpc.tokens.getTokenAccounts.useQuery(undefined, {
      enabled: type === "SPL",
    });

  const [humanReadableConfig, setHumanReadableConfig] =
    useState<HumanReadableTokenConfigInput>({
      minTransferAmount: initialValues?.minTransferAmount || "0.001",
      feePercentage: initialValues?.feePercentage || "5",
      feeTreasury: initialValues?.feeTreasury || feeTreasury,
      maxHops: initialValues?.maxHops || "5",
      maxDelayHours: initialValues?.maxDelayHours || "1",
      timelockHours: initialValues?.timelockHours || "0",
      flatFeeSol: initialValues?.flatFeeSol || "0.001",
    });

  // Detect token decimals when address changes (for SPL tokens only)
  useEffect(() => {
    const detectDecimals = async () => {
      if (type !== "SPL" || !address || !connection) {
        setDetectedDecimals(type === "SOL" ? 9 : 6);
        return;
      }

      try {
        setIsDetectingDecimals(true);
        setDecimalsError("");

        const mintPublicKey = new PublicKey(address);
        const mintInfo = await getMint(connection, mintPublicKey);

        setDetectedDecimals(mintInfo.decimals);
        console.log(
          `Detected ${mintInfo.decimals} decimals for token ${address}`
        );
      } catch (error) {
        console.warn("Could not fetch token decimals:", error);
        setDecimalsError("Could not detect token decimals. Using default (6).");
        setDetectedDecimals(6);
      } finally {
        setIsDetectingDecimals(false);
      }
    };

    // Debounce the detection to avoid too many API calls
    const timeoutId = setTimeout(detectDecimals, 500);
    return () => clearTimeout(timeoutId);
  }, [address, type, connection]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // Convert human-readable input to the internal format using detected decimals
      const tokenConfig = convertHumanReadableToTokenConfigInput(
        humanReadableConfig,
        detectedDecimals
      );
      onSubmit({ address, tokenConfig });
    },
    [address, humanReadableConfig, detectedDecimals, onSubmit]
  );

  const handleConfigChange = (
    field: keyof HumanReadableTokenConfigInput,
    value: string
  ) => {
    setHumanReadableConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTokenSelect = (tokenId: string) => {
    setSelectedTokenId(tokenId);
    setAddress(tokenId);
  };

  const getTokenImage = (token: any) => {
    return token?.content?.files?.[0]?.cdn_uri || null;
  };

  const getTokenName = (token: any) => {
    return token?.content?.metadata?.name || "Unknown Token";
  };

  const getTokenSymbol = (token: any) => {
    return token?.content?.metadata?.symbol || "";
  };

  const getDefaultTokenSvg = () => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" fill="#E5E7EB" />
      <circle cx="12" cy="12" r="6" fill="#9CA3AF" />
      <circle cx="12" cy="12" r="3" fill="#6B7280" />
    </svg>
  );

  const buttonLabel = useMemo(() => {
    if (isLoading) {
      if (isUpdate) {
        return "Updating...";
      } else {
        return "Creating...";
      }
    }
    if (type === "SPL" && isDetectingDecimals) {
      return "Detecting decimals...";
    }
    if (isUpdate) {
      return "Update Token Config";
    } else {
    }
    return `Initialize ${type} Token Config`;
  }, [isUpdate, type]);

  const baseInputStyles =
    "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelStyles = "block text-sm font-medium text-gray-700 mb-1";
  const containerStyles = "mb-4";

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">
        Initialize {type} Token Config
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Address Input */}
        <div className={containerStyles}>
          <label className={labelStyles}>
            {type === "SPL" ? "SPL Token" : "Creator Address"}
          </label>

          {type === "SPL" ? (
            <div>
              {/* Input Mode Toggle */}
              <div className="flex mb-3 space-x-2">
                <button
                  type="button"
                  onClick={() => setInputMode("select")}
                  className={`px-3 py-1 rounded-md text-sm ${
                    inputMode === "select"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Select from Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("manual")}
                  className={`px-3 py-1 rounded-md text-sm ${
                    inputMode === "manual"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Manual Input
                </button>
              </div>

              {inputMode === "select" ? (
                <div>
                  {isLoadingTokens ? (
                    <div className="p-4 text-center text-gray-500">
                      Loading wallet tokens...
                    </div>
                  ) : tokenAccounts && tokenAccounts.length > 0 ? (
                    <select
                      value={selectedTokenId}
                      onChange={(e) => handleTokenSelect(e.target.value)}
                      className={baseInputStyles}
                      required
                      disabled={isUpdate}
                    >
                      <option value="">Select a token from your wallet</option>
                      {tokenAccounts.map((token: any) => {
                        const name = getTokenName(token);
                        const symbol = getTokenSymbol(token);
                        return (
                          <option key={token.id} value={token.id}>
                            {name}
                            {symbol ? ` (${symbol})` : ""} -{" "}
                            {token.id.slice(0, 8)}...
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <div className="p-4 text-center text-gray-500 border border-gray-300 rounded-md">
                      No tokens found in wallet. Use manual input instead.
                    </div>
                  )}

                  {/* Selected Token Display */}
                  {selectedTokenId && tokenAccounts && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md flex items-center space-x-3">
                      <div className="w-8 h-8 flex-shrink-0">
                        {(() => {
                          const selectedToken = tokenAccounts.find(
                            (t: any) => t.id === selectedTokenId
                          );
                          const imageUrl = getTokenImage(selectedToken);
                          return imageUrl ? (
                            <img
                              src={imageUrl}
                              alt="Token"
                              className="w-8 h-8 rounded-full"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden"
                                );
                              }}
                            />
                          ) : null;
                        })()}
                        <div
                          className={`w-8 h-8 flex items-center justify-center ${(() => {
                            const selectedToken = tokenAccounts.find(
                              (t: any) => t.id === selectedTokenId
                            );
                            const imageUrl = getTokenImage(selectedToken);
                            return imageUrl ? "hidden" : "";
                          })()}`}
                        >
                          {getDefaultTokenSvg()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const selectedToken = tokenAccounts.find(
                            (t: any) => t.id === selectedTokenId
                          );
                          const name = getTokenName(selectedToken);
                          const symbol = getTokenSymbol(selectedToken);
                          return (
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {name}
                                {symbol ? ` (${symbol})` : ""}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {selectedTokenId}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={address}
                  disabled={isUpdate}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter SPL token mint address"
                  className={baseInputStyles}
                  required
                />
              )}
            </div>
          ) : (
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter creator wallet address"
              className={baseInputStyles}
              required
            />
          )}

          {/* Token Decimals Detection Info */}
          {type === "SPL" && (
            <div className="mt-2">
              {isDetectingDecimals ? (
                <p className="text-xs text-blue-600">
                  🔍 Detecting token decimals...
                </p>
              ) : decimalsError ? (
                <p className="text-xs text-orange-600">⚠️ {decimalsError}</p>
              ) : detectedDecimals !== 6 ? (
                <p className="text-xs text-green-600">
                  ✅ Detected {detectedDecimals} decimal places for this token
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Using {detectedDecimals} decimal places
                </p>
              )}
            </div>
          )}
        </div>

        {/* Token Config Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={containerStyles}>
            <label className={labelStyles}>
              Minimum Transfer Amount
              <span className="text-xs text-gray-500 ml-1">
                ({type === "SPL" ? "tokens" : "SOL"})
              </span>
            </label>
            <input
              type="number"
              step="any"
              value={humanReadableConfig.minTransferAmount}
              onChange={(e) =>
                handleConfigChange("minTransferAmount", e.target.value)
              }
              placeholder="0.001"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum amount that can be transferred in a single hop
              {type === "SPL" && detectedDecimals !== 6 && (
                <span className="text-blue-600">
                  {" "}
                  (using {detectedDecimals} decimals)
                </span>
              )}
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Fee Percentage
              <span className="text-xs text-gray-500 ml-1">(%)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={humanReadableConfig.feePercentage}
              onChange={(e) =>
                handleConfigChange("feePercentage", e.target.value)
              }
              placeholder="5.0"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Percentage fee charged per transaction (e.g., 5 = 5%)
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Fee Treasury Address</label>
            <input
              type="text"
              value={humanReadableConfig.feeTreasury}
              onChange={(e) =>
                handleConfigChange("feeTreasury", e.target.value)
              }
              placeholder="Treasury wallet address"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Wallet address where fees will be collected
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>Maximum Hops</label>
            <input
              type="number"
              min="1"
              max="10"
              value={humanReadableConfig.maxHops}
              onChange={(e) => handleConfigChange("maxHops", e.target.value)}
              placeholder="5"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum number of hops allowed in a route
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Maximum Delay
              <span className="text-xs text-gray-500 ml-1">(hours)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={humanReadableConfig.maxDelayHours}
              onChange={(e) =>
                handleConfigChange("maxDelayHours", e.target.value)
              }
              placeholder="1.0"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum delay allowed between hops
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Timelock Duration
              <span className="text-xs text-gray-500 ml-1">(hours)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={humanReadableConfig.timelockHours}
              onChange={(e) =>
                handleConfigChange("timelockHours", e.target.value)
              }
              placeholder="0"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Time tokens are locked before being available
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Flat Fee
              <span className="text-xs text-gray-500 ml-1">(SOL)</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={humanReadableConfig.flatFeeSol}
              onChange={(e) => handleConfigChange("flatFeeSol", e.target.value)}
              placeholder="0.001"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Fixed fee in SOL charged per transaction
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || (type === "SPL" && isDetectingDecimals)}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            isLoading || (type === "SPL" && isDetectingDecimals)
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          } text-white`}
        >
          {buttonLabel}
        </button>
      </form>
    </div>
  );
};
