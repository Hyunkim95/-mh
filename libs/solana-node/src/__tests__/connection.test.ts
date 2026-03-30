import { describe, it, expect } from "vitest";
import { createConnection } from "../connection";
import { Connection } from "@solana/web3.js";

describe("createConnection", () => {
  it("creates a Connection instance", () => {
    const conn = createConnection("devnet");
    expect(conn).toBeInstanceOf(Connection);
  });

  it("defaults to devnet when no endpoint given", () => {
    const conn = createConnection();
    expect(conn.rpcEndpoint).toContain("devnet");
  });

  it("uses custom URL when starts with http", () => {
    const conn = createConnection("https://my-rpc.example.com");
    expect(conn.rpcEndpoint).toBe("https://my-rpc.example.com");
  });

  it("uses cluster name for known clusters", () => {
    const conn = createConnection("mainnet-beta");
    expect(conn.rpcEndpoint).toContain("mainnet");
  });

  it("respects commitment level", () => {
    const conn = createConnection("devnet", "finalized");
    expect(conn.commitment).toBe("finalized");
  });

  it("defaults to confirmed commitment", () => {
    const conn = createConnection("devnet");
    expect(conn.commitment).toBe("confirmed");
  });
});
