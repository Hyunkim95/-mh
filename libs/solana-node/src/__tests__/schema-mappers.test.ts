import { describe, it, expect, vi } from "vitest";

vi.mock("@solana/spl-token", () => ({
  TOKEN_PROGRAM_ID: { toString: () => "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
  TOKEN_2022_PROGRAM_ID: { toString: () => "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
}));

import {
  GenericSolanaTransactionMapper,
  SPLTokenTransferMapper,
  GenericSolanaAccountMapper,
  SPLTokenAccountMapper,
  createCustomSolanaMapper,
} from "../etl/schema-mappers";
import type { SolanaTransactionData, SolanaAccountData } from "../etl/types";

function makeTxData(overrides: Partial<SolanaTransactionData> = {}): SolanaTransactionData {
  return {
    signature: "sig123",
    slot: 100,
    blockTime: 1700000000,
    fee: 5000,
    err: null,
    memo: null,
    transaction: null,
    programIds: ["prog1"],
    accountKeys: ["acc1", "acc2"],
    confirmationStatus: "confirmed",
    ...overrides,
  };
}

function makeAccountData(overrides: Partial<SolanaAccountData> = {}): SolanaAccountData {
  return {
    address: "addr1",
    lamports: 1000000,
    owner: "11111111111111111111111111111111",
    executable: false,
    rentEpoch: 100,
    space: 165,
    slot: 200,
    lastUpdated: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("schema-mappers", () => {
  describe("GenericSolanaTransactionMapper", () => {
    const mapper = new GenericSolanaTransactionMapper();

    it("maps base transaction fields", () => {
      const result = mapper.mapTransactionToSchema(makeTxData());

      expect(result.signature).toBe("sig123");
      expect(result.slot).toBe(100);
      expect(result.fee).toBe(5000);
      expect(result.success).toBe(true);
      expect(result.programIds).toEqual(["prog1"]);
      expect(result.accountKeys).toEqual(["acc1", "acc2"]);
      expect(result.blockTime).toBeInstanceOf(Date);
      expect(result.processedAt).toBeInstanceOf(Date);
    });

    it("sets success=false when err is present", () => {
      const result = mapper.mapTransactionToSchema(makeTxData({ err: "some error" }));
      expect(result.success).toBe(false);
    });

    it("handles undefined blockTime", () => {
      const result = mapper.mapTransactionToSchema(makeTxData({ blockTime: null }));
      expect(result.blockTime).toBeUndefined();
    });

    it("extracts instructions from transaction", () => {
      const tx: any = {
        transaction: {
          message: {
            instructions: [
              {
                programId: { toString: () => "prog1" },
                accounts: [{ toString: () => "acc1" }],
                data: "base64data",
              },
            ],
          },
        },
        meta: { logMessages: [], preBalances: [], postBalances: [] },
      };

      const result = mapper.mapTransactionToSchema(makeTxData({ transaction: tx }));

      expect(result.instructions).toHaveLength(1);
      expect(result.instructions[0].programId).toBe("prog1");
      expect(result.instructions[0].accounts).toEqual(["acc1"]);
      expect(result.instructions[0].data).toBe("base64data");
    });

    it("extracts token transfers", () => {
      const tx: any = {
        transaction: { message: { instructions: [] } },
        meta: {
          logMessages: [],
          preBalances: [],
          postBalances: [],
          preTokenBalances: [
            {
              accountIndex: 0,
              mint: "mint1",
              uiTokenAmount: { amount: "1000", decimals: 6 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 0,
              mint: "mint1",
              uiTokenAmount: { amount: "2000", decimals: 6 },
            },
          ],
        },
      };

      const result = mapper.mapTransactionToSchema(makeTxData({ transaction: tx }));

      expect(result.tokenTransfers).toHaveLength(1);
      expect(result.tokenTransfers![0].mint).toBe("mint1");
      expect(result.tokenTransfers![0].amount).toBe("1000");
      expect(result.tokenTransfers![0].decimals).toBe(6);
    });

    it("handles no token balance changes", () => {
      const tx: any = {
        transaction: { message: { instructions: [] } },
        meta: {
          logMessages: [],
          preBalances: [],
          postBalances: [],
          preTokenBalances: [
            { accountIndex: 0, mint: "m", uiTokenAmount: { amount: "100", decimals: 6 } },
          ],
          postTokenBalances: [
            { accountIndex: 0, mint: "m", uiTokenAmount: { amount: "100", decimals: 6 } },
          ],
        },
      };

      const result = mapper.mapTransactionToSchema(makeTxData({ transaction: tx }));
      expect(result.tokenTransfers).toBeUndefined();
    });

    it("includes metadata", () => {
      const result = mapper.mapTransactionToSchema(makeTxData({ memo: "test memo" }));
      expect(result.metadata?.memo).toBe("test memo");
      expect(result.metadata?.confirmationStatus).toBe("confirmed");
    });

    it("returns empty instructions for null transaction", () => {
      const result = mapper.mapTransactionToSchema(makeTxData());
      expect(result.instructions).toEqual([]);
    });
  });

  describe("GenericSolanaTransactionMapper.validateMappedData", () => {
    const mapper = new GenericSolanaTransactionMapper();

    it("validates valid data", () => {
      const data = mapper.mapTransactionToSchema(makeTxData());
      expect(mapper.validateMappedData(data)).toBe(true);
    });

    it("rejects data without signature", () => {
      const data = mapper.mapTransactionToSchema(makeTxData());
      data.signature = "";
      expect(mapper.validateMappedData(data)).toBe(false);
    });
  });

  describe("SPLTokenTransferMapper", () => {
    const mapper = new SPLTokenTransferMapper();

    it("maps token transfer with positive change (receiver)", () => {
      const tx: any = {
        transaction: { message: { instructions: [] } },
        meta: {
          logMessages: [],
          preBalances: [],
          postBalances: [],
          preTokenBalances: [
            { accountIndex: 1, mint: "mint1", owner: "ownerA", uiTokenAmount: { amount: "0", decimals: 9 } },
          ],
          postTokenBalances: [
            { accountIndex: 1, mint: "mint1", owner: "ownerA", uiTokenAmount: { amount: "5000", decimals: 9 } },
          ],
        },
      };

      const result = mapper.mapTransactionToSchema(
        makeTxData({ transaction: tx, accountKeys: ["acc0", "acc1"] })
      );

      expect(result.toTokenAccount).toBe("acc1");
      expect(result.toOwner).toBe("ownerA");
      expect(result.mint).toBe("mint1");
      expect(result.amount).toBe("5000");
      expect(result.decimals).toBe(9);
    });

    it("maps token transfer with negative change (sender)", () => {
      const tx: any = {
        transaction: { message: { instructions: [] } },
        meta: {
          logMessages: [],
          preBalances: [],
          postBalances: [],
          preTokenBalances: [
            { accountIndex: 0, mint: "mint1", owner: "ownerB", uiTokenAmount: { amount: "10000", decimals: 6 } },
          ],
          postTokenBalances: [
            { accountIndex: 0, mint: "mint1", owner: "ownerB", uiTokenAmount: { amount: "3000", decimals: 6 } },
          ],
        },
      };

      const result = mapper.mapTransactionToSchema(
        makeTxData({ transaction: tx, accountKeys: ["acc0"] })
      );

      expect(result.fromTokenAccount).toBe("acc0");
      expect(result.fromOwner).toBe("ownerB");
      expect(result.amount).toBe("7000");
    });

    it("throws when no token transfer found", () => {
      expect(() =>
        mapper.mapTransactionToSchema(makeTxData())
      ).toThrow("No token transfer found");
    });

    it("validates SPL token data", () => {
      const data = {
        signature: "sig",
        slot: 1,
        fee: 5000,
        success: true,
        programIds: [],
        accountKeys: [],
        preBalances: [],
        postBalances: [],
        processedAt: new Date(),
        mint: "mint1",
        amount: "1000",
      } as any;

      expect(mapper.validateMappedData(data)).toBe(true);
    });

    it("rejects data without mint", () => {
      const data = {
        signature: "sig",
        slot: 1,
        fee: 5000,
        success: true,
        mint: "",
        amount: "1000",
      } as any;

      expect(mapper.validateMappedData(data)).toBe(false);
    });
  });

  describe("GenericSolanaAccountMapper", () => {
    const mapper = new GenericSolanaAccountMapper();

    it("maps base account fields", () => {
      const result = mapper.mapAccountToSchema(makeAccountData());

      expect(result.address).toBe("addr1");
      expect(result.lamports).toBe(1000000);
      expect(result.owner).toBe("11111111111111111111111111111111");
      expect(result.executable).toBe(false);
      expect(result.isTokenAccount).toBe(false);
      expect(result.processedAt).toBeInstanceOf(Date);
    });

    it("detects token account with TOKEN_PROGRAM_ID owner", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          parsedData: {
            program: "spl-token",
            space: 165,
            parsed: {
              type: "account",
              info: {
                mint: "mint1",
                owner: "tokenOwner1",
                tokenAmount: { amount: "1000", decimals: 6 },
              },
            },
          },
        })
      );

      expect(result.isTokenAccount).toBe(true);
      expect(result.mint).toBe("mint1");
      expect(result.tokenOwner).toBe("tokenOwner1");
      expect(result.tokenAmount).toBe("1000");
      expect(result.tokenDecimals).toBe(6);
    });

    it("detects token account with TOKEN_2022_PROGRAM_ID owner", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({
          owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          parsedData: {
            program: "spl-token-2022",
            space: 165,
            parsed: {
              type: "account",
              info: {
                mint: "mint2",
                owner: "tokenOwner2",
                tokenAmount: { amount: "500", decimals: 9 },
              },
            },
          },
        })
      );

      expect(result.isTokenAccount).toBe(true);
      expect(result.mint).toBe("mint2");
    });

    it("extracts program data from parsed account", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({
          parsedData: {
            program: "system",
            space: 0,
            parsed: { type: "nonce", info: { blockhash: "hash123" } },
          },
        })
      );

      expect(result.programData).toEqual({ type: "nonce", info: { blockhash: "hash123" } });
    });

    it("extracts raw data as base64", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({ data: Buffer.from("hello") })
      );

      expect(result.programData?.rawData).toBe(Buffer.from("hello").toString("base64"));
    });

    it("sets default rentEpoch and space", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({ rentEpoch: undefined, space: undefined })
      );

      expect(result.rentEpoch).toBe(0);
      expect(result.space).toBe(0);
    });
  });

  describe("GenericSolanaAccountMapper.validateMappedData", () => {
    const mapper = new GenericSolanaAccountMapper();

    it("validates valid data", () => {
      const data = mapper.mapAccountToSchema(makeAccountData());
      expect(mapper.validateMappedData(data)).toBe(true);
    });

    it("rejects data without address", () => {
      const data = mapper.mapAccountToSchema(makeAccountData());
      data.address = "";
      expect(mapper.validateMappedData(data)).toBe(false);
    });
  });

  describe("SPLTokenAccountMapper", () => {
    const mapper = new SPLTokenAccountMapper();

    it("maps valid token account", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          parsedData: {
            program: "spl-token",
            space: 165,
            parsed: {
              type: "account",
              info: {
                mint: "mint1",
                owner: "owner1",
                tokenAmount: { amount: "5000", decimals: 9 },
                state: "initialized",
              },
            },
          },
        })
      );

      expect(result.mint).toBe("mint1");
      expect(result.tokenOwner).toBe("owner1");
      expect(result.amount).toBe("5000");
      expect(result.decimals).toBe(9);
      expect(result.state).toBe("initialized");
    });

    it("defaults state to initialized", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          parsedData: {
            program: "spl-token",
            space: 165,
            parsed: {
              type: "account",
              info: {
                mint: "m",
                owner: "o",
                tokenAmount: { amount: "0", decimals: 6 },
              },
            },
          },
        })
      );
      expect(result.state).toBe("initialized");
    });

    it("throws for non-token-program owner", () => {
      expect(() =>
        mapper.mapAccountToSchema(makeAccountData({ owner: "other-program" }))
      ).toThrow("not a token account");
    });

    it("throws for unparsed data", () => {
      expect(() =>
        mapper.mapAccountToSchema(
          makeAccountData({
            owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsedData: undefined,
          })
        )
      ).toThrow("not parsed");
    });

    it("throws for missing token info fields", () => {
      expect(() =>
        mapper.mapAccountToSchema(
          makeAccountData({
            owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsedData: {
              program: "spl-token",
              space: 165,
              parsed: { type: "account", info: {} },
            },
          })
        )
      ).toThrow("Invalid token account data");
    });

    it("validates SPL token account data", () => {
      const result = mapper.mapAccountToSchema(
        makeAccountData({
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          parsedData: {
            program: "spl-token",
            space: 165,
            parsed: {
              type: "account",
              info: {
                mint: "m",
                owner: "o",
                tokenAmount: { amount: "1", decimals: 6 },
              },
            },
          },
        })
      );
      expect(mapper.validateMappedData(result)).toBe(true);
    });
  });

  describe("createCustomSolanaMapper", () => {
    it("creates a custom transaction mapper", () => {
      const customMapper = createCustomSolanaMapper(
        "transaction",
        (_data, _baseFields) => ({ customField: "hello" }),
      );

      const result = customMapper.mapTransactionToSchema!(makeTxData());
      expect((result as { signature: string }).signature).toBe("sig123");
      expect((result as any).customField).toBe("hello");
    });

    it("applies custom validator for transaction mapper", () => {
      const customMapper = createCustomSolanaMapper(
        "transaction",
        () => ({ valid: true }),
        (data: any) => data.valid === true,
      );

      const result = customMapper.mapTransactionToSchema!(makeTxData());
      expect(customMapper.validateMappedData(result)).toBe(true);
    });

    it("creates a custom account mapper", () => {
      const customMapper = createCustomSolanaMapper(
        "account",
        (_data, _baseFields) => ({ extra: 42 }),
      );

      const result = customMapper.mapAccountToSchema!(makeAccountData());
      expect((result as { address: string }).address).toBe("addr1");
      expect((result as any).extra).toBe(42);
    });

    it("applies custom validator for account mapper", () => {
      const customMapper = createCustomSolanaMapper(
        "account",
        () => ({ ok: false }),
        (data: any) => data.ok === true,
      );

      const result = customMapper.mapAccountToSchema!(makeAccountData());
      expect(customMapper.validateMappedData(result)).toBe(false);
    });

    it("uses base validation when no custom validator", () => {
      const customMapper = createCustomSolanaMapper(
        "transaction",
        () => ({}),
      );

      const result = customMapper.mapTransactionToSchema!(makeTxData());
      expect(customMapper.validateMappedData(result)).toBe(true);
    });
  });
});
