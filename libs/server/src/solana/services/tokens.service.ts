import axios from "axios";
import { get } from "lodash";

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

const getTokenAccounts = async (owner: string) => {
  let hasMore = true;
  let limit = 100;
  let page = 1;
  let totalAssets: {
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
  }[] = [];

  while (hasMore) {
    const response = await fetchAssets(owner, limit, page);
    const total = get(response, "total");
    totalAssets = [...totalAssets, ...response.items];
    hasMore = totalAssets.length < total;
    page++;
  }
  return totalAssets.filter((asset) => asset.interface === "FungibleToken");
};

export const tokensService = {
  getTokenAccounts,
};
