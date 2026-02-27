/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/multi_hopper_project.json`.
 */
export type MultiHopperProject = {
  "address": "3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh",
  "metadata": {
    "name": "multiHopperProject",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addHops",
      "discriminator": [
        117,
        252,
        74,
        181,
        206,
        102,
        140,
        198
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "routeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "routeState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "hops",
          "type": {
            "vec": {
              "defined": {
                "name": "hop"
              }
            }
          }
        }
      ]
    },
    {
      "name": "initializeRoute",
      "discriminator": [
        28,
        103,
        136,
        240,
        147,
        71,
        127,
        132
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  95,
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "routeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "routeState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "routeTokenMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "permanentDelegate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "originalTreasuryAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeTreasury"
              },
              {
                "kind": "account",
                "path": "originalTokenProgram"
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "originalMint"
        },
        {
          "name": "originalFrom",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "originalTokenProgram"
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "feeTreasury",
          "writable": true
        },
        {
          "name": "solTreasury",
          "writable": true
        },
        {
          "name": "originalTokenProgram"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "transferHookGuardProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "executor",
          "type": "pubkey"
        },
        {
          "name": "hopAmount",
          "type": "u64"
        },
        {
          "name": "numHops",
          "type": "u8"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeRouteSol",
      "discriminator": [
        63,
        240,
        117,
        234,
        142,
        95,
        131,
        181
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  95,
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "routeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "routeState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "routeTokenMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "permanentDelegate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "writable": true
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "transferHookGuardProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "executor",
          "type": "pubkey"
        },
        {
          "name": "hopAmount",
          "type": "u64"
        },
        {
          "name": "numHops",
          "type": "u8"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeTokenConfig",
      "discriminator": [
        60,
        14,
        114,
        86,
        25,
        84,
        93,
        149
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  95,
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
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
          "name": "minTransfer",
          "type": "u64"
        },
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "signer",
          "type": "pubkey"
        },
        {
          "name": "feeTreasury",
          "type": "pubkey"
        },
        {
          "name": "maxHops",
          "type": "u8"
        },
        {
          "name": "flatFeeLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "triggerHop",
      "discriminator": [
        34,
        103,
        130,
        164,
        72,
        212,
        157,
        87
      ],
      "accounts": [
        {
          "name": "routeConfig"
        },
        {
          "name": "executor",
          "writable": true,
          "signer": true,
          "relations": [
            "routeConfig"
          ]
        },
        {
          "name": "tokenConfig"
        },
        {
          "name": "routeState",
          "writable": true
        },
        {
          "name": "pairMint"
        },
        {
          "name": "pairFrom",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "fromOwner"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "pairMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "pairTo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "toOwner"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "pairMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "fromOwner"
        },
        {
          "name": "toOwner"
        },
        {
          "name": "permanentDelegate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "originalTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unwrap",
      "discriminator": [
        126,
        175,
        198,
        14,
        212,
        69,
        50,
        44
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig"
        },
        {
          "name": "originalMint"
        },
        {
          "name": "routeMint",
          "writable": true
        },
        {
          "name": "routeFrom",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "from"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "routeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "to",
          "writable": true
        },
        {
          "name": "originalTo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "from"
              },
              {
                "kind": "account",
                "path": "originalTokenProgram"
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuth"
              },
              {
                "kind": "account",
                "path": "originalTokenProgram"
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultAuth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ]
          }
        },
        {
          "name": "permanentDelegate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "routeConfig",
          "docs": [
            "Route config for access control"
          ]
        },
        {
          "name": "routeState",
          "docs": [
            "Route state for access control"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "originalTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unwrapSol",
      "discriminator": [
        99,
        40,
        14,
        105,
        45,
        107,
        172,
        201
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig"
        },
        {
          "name": "wsolMint",
          "writable": true
        },
        {
          "name": "wsolFrom",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "from"
              },
              {
                "kind": "account",
                "path": "token2022Program"
              },
              {
                "kind": "account",
                "path": "wsolMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "to",
          "writable": true
        },
        {
          "name": "permanentDelegate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "token_config.creator",
                "account": "tokenConfig"
              }
            ]
          }
        },
        {
          "name": "routeConfig",
          "docs": [
            "Route config for access control"
          ]
        },
        {
          "name": "routeState",
          "docs": [
            "Route state for access control"
          ]
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateTokenConfig",
      "discriminator": [
        231,
        122,
        181,
        79,
        255,
        79,
        144,
        167
      ],
      "accounts": [
        {
          "name": "tokenConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  95,
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "minTransfer",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "feeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "signer",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "feeTreasury",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "maxHops",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "flatFeeLamports",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "wrap",
      "discriminator": [
        178,
        40,
        10,
        189,
        228,
        129,
        186,
        140
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig"
        },
        {
          "name": "routeConfig"
        },
        {
          "name": "originalMint"
        },
        {
          "name": "routeMint",
          "writable": true
        },
        {
          "name": "originalFrom",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "originalTokenProgram"
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuth"
              },
              {
                "kind": "account",
                "path": "originalTokenProgram"
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultAuth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "originalMint"
              }
            ]
          }
        },
        {
          "name": "routeTo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "routeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "wrapperMintAuth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "originalTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "wrapSol",
      "discriminator": [
        47,
        62,
        155,
        172,
        131,
        205,
        37,
        201
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenConfig"
        },
        {
          "name": "routeConfig"
        },
        {
          "name": "wsolMint",
          "writable": true
        },
        {
          "name": "wsolTo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "token2022Program"
              },
              {
                "kind": "account",
                "path": "wsolMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "routeId"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "token_config.creator",
                "account": "tokenConfig"
              }
            ]
          }
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "routeId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "routeConfig",
      "discriminator": [
        199,
        3,
        230,
        135,
        198,
        43,
        57,
        160
      ]
    },
    {
      "name": "routeState",
      "discriminator": [
        83,
        247,
        97,
        21,
        140,
        129,
        221,
        0
      ]
    },
    {
      "name": "tokenConfig",
      "discriminator": [
        92,
        73,
        255,
        43,
        107,
        51,
        117,
        101
      ]
    }
  ],
  "events": [
    {
      "name": "hopCompleted",
      "discriminator": [
        186,
        32,
        233,
        72,
        129,
        47,
        51,
        184
      ]
    },
    {
      "name": "hopsAdded",
      "discriminator": [
        245,
        124,
        174,
        134,
        40,
        169,
        93,
        237
      ]
    },
    {
      "name": "routeCreated",
      "discriminator": [
        125,
        1,
        229,
        56,
        204,
        188,
        8,
        245
      ]
    },
    {
      "name": "routeFinished",
      "discriminator": [
        111,
        59,
        219,
        28,
        91,
        251,
        39,
        78
      ]
    },
    {
      "name": "tokenConfigCreated",
      "discriminator": [
        123,
        54,
        18,
        175,
        151,
        0,
        26,
        237
      ]
    },
    {
      "name": "tokenConfigUpdated",
      "discriminator": [
        64,
        189,
        195,
        27,
        63,
        187,
        96,
        68
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "emptyRoute",
      "msg": "Route cannot be empty"
    },
    {
      "code": 6001,
      "name": "tooManyHops",
      "msg": "Too many hops in route"
    },
    {
      "code": 6002,
      "name": "routeNotStarted",
      "msg": "Route not started"
    },
    {
      "code": 6003,
      "name": "noMoreHops",
      "msg": "No more hops remaining"
    },
    {
      "code": 6004,
      "name": "delayNotElapsed",
      "msg": "Per-hop delay not yet elapsed"
    },
    {
      "code": 6005,
      "name": "fromOwnerMismatch",
      "msg": "From token account owner mismatch"
    },
    {
      "code": 6006,
      "name": "toOwnerMismatch",
      "msg": "To token account owner mismatch"
    },
    {
      "code": 6007,
      "name": "badMint",
      "msg": "Token mint mismatch"
    },
    {
      "code": 6008,
      "name": "amountTooSmall",
      "msg": "Amount is smaller than minimum transfer"
    },
    {
      "code": 6009,
      "name": "delayTooLong",
      "msg": "Hop delay exceeds maximum allowed"
    },
    {
      "code": 6010,
      "name": "timelocked",
      "msg": "Route still timelocked"
    },
    {
      "code": 6011,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6012,
      "name": "feeTreasuryMismatch",
      "msg": "Fee treasury account owner mismatch"
    },
    {
      "code": 6013,
      "name": "missingWrapAccounts",
      "msg": "Missing wrap accounts for first hop"
    },
    {
      "code": 6014,
      "name": "missingUnwrapAccounts",
      "msg": "Missing unwrap accounts for last hop"
    },
    {
      "code": 6015,
      "name": "depositMismatch",
      "msg": "Deposit amount doesn't match sum of hops plus fees"
    },
    {
      "code": 6016,
      "name": "unauthorizedUnwrap",
      "msg": "Unauthorized unwrap: only route owner or after last hop"
    },
    {
      "code": 6017,
      "name": "unauthorizedUpdate",
      "msg": "Unauthorized update: only creator can update token config"
    },
    {
      "code": 6018,
      "name": "invalidExecutionTime",
      "msg": "Invalid execution time: must be in the future"
    },
    {
      "code": 6019,
      "name": "routeFinalized",
      "msg": "Route is already finalized"
    },
    {
      "code": 6020,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6021,
      "name": "exceedsPrepaidHops",
      "msg": "Total hops exceeds prepaid amount"
    },
    {
      "code": 6022,
      "name": "invalidHopCount",
      "msg": "Invalid hop count"
    }
  ],
  "types": [
    {
      "name": "hop",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "executeAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hopCompleted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "route",
            "type": "pubkey"
          },
          {
            "name": "hopIndex",
            "type": "u8"
          },
          {
            "name": "fromOwner",
            "type": "pubkey"
          },
          {
            "name": "toOwner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hopsAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "route",
            "type": "pubkey"
          },
          {
            "name": "newHops",
            "type": "u8"
          },
          {
            "name": "totalHops",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "routeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "routeId",
            "type": "u64"
          },
          {
            "name": "originalMint",
            "type": "pubkey"
          },
          {
            "name": "routeTokenMint",
            "type": "pubkey"
          },
          {
            "name": "mintAuthority",
            "type": "pubkey"
          },
          {
            "name": "sourceOwner",
            "type": "pubkey"
          },
          {
            "name": "executor",
            "type": "pubkey"
          },
          {
            "name": "hops",
            "type": {
              "vec": {
                "defined": {
                  "name": "hop"
                }
              }
            }
          },
          {
            "name": "hopAmount",
            "type": "u64"
          },
          {
            "name": "isFinalized",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "prepaidHops",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "routeCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "route",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "hops",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "routeFinished",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "route",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "routeState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "currentHopIndex",
            "type": "u8"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "lastHopAt",
            "type": {
              "vec": "i64"
            }
          },
          {
            "name": "hopsCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tokenConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "minTransfer",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "feeTreasury",
            "type": "pubkey"
          },
          {
            "name": "maxHops",
            "type": "u8"
          },
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "flatFeeLamports",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokenConfigCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenConfig",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "minTransfer",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "feeTreasury",
            "type": "pubkey"
          },
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "maxHops",
            "type": "u8"
          },
          {
            "name": "flatFeeLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tokenConfigUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenConfig",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "minTransfer",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "feeTreasury",
            "type": "pubkey"
          },
          {
            "name": "maxHops",
            "type": "u8"
          },
          {
            "name": "flatFeeLamports",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
