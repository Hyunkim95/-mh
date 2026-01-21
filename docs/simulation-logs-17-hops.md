# Simulation Logs - 17 Hops Deployment

## Route Initialization

```json
{
    "context": {
        "apiVersion": "3.0.13",
        "slot": 393747096
    },
    "value": {
        "accounts": null,
        "err": null,
        "fee": 10400,
        "innerInstructions": null,
        "loadedAccountsDataSize": 2352881,
        "loadedAddresses": {
            "readonly": [],
            "writable": []
        },
        "logs": [
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program 11111111111111111111111111111111 invoke [1]",
            "Program 11111111111111111111111111111111 success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh invoke [1]",
            "Program log: Instruction: InitializeRouteSol",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]",
            "Program log: MetadataPointerInstruction::Initialize",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 691 of 376107 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]",
            "Program log: Instruction: InitializePermanentDelegate",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 725 of 373603 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]",
            "Program log: Instruction: InitializeMint2",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1654 of 371141 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program log: Calculating fee: hop_amount = 16546000, fee_bps = 100",
            "Program log: Debug: hop_amount_u128 = 16546000, fee_bps_u128 = 100",
            "Program log: Debug: multiplication_result = 1654600000",
            "Program log: Debug: fee_u128 after division = 165460",
            "Program log: Debug: Calculating flat_sol_fee - flat_fee_lamports = 10000, num_hops = 17",
            "Program log: Debug: flat_sol_fee = 170000",
            "Program log: About to handle fee payment of 165460 lamports and 170000 lamports flat SOL fee for SOL route with 17 hops",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program log: Fee payments handled successfully",
            "Program log: Setting up SOL route config for 17 hops",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]",
            "Program log: TokenMetadataInstruction: Initialize",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 3280 of 346938 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program log: SOL route config initialized",
            "Program log: SOL route state initialized completely",
            "Program data: fQHlOMy8CPV7/hNMnlhid2NDQn6jNcw+v2+SDzfhslyXOjiMYcI/zF2JXBjcrGfnHg77abqx+T5w6JPncdH1OdV7yPT1XIJFq+0daxbn7XsPiRTNSnHOSbBQijxW0ugpRuafnpL29qER",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh consumed 61516 of 399550 compute units",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh success",
            "Program 2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52 invoke [1]",
            "Program log: Instruction: InitGuard",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program 2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52 consumed 12406 of 338034 compute units",
            "Program 2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52 success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh invoke [1]",
            "Program log: Instruction: WrapSol",
            "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [2]",
            "Program log: Create",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]",
            "Program log: Instruction: GetAccountDataSize",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1277 of 311436 compute units",
            "Program return: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb qgAAAAAAAAA=",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program 11111111111111111111111111111111 invoke [3]",
            "Program 11111111111111111111111111111111 success",
            "Program log: Initialize the associated token account",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]",
            "Program log: Instruction: InitializeImmutableOwner",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 510 of 305229 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]",
            "Program log: Instruction: InitializeAccount3",
            "Program log: Warning: Mint has a permanent delegate, so tokens in this account may be seized at any time",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 2113 of 302331 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL consumed 16811 of 316746 compute units",
            "Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL success",
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]",
            "Program log: Instruction: MintTo",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1639 of 284843 compute units",
            "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh consumed 42930 of 325628 compute units",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh success"
        ],
        "unitsConsumed": 117302
    }
}
```

**Route deployed with signature:** `5mRz9mjw8Qbkxx7rfeLHTpHRAp4uV2LEzoYxad8Rzrwc88EwdgQBRa9S7V75S4iEtQDsZBi4dciRv9xJHg6m71Y`

---

## Adding 17 hops in 4 batch(es)

---

## Batch 1/4 Simulation

**Hops 1-5:**
```json
[
    {
        "recipient": "38tFiQmLwmzUHYiCrYKH4pumqWxpdaYvErUsJbmeSZus",
        "scheduledAt": 1768513722390
    },
    {
        "recipient": "8tNwtvg9G6cgR9JSaf3szw2aAnfKghqLRtSMmCC7trpo",
        "scheduledAt": 1768513782390
    },
    {
        "recipient": "G6HPn7fW4eCj7Zvn3J5JwMpXXsxg33Qqodcxv33f4g2q",
        "scheduledAt": 1768513962390
    },
    {
        "recipient": "G9X7F4JzLzbSGMCndiBdWNi5YzZZakmtkdwq7xS3Q3FE",
        "scheduledAt": 1768514202390
    },
    {
        "recipient": "CmmZXMztbTuAyWXJecn96Q5WvcyMYcMK7JcMukJdku8U",
        "scheduledAt": 1768514202390
    }
]
```

**Simulation Result:**
```json
{
    "context": {
        "apiVersion": "3.0.13",
        "slot": 393747125
    },
    "value": {
        "accounts": null,
        "err": null,
        "fee": 5400,
        "innerInstructions": null,
        "loadedAccountsDataSize": 637435,
        "loadedAddresses": {
            "readonly": [],
            "writable": []
        },
        "logs": [
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh invoke [1]",
            "Program log: Instruction: AddHops",
            "Program log: Adding 5 hops to route. Current hops: 0, Total will be: 5",
            "Program data: 9XyuhiipXe17/hNMnlhid2NDQn6jNcw+v2+SDzfhslyXOjiMYcI/zAUF",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh consumed 12016 of 399700 compute units",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh success"
        ],
        "unitsConsumed": 12316
    }
}
```

**Result:** SUCCESS

---

## Batch 2/4 Simulation

**Hops 6-10:**
```json
[
    {
        "recipient": "DRpgwVyUpF2CL4QLgXae2MqDWoyRzM8Y5z6y6n7MynJH",
        "scheduledAt": 1768514202390
    },
    {
        "recipient": "GcUoxTbkvGeFDqnkai541SakNKekT2g49SZ3wCc7krpr",
        "scheduledAt": 1768514442390
    },
    {
        "recipient": "GXKuNRmqfP6kp5invUx3jUAA6zss3giUm3h4yC8F1nyz",
        "scheduledAt": 1768514502390
    },
    {
        "recipient": "B9imdLSPT3W38R1MwGbcVoEjWojxiUpxSexnrkVjapv2",
        "scheduledAt": 1768514562390
    },
    {
        "recipient": "2PcY2uYgC8934jBHaeR7G2LtHSkD9cZ55wPRT5xUkQsC",
        "scheduledAt": 1768514622390
    }
]
```

**Simulation Result:**
```json
{
    "context": {
        "apiVersion": "3.0.13",
        "slot": 393747125
    },
    "value": {
        "accounts": null,
        "err": null,
        "fee": 5400,
        "innerInstructions": null,
        "loadedAccountsDataSize": 637435,
        "loadedAddresses": {
            "readonly": [],
            "writable": []
        },
        "logs": [
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh invoke [1]",
            "Program log: Instruction: AddHops",
            "Program log: Adding 5 hops to route. Current hops: 0, Total will be: 5",
            "Program data: 9XyuhiipXe17/hNMnlhid2NDQn6jNcw+v2+SDzfhslyXOjiMYcI/zAUF",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh consumed 12016 of 399700 compute units",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh success"
        ],
        "unitsConsumed": 12316
    }
}
```

**Result:** SUCCESS

---

## Batch 3/4 Simulation

**Hops 11-15:**
```json
[
    {
        "recipient": "EZDGu6mTHHzUYFfVDrCqs2Zarji8sf2vb5Tg8PchLn7C",
        "scheduledAt": 1768514802390
    },
    {
        "recipient": "ASde6y8pBCU1aityWHRpqT7pEAcEonjCgFUMeh5egRes",
        "scheduledAt": 1768514982390
    },
    {
        "recipient": "MoN7jf7NtTCaZieVFmiNFxYJCeMdweQ2bcQ6eMWdQRB",
        "scheduledAt": 1768515042390
    },
    {
        "recipient": "FpEeteTry4FMBQ4s7HvE1gnEgvqpiqsSixPnwgCnRG4b",
        "scheduledAt": 1768515342390
    },
    {
        "recipient": "Dog1YVcGCdTYNpRpwUdod7zAGjztVL1ZeHAVYaYD1h5Q",
        "scheduledAt": 1768515342390
    }
]
```

**Simulation Result:**
```json
{
    "context": {
        "apiVersion": "3.0.13",
        "slot": 393747125
    },
    "value": {
        "accounts": null,
        "err": null,
        "fee": 5400,
        "innerInstructions": null,
        "loadedAccountsDataSize": 637435,
        "loadedAddresses": {
            "readonly": [],
            "writable": []
        },
        "logs": [
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh invoke [1]",
            "Program log: Instruction: AddHops",
            "Program log: Adding 5 hops to route. Current hops: 0, Total will be: 5",
            "Program data: 9XyuhiipXe17/hNMnlhid2NDQn6jNcw+v2+SDzfhslyXOjiMYcI/zAUF",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh consumed 12016 of 399700 compute units",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh success"
        ],
        "unitsConsumed": 12316
    }
}
```

**Result:** SUCCESS

---

## Batch 4/4 Simulation

**Hops 16-17:**
```json
[
    {
        "recipient": "uZ1N4C9dc71Euu4GLYt5UURpFtg1WWSwo3F4Rn46Fr3",
        "scheduledAt": 1768515342390
    },
    {
        "recipient": "G7R3Vc6pxjh2in9Dq3ADSsWbsUjGUmTGWJ3NpPTT2hut",
        "scheduledAt": 1768515342390
    }
]
```

**Simulation Result:**
```json
{
    "context": {
        "apiVersion": "3.0.13",
        "slot": 393747125
    },
    "value": {
        "accounts": null,
        "err": null,
        "fee": 5400,
        "innerInstructions": null,
        "loadedAccountsDataSize": 637435,
        "loadedAddresses": {
            "readonly": [],
            "writable": []
        },
        "logs": [
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program ComputeBudget111111111111111111111111111111 invoke [1]",
            "Program ComputeBudget111111111111111111111111111111 success",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh invoke [1]",
            "Program log: Instruction: AddHops",
            "Program log: Adding 2 hops to route. Current hops: 0, Total will be: 2",
            "Program data: 9XyuhiipXe17/hNMnlhid2NDQn6jNcw+v2+SDzfhslyXOjiMYcI/zAIC",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh consumed 11327 of 399700 compute units",
            "Program 3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh success"
        ],
        "unitsConsumed": 11627
    }
}
```

**Result:** SUCCESS

---

## Analysis

**Issue:** All simulations show "Current hops: 0" because each simulation runs independently against the current blockchain state, not the cumulative state after previous batches.

**In reality when executed:**
- Batch 1: 0 → 5 hops ✓
- Batch 2: 5 → 10 hops ✓
- Batch 3: 10 → 15 hops ✓
- Batch 4: 15 → 17 hops ❌ (fails with `ConstraintOwner` error 3004)

**Root Cause:** On-chain `maxHops` is set to 10, but the route attempts to add 17 hops total.
