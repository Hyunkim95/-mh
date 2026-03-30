import { describe, it, expect } from "vitest";
import { PROGRAM_IDS } from "../programs";
import { PublicKey } from "@solana/web3.js";

describe("PROGRAM_IDS", () => {
  it("SYSTEM is a valid PublicKey", () => {
    expect(PROGRAM_IDS.SYSTEM).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.SYSTEM.toBase58()).toBe("11111111111111111111111111111112");
  });

  it("TOKEN is the SPL Token program", () => {
    expect(PROGRAM_IDS.TOKEN).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.TOKEN.toBase58()).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  });

  it("ASSOCIATED_TOKEN is the ATA program", () => {
    expect(PROGRAM_IDS.ASSOCIATED_TOKEN).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.ASSOCIATED_TOKEN.toBase58()).toBe("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  });

  it("RENT is the Rent sysvar", () => {
    expect(PROGRAM_IDS.RENT).toBeInstanceOf(PublicKey);
    expect(PROGRAM_IDS.RENT.toBase58()).toBe("SysvarRent111111111111111111111111111111111");
  });
});
