## Context
We need to create an end to end from apps/web to apps/api and be trigger hops

## Requirements
- can be done by anyone, so the routes can be public for now
- requires creating the transaction encoded as a string and returning it to the client so that it can be submitted from the client side
- all UI related changes should be persisted into apps/web
- all server related changes should be persisted into libs/server where it wil be imported into apps/api

## Required Interface
apps/web
```
function useTriggerHop(routeID: number) {
    return {
        triggerHop
    }
}

// in RouteViewer
// show all routes and highlight which one it is at
// add trigger hop and update the state
```

libs/server
```
// update contract.router with relevant trigger function
```