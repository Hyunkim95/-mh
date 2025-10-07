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

const fetchAssets = async (owner: string, limit: number, page: number) => {
  const response = await axios.post(`${HELIUS_API}`, {
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
  owner: string
): Promise<HelisuTokenResponse[]> => {
  let hasMore = true;
  let limit = 100;
  let page = 1;
  let totalAssets: HelisuTokenResponse[] = [];

  while (hasMore) {
    const response = await fetchAssets(owner, limit, page);
    const total = get(response, "total");
    totalAssets = [...totalAssets, ...response.items];
    hasMore = totalAssets.length < total;
    page++;
  }
  return totalAssets.filter((asset) => asset.interface === "FungibleToken");
};

const getTokensAccountsWithCache = async (
  owner: string
): Promise<HelisuTokenResponse[]> => {
  const now = Date.now();
  const cacheTime = userToTimestamp.get(owner);
  if (internalCache.has(owner) && cacheTime && cacheTime > now) {
    return internalCache.get(owner);
  }
  userToTimestamp.set(owner, now + 1000 * 60 * 5);
  const tokens = await getTokenAccounts(owner);
  internalCache.set(owner, tokens);
  return tokens;
};

export const crossSectionWithTokenConfigs = async (owner: string) => {
  const tokens = await getTokensAccountsWithCache(owner);
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

export const tokensService = {
  getTokensAccountsWithCache,
  crossSectionWithTokenConfigs,
};
