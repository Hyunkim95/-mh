import React, { useState, useEffect, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { trpc } from "../trpc";

export interface TokenSelectorProps {
  value?: string;
  onChange: (tokenMint: string, tokenDecimals: number) => void;
  onDecimalsDetected?: (decimals: number) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  useConfiguredTokensOnly?: boolean; // Use crossSectionWithTokenConfigs instead of getTokenAccounts
}

export const TokenSelector: React.FC<TokenSelectorProps> = ({
  value = "",
  onChange,
  onDecimalsDetected,
  placeholder = "Select a token from your wallet",
  required = false,
  className = "",
  useConfiguredTokensOnly = false,
}) => {
  const [inputMode, setInputMode] = useState<"select" | "manual">("select");
  const [selectedTokenId, setSelectedTokenId] = useState<string>(value);
  const [manualAddress, setManualAddress] = useState<string>(value);
  const [detectedDecimals, setDetectedDecimals] = useState<number>(6);
  const [isDetectingDecimals, setIsDetectingDecimals] = useState(false);
  const [decimalsError, setDecimalsError] = useState<string>("");
  const { connection } = useConnection();

  // Query tokens based on configuration
  const { data: allTokens, isLoading: isLoadingAllTokens } =
    trpc.tokens.getTokenAccounts.useQuery(undefined, {
      enabled: !useConfiguredTokensOnly,
    });

  const { data: configuredTokensData, isLoading: isLoadingConfiguredTokens } =
    trpc.tokens.crossSectionWithTokenConfigs.useQuery(undefined, {
      enabled: useConfiguredTokensOnly,
    });

  const tokenAccounts = useConfiguredTokensOnly
    ? configuredTokensData?.tokens
    : allTokens;
  const isLoadingTokens = useConfiguredTokensOnly
    ? isLoadingConfiguredTokens
    : isLoadingAllTokens;

  // Sync with external value changes
  useEffect(() => {
    setSelectedTokenId(value);
    setManualAddress(value);
  }, [value]);

  const detectDecimals = useCallback(
    async (address: string) => {
      if (!address || !connection) {
        setDetectedDecimals(6);
        return;
      }

      try {
        setIsDetectingDecimals(true);
        setDecimalsError("");

        const mintPublicKey = new PublicKey(address);
        const mintInfo = await getMint(connection, mintPublicKey);

        setDetectedDecimals(mintInfo.decimals);
        onDecimalsDetected?.(mintInfo.decimals);
        onChange(address, mintInfo.decimals);
      } catch (error) {
        console.error(error);
        setDecimalsError("Could not detect token decimals. Using default (6).");
        setDetectedDecimals(6);
        onDecimalsDetected?.(6);
        onChange(address, 6);
      } finally {
        setIsDetectingDecimals(false);
      }
    },
    [connection, onChange, onDecimalsDetected]
  );

  const handleTokenSelect = (tokenId: string) => {
    setSelectedTokenId(tokenId);
    detectDecimals(tokenId);
  };

  const handleManualAddressChange = (address: string) => {
    setManualAddress(address);
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

  const baseInputStyles =
    "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent";

  return (
    <div className={className}>
      {/* Input Mode Toggle */}
      <div className="flex mb-3 space-x-2">
        <button
          type="button"
          onClick={() => setInputMode("select")}
          className={`px-3 py-1 rounded-md text-sm ${
            inputMode === "select"
              ? "bg-green-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {useConfiguredTokensOnly
            ? "Select Configured Token"
            : "Select from Wallet"}
        </button>
        <button
          type="button"
          onClick={() => setInputMode("manual")}
          className={`px-3 py-1 rounded-md text-sm ${
            inputMode === "manual"
              ? "bg-green-500 text-white"
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
              Loading tokens...
            </div>
          ) : tokenAccounts && tokenAccounts.length > 0 ? (
            <select
              value={selectedTokenId}
              onChange={(e) => handleTokenSelect(e.target.value)}
              className={baseInputStyles}
              required={required}
            >
              <option value="">
                {useConfiguredTokensOnly
                  ? "Select a configured token"
                  : placeholder}
              </option>
              {tokenAccounts.map((token: any) => {
                const name = getTokenName(token);
                const symbol = getTokenSymbol(token);
                return (
                  <option key={token.id} value={token.id}>
                    {name}
                    {symbol ? ` (${symbol})` : ""} - {token.id.slice(0, 8)}...
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="p-4 text-center text-gray-500 border border-gray-300 rounded-md">
              {useConfiguredTokensOnly
                ? "No configured tokens found. Use manual input instead."
                : "No tokens found in wallet. Use manual input instead."}
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
          value={manualAddress}
          onChange={(e) => handleManualAddressChange(e.target.value)}
          placeholder="Enter SPL token mint address"
          className={baseInputStyles}
          required={required}
        />
      )}

      {/* Token Decimals Detection Info */}
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
    </div>
  );
};
