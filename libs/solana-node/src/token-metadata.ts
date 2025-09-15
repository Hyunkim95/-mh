import { Connection, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import {
  fetchDigitalAsset,
  fetchMetadata,
  findMetadataPda,
} from '@metaplex-foundation/mpl-token-metadata';

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  /** Token mint address */
  mint: string;
  /** Token name */
  name?: string;
  /** Token symbol */
  symbol?: string;
  /** Token description */
  description?: string;
  /** Token image URL */
  image?: string;
  /** Token URI */
  uri?: string;
  /** External URL */
  external_url?: string;
  /** Animation URL (for videos, etc.) */
  animation_url?: string;
  /** Attributes array */
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  /** Properties */
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
    creators?: Array<{
      address: string;
      verified: boolean;
      share: number;
    }>;
  };
  /** Update authority */
  updateAuthority?: string;
  /** Is mutable */
  isMutable?: boolean;
  /** Primary sale happened */
  primarySaleHappened?: boolean;
  /** Seller fee basis points */
  sellerFeeBasisPoints?: number;
  /** Token standard (NonFungible, FungibleAsset, etc.) */
  tokenStandard?: string;
  /** Collection information */
  collection?: {
    verified: boolean;
    key: string;
  };
  /** Uses information */
  uses?: {
    useMethod: string;
    remaining: number;
    total: number;
  };
}

/**
 * Simplified token info interface
 */
export interface TokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  supply?: string;
  image?: string;
  description?: string;
}

/**
 * Fetch comprehensive token metadata from SPL token address
 */
export async function fetchTokenMetadata(
  connection: Connection,
  mintAddress: string | PublicKey
): Promise<TokenMetadata | null> {
  try {
    const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
    const umi = createUmi(connection.rpcEndpoint);
    const umiMint = fromWeb3JsPublicKey(mint);

    // Fetch the digital asset (includes metadata)
    const digitalAsset = await fetchDigitalAsset(umi, umiMint);
    
    if (!digitalAsset.metadata) {
      return null;
    }

    const metadata = digitalAsset.metadata;
    console.log('metadata', metadata);

    const tokenMetadata: TokenMetadata = {
      mint: mint.toBase58(),
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      updateAuthority: toWeb3JsPublicKey(metadata.updateAuthority).toBase58(),
      isMutable: metadata.isMutable,
      primarySaleHappened: metadata.primarySaleHappened,
      sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
      tokenStandard: metadata.tokenStandard?.toString(),
    };

    // Add collection info if present
    if (metadata.collection && metadata.collection.__option === 'Some') {
      tokenMetadata.collection = {
        verified: metadata.collection.value.verified,
        key: toWeb3JsPublicKey(metadata.collection.value.key).toBase58(),
      };
    }

    // Add uses info if present
    if (metadata.uses && metadata.uses.__option === 'Some') {
      tokenMetadata.uses = {
        useMethod: metadata.uses.value.useMethod.toString(),
        remaining: Number(metadata.uses.value.remaining),
        total: Number(metadata.uses.value.total),
      };
    }

    return tokenMetadata;
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    return null;
  }
}

/**
 * Fetch basic token information (simplified version)
 */
export async function fetchTokenInfo(
  connection: Connection,
  mintAddress: string | PublicKey
): Promise<TokenInfo | null> {
  try {
    const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
    
    // Get mint info for decimals and supply
    const mintInfo = await connection.getParsedAccountInfo(mint);
    const parsedData = mintInfo.value?.data;
    
    let decimals: number | undefined;
    let supply: string | undefined;
    
    if (parsedData && 'parsed' in parsedData) {
      decimals = parsedData.parsed.info.decimals;
      supply = parsedData.parsed.info.supply;
    }

    // Fetch metadata
    const metadata = await fetchTokenMetadata(connection, mint);
    
    return {
      mint: mint.toBase58(),
      name: metadata?.name,
      symbol: metadata?.symbol,
      decimals,
      supply,
      image: metadata?.image,
      description: metadata?.description,
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    return null;
  }
}

/**
 * Fetch only on-chain metadata (without off-chain JSON)
 */
export async function fetchOnChainMetadata(
  connection: Connection,
  mintAddress: string | PublicKey
): Promise<Partial<TokenMetadata> | null> {
  try {
    const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
    const umi = createUmi(connection.rpcEndpoint);
    const umiMint = fromWeb3JsPublicKey(mint);

    // Find metadata PDA
    const [metadataPda] = findMetadataPda(umi, { mint: umiMint });
    
    // Fetch metadata
    const metadata = await fetchMetadata(umi, metadataPda);
    
    return {
      mint: mint.toBase58(),
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri || undefined,
      updateAuthority: toWeb3JsPublicKey(metadata.updateAuthority).toBase58(),
      isMutable: metadata.isMutable,
      primarySaleHappened: metadata.primarySaleHappened,
      sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
      tokenStandard: metadata.tokenStandard?.toString(),
    };
  } catch (error) {
    console.error('Error fetching on-chain metadata:', error);
    return null;
  }
}

/**
 * Check if a token has metadata
 */
export async function hasTokenMetadata(
  connection: Connection,
  mintAddress: string | PublicKey
): Promise<boolean> {
  try {
    const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
    const umi = createUmi(connection.rpcEndpoint);
    const umiMint = fromWeb3JsPublicKey(mint);

    // Find metadata PDA
    const [metadataPda] = findMetadataPda(umi, { mint: umiMint });
    
    // Check if metadata account exists
    const account = await umi.rpc.getAccount(metadataPda);
    return account.exists;
  } catch (error) {
    return false;
  }
}

/**
 * Fetch the original URI from on-chain metadata
 */
export async function fetchTokenMetadataURI(
  connection: Connection,
  mintAddress: string | PublicKey
): Promise<string | null> {
  try {
    const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
    const umi = createUmi(connection.rpcEndpoint);
    const umiMint = fromWeb3JsPublicKey(mint);

    // Find metadata PDA
    const [metadataPda] = findMetadataPda(umi, { mint: umiMint });
    
    // Fetch raw metadata to get the URI
    const metadata = await fetchMetadata(umi, metadataPda);
    
    // Return the original URI if it exists and is not empty
    return metadata.uri && metadata.uri.trim() !== '' ? metadata.uri : null;
  } catch (error) {
    console.warn('Could not fetch original metadata URI:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Batch fetch metadata for multiple tokens
 */
export async function batchFetchTokenMetadata(
  connection: Connection,
  mintAddresses: (string | PublicKey)[]
): Promise<(TokenMetadata | null)[]> {
  const promises = mintAddresses.map(mint => 
    fetchTokenMetadata(connection, mint)
  );
  
  return Promise.all(promises);
}

/**
 * Batch fetch basic token info for multiple tokens
 */
export async function batchFetchTokenInfo(
  connection: Connection,
  mintAddresses: (string | PublicKey)[]
): Promise<(TokenInfo | null)[]> {
  const promises = mintAddresses.map(mint => 
    fetchTokenInfo(connection, mint)
  );
  
  return Promise.all(promises);
}