# Token Metadata Functions

This document describes the SPL token metadata fetching functions available in the `@libs/solana-node` package.

## Overview

The token metadata functions use the Metaplex Token Metadata standard to fetch comprehensive information about SPL tokens, including both on-chain and off-chain metadata.

## Installation

The required dependencies are already included in the package:
- `@metaplex-foundation/mpl-token-metadata`
- `@metaplex-foundation/umi`
- `@metaplex-foundation/umi-bundle-defaults`
- `@metaplex-foundation/umi-web3js-adapters`

## Functions

### `fetchTokenMetadata(connection, mintAddress)`

Fetches comprehensive token metadata including both on-chain and off-chain data.

**Parameters:**
- `connection: Connection` - Solana connection instance
- `mintAddress: string | PublicKey` - SPL token mint address

**Returns:** `Promise<TokenMetadata | null>`

**Example:**
```typescript
import { createConnection, fetchTokenMetadata } from '@libs/solana-node';

const connection = createConnection('mainnet-beta');
const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const metadata = await fetchTokenMetadata(connection, usdcMint);
console.log(metadata?.name); // "USD Coin"
console.log(metadata?.symbol); // "USDC"
```

### `fetchTokenInfo(connection, mintAddress)`

Fetches basic token information including decimals and supply.

**Parameters:**
- `connection: Connection` - Solana connection instance
- `mintAddress: string | PublicKey` - SPL token mint address

**Returns:** `Promise<TokenInfo | null>`

**Example:**
```typescript
const tokenInfo = await fetchTokenInfo(connection, usdcMint);
console.log(tokenInfo?.decimals); // 6
console.log(tokenInfo?.supply); // "41234567890123"
```

### `fetchOnChainMetadata(connection, mintAddress)`

Fetches only on-chain metadata without making external HTTP requests.

**Parameters:**
- `connection: Connection` - Solana connection instance
- `mintAddress: string | PublicKey` - SPL token mint address

**Returns:** `Promise<Partial<TokenMetadata> | null>`

### `hasTokenMetadata(connection, mintAddress)`

Checks if a token has metadata without fetching the full data.

**Parameters:**
- `connection: Connection` - Solana connection instance
- `mintAddress: string | PublicKey` - SPL token mint address

**Returns:** `Promise<boolean>`

### `batchFetchTokenMetadata(connection, mintAddresses)`

Fetches metadata for multiple tokens in parallel.

**Parameters:**
- `connection: Connection` - Solana connection instance
- `mintAddresses: (string | PublicKey)[]` - Array of SPL token mint addresses

**Returns:** `Promise<(TokenMetadata | null)[]>`

### `batchFetchTokenInfo(connection, mintAddresses)`

Fetches basic info for multiple tokens in parallel.

**Parameters:**
- `connection: Connection` - Solana connection instance
- `mintAddresses: (string | PublicKey)[]` - Array of SPL token mint addresses

**Returns:** `Promise<(TokenInfo | null)[]>`

## Types

### `TokenMetadata`

```typescript
interface TokenMetadata {
  mint: string;
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  external_url?: string;
  animation_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
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
  updateAuthority?: string;
  isMutable?: boolean;
  primarySaleHappened?: boolean;
  sellerFeeBasisPoints?: number;
  tokenStandard?: string;
  collection?: {
    verified: boolean;
    key: string;
  };
  uses?: {
    useMethod: string;
    remaining: number;
    total: number;
  };
}
```

### `TokenInfo`

```typescript
interface TokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  supply?: string;
  image?: string;
  description?: string;
}
```

## Usage Examples

See `examples/token-metadata-usage.ts` for comprehensive usage examples.

### Basic Usage

```typescript
import { createConnection, fetchTokenMetadata } from '@libs/solana-node';

async function getTokenDetails(mintAddress: string) {
  const connection = createConnection('mainnet-beta');
  const metadata = await fetchTokenMetadata(connection, mintAddress);
  
  if (metadata) {
    return {
      name: metadata.name,
      symbol: metadata.symbol,
      image: metadata.image,
      description: metadata.description
    };
  }
  
  return null;
}
```

### Batch Processing

```typescript
import { createConnection, batchFetchTokenInfo } from '@libs/solana-node';

async function getMultipleTokens(mintAddresses: string[]) {
  const connection = createConnection('mainnet-beta');
  const tokens = await batchFetchTokenInfo(connection, mintAddresses);
  
  return tokens.filter(token => token !== null);
}
```

### NFT Metadata

```typescript
import { createConnection, fetchTokenMetadata } from '@libs/solana-node';

async function getNFTDetails(nftMint: string) {
  const connection = createConnection('mainnet-beta');
  const metadata = await fetchTokenMetadata(connection, nftMint);
  
  if (metadata) {
    console.log('NFT Name:', metadata.name);
    console.log('Image:', metadata.image);
    console.log('Attributes:', metadata.attributes);
    
    if (metadata.collection) {
      console.log('Collection:', metadata.collection.key);
      console.log('Verified:', metadata.collection.verified);
    }
  }
}
```

## Error Handling

All functions return `null` when metadata cannot be fetched or doesn't exist. They handle errors gracefully and log warnings for debugging purposes.

```typescript
const metadata = await fetchTokenMetadata(connection, mintAddress);

if (!metadata) {
  console.log('No metadata found or error occurred');
  return;
}

// Safe to use metadata
console.log(metadata.name);
```

## Network Support

The functions work with all Solana networks:
- Mainnet Beta
- Devnet  
- Testnet
- Custom RPC endpoints

Just ensure your connection is configured for the correct network where the token exists. 