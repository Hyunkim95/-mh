/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/transfer_hook_guard.json`.
 */
export type TransferHookGuard = {
  "address": "AkqpstLrD1tmbhGpAKidh3AfqGy7ENmxjtsnAMwVt7fi",
  "metadata": {
    "name": "transferHookGuard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "execute",
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "source"
        },
        {
          "name": "mint"
        },
        {
          "name": "destination"
        },
        {
          "name": "authority"
        },
        {
          "name": "guard"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initGuard",
      "discriminator": [
        80,
        108,
        68,
        230,
        253,
        134,
        39,
        155
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "guard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "permanentDelegate",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "guard",
      "discriminator": [
        54,
        187,
        84,
        137,
        192,
        15,
        74,
        248
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badMint",
      "msg": "Wrong mint for this guard"
    },
    {
      "code": 6001,
      "name": "onlyDelegateAllowed",
      "msg": "Only the permanent delegate is allowed to make transfers"
    },
    {
      "code": 6002,
      "name": "authorityMustSign",
      "msg": "Authority must have signed"
    }
  ],
  "types": [
    {
      "name": "guard",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "permanentDelegate",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
