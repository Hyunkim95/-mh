## Context
We need to create an end to end from apps/web to apps/api and be able to create routes and read the routes

## Requirements
- can be done by anyone, so the routes can be public for now
- requires creating the transaction encoded as a string and returning it to the client so that it can be submitted from the client side
- all UI related changes should be persisted into apps/web
- all server related changes should be persisted into libs/server where it wil be imported into apps/api
- for now we will pass route ID as an input from the front-end

## Required Interface
libs/client 
```
interface IHop {
    recipient: PublicKey;
    delaySeconds: BN;
}

function useCreateRoute(routeId: number, tokenConfig: string) {
    // calls trpc api for the encoded transaction
    // instructions should include initialization of token config + init guard 
    // create versionedTransaction
    // use solana client to sendAndConfirm(transaction)
    return {
        initializeRoute: ({
            routeId,
            routes: IHop[],
            tokenConfig,
            splToken
        }) => Promise<TransactionSignature>,
        initializeRouteSOL: ({
            routeId,
            routes: IHop[],
            tokenConfig
        }) => Promise<TransactionSignature>,
    }
}

interface RouteConfig {
    creator: PublicKey;
    routeId: BN;
    tokenConfig: PublicKey;
    sourceOwner: PublicKey;
    executor: PublicKey;
    hops: {
        recipient: PublicKey;
        delaySeconds: BN;
    }[];
    hopAmount: BN;
    isFinalized: boolean;
    createdAt: BN;
}

interface RouteStateAccount {
    currentHopIndex: number
}

function getRouteConfig(routeId: number, tokenConfig: string) {
    // call from trpc API
    return {
        routeConfig: (routeId: number, creator: string, tokenConfig: string) => RouteConfig 
        routeState: (routeId: number, creator: string, tokenConfig: string) => RouteStateAccount
    }
}

// also need a UI to create the hops and load them into form
// also need UI to show where the hopIndex is based on the hops
```
