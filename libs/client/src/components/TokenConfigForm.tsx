import React, { useState, useMemo, useCallback } from "react";
import {
  TokenConfigInput,
  HumanReadableTokenConfigInput,
  convertHumanReadableToTokenConfigInput,
} from "../types/tokenConfig";

export interface TokenConfigFormProps {
  type: "SPL" | "SOL";
  creator: string;
  feeTreasury: string;
  isUpdate?: boolean;
  onSubmit: (data: { tokenConfig: TokenConfigInput }) => void;
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
  feeTreasury,
  isUpdate = false,
  onSubmit,
  isLoading = false,
  error,
  initialValues,
}) => {
  const [humanReadableConfig, setHumanReadableConfig] =
    useState<HumanReadableTokenConfigInput>({
      minTransferAmount: initialValues?.minTransferAmount || "0.001",
      feeBps: initialValues?.feePercentage || "5",
      feeTreasury: initialValues?.feeTreasury || feeTreasury,
      maxHops: initialValues?.maxHops || "5",
      maxDelayHours: initialValues?.maxDelayHours || "1",
      timelockHours: initialValues?.timelockHours || "0",
      flatFeeLamport: initialValues?.flatFeeSol || "0.001",
    });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // Convert human-readable input to the internal format using detected decimals
      const tokenConfig = convertHumanReadableToTokenConfigInput(
        humanReadableConfig,
      );
      onSubmit({ tokenConfig });
    },
    [humanReadableConfig, onSubmit]
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


  const buttonLabel = useMemo(() => {
    if (isLoading) {
      if (isUpdate) {
        return "Updating...";
      } else {
        return "Creating...";
      }
    }
    if (isUpdate) {
      return "Update Token Config";
    } else {
    }
    return `Initialize Token Config`;
  }, [isUpdate]);

  const baseInputStyles =
    "w-full px-3 py-2 border border-[var(--white-100-transparency-10)] bg-[var(--chinese-black-800)] text-[var(--white-100)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--laser-lemon-500)]";
  const labelStyles = "block text-sm font-medium text-[var(--white-100-transparency-70)] mb-1";
  const containerStyles = "mb-4";

  return (
    <div className="max-w-2xl mx-auto p-6 bg-[var(--eerie-black-700)] rounded-lg shadow-md border border-[var(--white-100-transparency-10)]">
      <h2 className="text-2xl font-bold mb-6 text-[var(--white-100)]">
        Initialize Token Config
      </h2>

      <form onSubmit={handleSubmit}>

        {/* Token Config Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className={containerStyles}>
            <label className={labelStyles}>
              Fee Percentage
              <span className="text-xs text-[var(--philippine-gray-500)] ml-1">(%)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={humanReadableConfig.feeBps}
              onChange={(e) =>
                handleConfigChange("feeBps", e.target.value)
              }
              placeholder="5.0"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-[var(--philippine-gray-500)] mt-1">
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
            <p className="text-xs text-[var(--philippine-gray-500)] mt-1">
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
            <p className="text-xs text-[var(--philippine-gray-500)] mt-1">
              Maximum number of hops allowed in a route
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Maximum Delay
              <span className="text-xs text-[var(--philippine-gray-500)] ml-1">(hours)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              disabled
              value={humanReadableConfig.maxDelayHours}
              onChange={(e) =>
                handleConfigChange("maxDelayHours", e.target.value)
              }
              placeholder="1.0"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-[var(--philippine-gray-500)] mt-1">
              Maximum delay allowed between hops
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Timelock Duration
              <span className="text-xs text-[var(--philippine-gray-500)] ml-1">(hours)</span>
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
            <p className="text-xs text-[var(--philippine-gray-500)] mt-1">
              Time tokens are locked before being available
            </p>
          </div>

          <div className={containerStyles}>
            <label className={labelStyles}>
              Flat Fee
              <span className="text-xs text-[var(--philippine-gray-500)] ml-1">(SOL)</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={humanReadableConfig.flatFeeLamport}
              onChange={(e) => handleConfigChange("flatFeeLamport", e.target.value)}
              placeholder="0.001"
              className={baseInputStyles}
              required
            />
            <p className="text-xs text-[var(--philippine-gray-500)] mt-1">
              Fixed fee in SOL charged per transaction
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-900 border border-red-500 text-red-200 rounded">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            isLoading
              ? "bg-[var(--dark-gunmetal-500)] cursor-not-allowed text-[var(--white-100-transparency-50)]"
              : "bg-[var(--laser-lemon-500)] hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[var(--laser-lemon-500)] text-[var(--black-900)]"
          }`}
        >
          {buttonLabel}
        </button>
      </form>
    </div>
  );
};
