import axios from "axios";
import { get } from "lodash";
import { tokenConfigsService } from "../../token-configs/services/token-configs.service";

const internalCache = new Map<string, any>();
const userToTimestamp = new Map<string, number>();

export interface HelisuTokenResponse {
  interface: string;
  id: string;
  content: {
    json_uri: string;
    files: {
      uri: string;
      cdn_uri: string;
      mime: string;
    }[];
  };
}

const HELIUS_API =
  process.env.HELIUS_API ||
  "https://mainnet.helius-rpc.com/?api-key=f6d0c03a-562f-4784-8b78-ebb084b72514";

const fetchAssets = async (
  owner: string,
  limit: number,
  page: number,
  apiUrl?: string
) => {
  const response = await axios.post(`${apiUrl || HELIUS_API}`, {
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

const getTokenAccounts = async (
  owner: string,
  apiUrl?: string
): Promise<HelisuTokenResponse[]> => {
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
  userToTimestamp.set(owner, now + 1000 * 60 * 5);
  const tokens = await getTokenAccounts(owner, apiUrl);
  internalCache.set(owner, tokens);
  return tokens;
};

export const crossSectionWithTokenConfigs = async (
  owner: string,
  apiUrl?: string
) => {
  const tokens = await getTokensAccountsWithCache(owner, apiUrl);
  if (tokens.length === 0) {
    return {
      tokens: [],
      tokenConfigs: [],
    };
  }
  const tokenConfigs = await tokenConfigsService.findIn(
    tokens.map((t) => t.id)
  );
  return {
    tokens: tokens.filter((t) =>
      tokenConfigs.some(
        (tc) => tc.tokenMint.toLowerCase() === t.id.toLowerCase()
      )
    ),
    tokenConfigs,
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
    const response = await axios.post(`${apiUrl || HELIUS_API}`, {
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
    console.error(`Error fetching token price for ${mintAddress}:`, error);
    return { price: null, pricePerToken: null };
  }
};

export const tokensService = {
  getTokensAccountsWithCache,
  crossSectionWithTokenConfigs,
  getTokenPrice,
};
