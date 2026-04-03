import axios from "axios";
import { get } from "lodash";
import { createLogger } from "@libs/logger";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { fetchTokenMetadata } from "@libs/solana-node";

const log = createLogger("TokensService");

const internalCache = new Map<string, any>();
const userToTimestamp = new Map<string, number>();

/**
 * Invalidate the token cache for a specific owner.
 * Call this when you know the user's balance has changed (e.g., after a transfer).
 */
const invalidateCache = (owner: string): void => {
  internalCache.delete(owner);
  userToTimestamp.delete(owner);
  log.info(`Cache invalidated for owner ${owner}`);
};

export interface HelisuTokenResponse {
  interface: string;
  id: string;
  token_info?: {
    balance?: number | string;
    decimals?: number;
    price_per_token?: number;
    price_info?: {
      total_price?: number;
      price_per_token?: number;
    };
  };
  content: {
    json_uri: string;
    metadata?: {
      name?: string;
      symbol?: string;
    };
    files: {
      uri: string;
      cdn_uri: string;
      mime: string;
    }[];
  };
}

const isLocalValidatorRpc = (rpcUrl?: string): boolean => {
  if (!rpcUrl) return false;

  return (
    rpcUrl.includes("localhost:8899") ||
    rpcUrl.includes("127.0.0.1:8899") ||
    rpcUrl.includes("solana-validator-dev:8899")
  );
};

const shouldUseLocalValidatorAssets = (): boolean =>
  isLocalValidatorRpc(process.env.SOLANA_RPC_URL);

const getHeliusApiUrl = (apiUrl?: string): string => {
  const resolvedUrl = apiUrl || process.env.HELIUS_API;
  if (!resolvedUrl) {
    throw new Error("HELIUS_API environment variable is required");
  }
  return resolvedUrl;
};

const fetchAssets = async (
  owner: string,
  limit: number,
  page: number,
  apiUrl?: string
) => {
  const response = await axios.post(getHeliusApiUrl(apiUrl), {
    jsonrpc: "2.0",
    id: 1,
    method: "getAssetsByOwner",
    params: {
      limit,
      page,
      ownerAddress: owner,
      displayOptions: {
        showUnverifiedCollections: false,
        showInscription: false,
        showZeroBalance: false,
        showFungible: true, // Include SPL tokens
        showNativeBalance: true, // Include SOL balance
      },
    },
  });
  return response.data.result;
};

const fetchLocalValidatorAssets = async (
  owner: string
): Promise<HelisuTokenResponse[]> => {
  const connection = new Connection(process.env.SOLANA_RPC_URL || "", "confirmed");
  const ownerKey = new PublicKey(owner);
  const tokenAccounts = await Promise.all([
    connection.getParsedTokenAccountsByOwner(ownerKey, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(ownerKey, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  ]);

  const assets: Array<HelisuTokenResponse | null> = await Promise.all(
    tokenAccounts.flatMap((result) => result.value).map(async ({ account }) => {
      const parsed = account.data.parsed?.info;
      const tokenAmount = parsed?.tokenAmount;
      const rawBalance = tokenAmount?.amount;
      const decimals = tokenAmount?.decimals;
      const mint = parsed?.mint;

      if (!mint || !rawBalance || Number(rawBalance) <= 0) {
        return null;
      }

      const metadata = await fetchTokenMetadata(connection, mint);

      return {
        interface: "FungibleToken",
        id: mint,
        token_info: {
          balance: rawBalance,
          decimals,
        },
        content: {
          json_uri: metadata?.uri || "",
          files: metadata?.image
            ? [
                {
                  uri: metadata.image,
                  cdn_uri: metadata.image,
                  mime: "image/*",
                },
              ]
            : [],
          metadata: {
            name: metadata?.name || `Token ${mint.slice(0, 6)}`,
            symbol: metadata?.symbol || mint.slice(0, 6),
          },
        },
      };
    })
  );

  return assets.filter((asset): asset is HelisuTokenResponse => asset !== null);
};

const getTokenAccounts = async (
  owner: string,
  apiUrl?: string
): Promise<HelisuTokenResponse[]> => {
  if (shouldUseLocalValidatorAssets()) {
    const localAssets = await fetchLocalValidatorAssets(owner);
    log.debug(
      `Fetched ${localAssets.length} tokens for owner ${owner} from local validator.`
    );
    return localAssets;
  }

  let hasMore = true;
  let limit = 100;
  let page = 1;
  let totalAssets: HelisuTokenResponse[] = [];

  while (hasMore) {
    const response = await fetchAssets(owner, limit, page, apiUrl);
    const total = get(response, "total");
    totalAssets = [...totalAssets, ...response.items];
    hasMore = totalAssets.length < total;
    page++;
  }
  log.debug(`Total assets fetched for owner ${owner}: ${totalAssets.length}`);
  return totalAssets.filter((asset) => asset.interface === "FungibleToken");
};

const getTokensAccountsWithCache = async (
  owner: string,
  apiUrl?: string
): Promise<HelisuTokenResponse[]> => {
  const now = Date.now();
  const cacheTime = userToTimestamp.get(owner);
  if (internalCache.has(owner) && cacheTime && cacheTime > now) {
    return internalCache.get(owner);
  }
  userToTimestamp.set(owner, now + 1000 * 60 * 1);
  const tokens = await getTokenAccounts(owner, apiUrl);
  log.debug(
    `Fetched ${tokens.length} tokens for owner ${owner} from Helius.`
  )
  internalCache.set(owner, tokens);
  return tokens;
};

export const crossSectionWithTokenConfigs = async (
  owner: string,
  apiUrl?: string
) => {
  const tokens = [
    ...await getTokensAccountsWithCache(owner, apiUrl),
  ];
  if (tokens.length === 0) {
    return {
      tokens: [],
      tokenConfigs: [],
    };
  }
  return {
    tokens: tokens,
    tokenConfigs: [],
  };
};

const priceCache = new Map<string, { price: number; timestamp: number }>();
const PRICE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export const getTokenPrice = async (
  mintAddress: string,
  apiUrl?: string
): Promise<{ price: number | null; pricePerToken: number | null }> => {
  try {
    // Check cache first
    const cached = priceCache.get(mintAddress);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return { price: cached.price, pricePerToken: cached.price };
    }

    // Fetch asset from Helius to get price info
    const response = await axios.post(getHeliusApiUrl(apiUrl), {
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: {
        id: mintAddress,
        displayOptions: {
          showFungible: true,
        },
      },
    });

    const asset = response.data.result;
    
    // Check for price_per_token directly (most common Helius format)
    const pricePerToken = get(asset, "token_info.price_per_token");
    if (pricePerToken && typeof pricePerToken === "number" && pricePerToken > 0) {
      priceCache.set(mintAddress, { price: pricePerToken, timestamp: Date.now() });
      return { price: pricePerToken, pricePerToken };
    }

    // Check for price_info.total_price (alternative Helius format)
    const priceInfo = get(asset, "token_info.price_info");
    if (priceInfo) {
      const totalPrice = get(priceInfo, "total_price");
      const pricePerTokenFromInfo = get(priceInfo, "price_per_token");
      
      if (pricePerTokenFromInfo && typeof pricePerTokenFromInfo === "number" && pricePerTokenFromInfo > 0) {
        priceCache.set(mintAddress, { price: pricePerTokenFromInfo, timestamp: Date.now() });
        return { price: totalPrice || pricePerTokenFromInfo, pricePerToken: pricePerTokenFromInfo };
      }
      
      if (totalPrice && typeof totalPrice === "number" && totalPrice > 0) {
        // If we only have total_price, we need balance to calculate price per token
        const balance = get(asset, "token_info.balance");
        if (balance && typeof balance === "number" && balance > 0) {
          const calculatedPricePerToken = totalPrice / balance;
          priceCache.set(mintAddress, { price: calculatedPricePerToken, timestamp: Date.now() });
          return { price: totalPrice, pricePerToken: calculatedPricePerToken };
        }
        priceCache.set(mintAddress, { price: totalPrice, timestamp: Date.now() });
        return { price: totalPrice, pricePerToken: totalPrice };
      }
    }

    // If no price found, return null
    return { price: null, pricePerToken: null };
  } catch (error) {
    log.error(`Error fetching token price for ${mintAddress}:`, error);
    return { price: null, pricePerToken: null };
  }
};

export const tokensService = {
  getTokensAccountsWithCache,
  crossSectionWithTokenConfigs,
  getTokenPrice,
  invalidateCache,
};
