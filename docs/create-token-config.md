## Context
We need to create an end to end from apps/web to apps/api and be able to create token configs from apps/web. 

## Requirements
- can be done by anyone, so the routes can be public for now
- requires creating the transaction encoded as a string and returning it to the client so that it can be submitted from the client side
- all UI related changes should be persisted into libs/client where it will be imported into apps/web
- all server related changes should be persisted into libs/server where it wil be imported into apps/api

## Required Interface
libs/client
```
interface TokenConfig {
    minTransfer: BN,
    feeBps: BN,
    feeTreasury: BN,
    maxHops: BN,
    maxDelaySeconds: BN,
    timelockSeconds: BN,
    flatFeeLamports: BN
}

// hook
function useInitializeTokenConfig() {
    // calls trpc api for the encoded transaction
    // instructions should include initialization of token config + init guard 
    // create versionedTransaction
    // use solana client to sendAndConfirm(transaction)
    return {
        initializeTokenConfig: (splAddress: string) => Promise<string>,
        initializeTokenConfigSOL: (creator: string) => Promise<string> 
    }
}

function useTokenConfigSPL(spl: address) {
    // calls trpc api to fetch the tokenConfig and the tokenConfigPDA
    return {
        tokenConfig,
        initialized: boolean
    }
}

function useTokenConfigSOL(creator: address) {
    // calls trpc api to fetch the tokenConfig and the PDA
    return {
        tokenConfig,
        initialized: boolean
    }
}

// component
// should have all the inputs required to initialize a token config
// if the type is SPL: we should provide an SPL address
// if the type is SOL: we should provide a creator address
```

libs/server
```
type TransactionSignature = string
// contract.router.ts
// tokenConfig params parsed as strings
initializeTokenConfig(splMint: string, tokenConfig: TokenConfig): Promise<TransactionSignature>
initializeTokenConfigSOL(creator: string, tokenConfig: TokenConfig): Promise<TransactionSignature>
getTokenConfigSPL(splMint: string)
getTokenConfigSOL(creator: string)
```