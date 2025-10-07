import React, { useState, useEffect } from "react";
import {
  TokenConfigInput,
  HumanReadableTokenConfigInput,
  convertHumanReadableToTokenConfigInput,
} from "../types/tokenConfig";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

export interface TokenConfigFormProps {
  type: "SPL" | "SOL";
  onSubmit: (data: { address: string; tokenConfig: TokenConfigInput }) => void;
  isLoading?: boolean;
  error?: string;
  tokenDecimals?: number; // For SPL tokens, allows customization of decimal places
}

export const TokenConfigForm: React.FC<TokenConfigFormProps> = ({
  type,
  onSubmit,
  isLoading = false,
  error,
  tokenDecimals = 6,
}) => {
  const [address, setAddress] = useState(
    "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
  );
  const [detectedDecimals, setDetectedDecimals] =
    useState<number>(tokenDecimals);
  const [isDetectingDecimals, setIsDetectingDecimals] = useState(false);
  const [decimalsError, setDecimalsError] = useState<string>("");
  const { connection } = useConnection();

  const [humanReadableConfig, setHumanReadableConfig] =
    useState<HumanReadableTokenConfigInput>({
      minTransferAmount: "0.001", // Human readable: 0.001 tokens
      feePercentage: "5", // Human readable: 5%
      feeTreasury: "4jLPFoW7at66h6WhyCZmcskpn3jgR1uQ9CJdTLfe9hVH",
      maxHops: "5",
      maxDelayHours: "1", // Human readable: 1 hour
      timelockHours: "0", // Human readable: 0 hours
      flatFeeSol: "0.001", // Human readable: 0.001 SOL
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Convert human-readable input to the internal format using detected decimals
    const tokenConfig = convertHumanReadableToTokenConfigInput(
      humanReadableConfig,
      detectedDecimals
    );
    onSubmit({ address, tokenConfig });
  };

  const handleConfigChange = (
    field: keyof HumanReadableTokenConfigInput,
    value: string
  ) => {
    setHumanReadableConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

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
            {type === "SPL" ? "SPL Token Address" : "Creator Address"}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={
              type === "SPL"
                ? "Enter SPL token mint address"
                : "Enter creator wallet address"
            }
            className={baseInputStyles}
            required
          />

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
          {isLoading
            ? "Creating..."
            : type === "SPL" && isDetectingDecimals
            ? "Detecting decimals..."
            : `Initialize ${type} Token Config`}
        </button>
      </form>
    </div>
  );
};
