## Context
Each initialize route should have an individual executor. From routeId I would like a seed to be created, which is determnisitc and hence a wallet that is determinsitic to that route. 

## Requirements
- create a new wallet 
- deterministic to routeID and a string from env 
- remove the old wallet implementation that involves a db and make it not use the db
- migrate the contract service to initialize the routes and trigger hop

## Required Interface
libs/server
```
const getWalletByRouteID = (routeId: number) => {
    // generate a solana seed from routeID and string
    // generate a keypair wallet
}

const executorService = {
    getWalletByRouteId,
    withdrawOnBehalf(to: string, amount: BN),
    balance(routeId: number): Promise<BN>,
}
```

apps/web
```
function useExecutor(routeId: number) {
    return {
        publicKey,
        balance,
        withdraw: mutationFn
    }
}
```