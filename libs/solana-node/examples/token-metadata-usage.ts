import { 
  createConnection, 
  fetchTokenMetadata, 
  fetchTokenInfo, 
  fetchOnChainMetadata,
  hasTokenMetadata,
  batchFetchTokenMetadata,
  batchFetchTokenInfo,
  TokenMetadata,
  TokenInfo
} from '../src';

/**
 * Example usage of token metadata functions
 */
async function exampleUsage() {
  // Create connection (defaults to devnet)
  const connection = createConnection();
  
  // Example SPL token addresses (these are real tokens on mainnet-beta)
  const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
  const solMint = 'So11111111111111111111111111111111111111112';   // Wrapped SOL
  
  console.log('=== Token Metadata Examples ===\n');

  try {
    // 1. Fetch comprehensive metadata for USDC
    console.log('1. Fetching comprehensive metadata for USDC...');
    const usdcMetadata: TokenMetadata | null = await fetchTokenMetadata(connection, usdcMint);
    
    if (usdcMetadata) {
      console.log('USDC Metadata:');
      console.log(`  Name: ${usdcMetadata.name}`);
      console.log(`  Symbol: ${usdcMetadata.symbol}`);
      console.log(`  Description: ${usdcMetadata.description}`);
      console.log(`  Image: ${usdcMetadata.image}`);
      console.log(`  Update Authority: ${usdcMetadata.updateAuthority}`);
      console.log(`  Is Mutable: ${usdcMetadata.isMutable}`);
      console.log(`  Seller Fee: ${usdcMetadata.sellerFeeBasisPoints} basis points`);
      if (usdcMetadata.attributes) {
        console.log(`  Attributes: ${JSON.stringify(usdcMetadata.attributes, null, 2)}`);
      }
    } else {
      console.log('  No metadata found for USDC');
    }
    console.log('');

    // 2. Fetch basic token info
    console.log('2. Fetching basic token info for USDC...');
    const usdcInfo: TokenInfo | null = await fetchTokenInfo(connection, usdcMint);
    
    if (usdcInfo) {
      console.log('USDC Token Info:');
      console.log(`  Name: ${usdcInfo.name}`);
      console.log(`  Symbol: ${usdcInfo.symbol}`);
      console.log(`  Decimals: ${usdcInfo.decimals}`);
      console.log(`  Supply: ${usdcInfo.supply}`);
    }
    console.log('');

    // 3. Fetch only on-chain metadata
    console.log('3. Fetching on-chain metadata for USDC...');
    const usdcOnChain = await fetchOnChainMetadata(connection, usdcMint);
    
    if (usdcOnChain) {
      console.log('USDC On-Chain Metadata:');
      console.log(`  Name: ${usdcOnChain.name}`);
      console.log(`  Symbol: ${usdcOnChain.symbol}`);
      console.log(`  Token Standard: ${usdcOnChain.tokenStandard}`);
    }
    console.log('');

    // 4. Check if token has metadata
    console.log('4. Checking if tokens have metadata...');
    const usdcHasMetadata = await hasTokenMetadata(connection, usdcMint);
    const solHasMetadata = await hasTokenMetadata(connection, solMint);
    
    console.log(`  USDC has metadata: ${usdcHasMetadata}`);
    console.log(`  SOL has metadata: ${solHasMetadata}`);
    console.log('');

    // 5. Batch fetch metadata for multiple tokens
    console.log('5. Batch fetching metadata for multiple tokens...');
    const tokenAddresses = [usdcMint, solMint];
    const batchMetadata = await batchFetchTokenMetadata(connection, tokenAddresses);
    
    batchMetadata.forEach((metadata, index) => {
      const address = tokenAddresses[index];
      if (metadata) {
        console.log(`  ${address}: ${metadata.name} (${metadata.symbol})`);
      } else {
        console.log(`  ${address}: No metadata found`);
      }
    });
    console.log('');

    // 6. Batch fetch basic info for multiple tokens
    console.log('6. Batch fetching basic info for multiple tokens...');
    const batchInfo = await batchFetchTokenInfo(connection, tokenAddresses);
    
    batchInfo.forEach((info, index) => {
      const address = tokenAddresses[index];
      if (info) {
        console.log(`  ${address}: ${info.name} (${info.symbol}) - Decimals: ${info.decimals}, Supply: ${info.supply}`);
      } else {
        console.log(`  ${address}: No info found`);
      }
    });

  } catch (error) {
    console.error('Error in example usage:', error);
  }
}

/**
 * Example with custom connection
 */
async function exampleWithCustomConnection() {
  console.log('\n=== Custom Connection Example ===\n');
  
  // Create connection to mainnet-beta for real token data
  const mainnetConnection = createConnection('mainnet-beta');
  
  // Example NFT mint address (replace with actual NFT)
  const nftMint = 'YOUR_NFT_MINT_ADDRESS_HERE';
  
  try {
    const nftMetadata = await fetchTokenMetadata(mainnetConnection, nftMint);
    
    if (nftMetadata) {
      console.log('NFT Metadata:');
      console.log(`  Name: ${nftMetadata.name}`);
      console.log(`  Description: ${nftMetadata.description}`);
      console.log(`  Image: ${nftMetadata.image}`);
      console.log(`  Animation URL: ${nftMetadata.animation_url}`);
      
      if (nftMetadata.attributes) {
        console.log('  Attributes:');
        nftMetadata.attributes.forEach(attr => {
          console.log(`    ${attr.trait_type}: ${attr.value}`);
        });
      }
      
      if (nftMetadata.collection) {
        console.log(`  Collection: ${nftMetadata.collection.key} (verified: ${nftMetadata.collection.verified})`);
      }
    }
  } catch (error) {
    console.log('  Note: Replace YOUR_NFT_MINT_ADDRESS_HERE with actual NFT address');
  }
}

// Run examples
if (require.main === module) {
  exampleUsage()
    .then(() => exampleWithCustomConnection())
    .then(() => {
      console.log('\n=== Examples completed ===');
      process.exit(0);
    })
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export { exampleUsage, exampleWithCustomConnection }; 