import { describe, it, expect, vi } from "vitest";
import { chunk, processBatches, retry, RateLimiter } from "../utils/batch";

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns single chunk when size >= array length", () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it("returns empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("handles chunk size of 1", () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it("handles exact divisible length", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("processBatches", () => {
  it("processes all items in batches", async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = vi.fn(async (batch: number[]) => batch.reduce((a, b) => a + b, 0));
    const results = await processBatches(items, processor, 2);
    expect(results).toEqual([3, 7, 5]); // [1+2, 3+4, 5]
    expect(processor).toHaveBeenCalledTimes(3);
  });

  it("respects concurrency limit", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    let maxConcurrent = 0;
    let current = 0;

    const processor = vi.fn(async (batch: number[]) => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return batch.length;
    });

    await processBatches(items, processor, 2, 2);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("handles empty items", async () => {
    const processor = vi.fn(async () => "done");
    const results = await processBatches([], processor);
    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });
});

describe("retry", () => {
  it("returns result on first success", async () => {
    const op = vi.fn(async () => 42);
    const result = await retry(op, 3, 10);
    expect(result).toBe(42);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return "ok";
    });

    const result = await retry(op, 3, 10, 100);
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts exhausted", async () => {
    const op = vi.fn(async () => {
      throw new Error("always fails");
    });

    await expect(retry(op, 2, 10, 100)).rejects.toThrow("always fails");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("wraps non-Error throws as Error", async () => {
    const op = vi.fn(async () => {
      throw "string error";
    });

    await expect(retry(op, 1, 10)).rejects.toThrow("string error");
  });
});

describe("RateLimiter", () => {
  it("allows immediate acquisition when tokens available", async () => {
    const limiter = new RateLimiter(10, 10);
    const start = Date.now();
    await limiter.acquire(1);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("refills tokens over time", async () => {
    const limiter = new RateLimiter(2, 100); // 100 tokens/sec
    await limiter.acquire(2); // drain all tokens
    await new Promise((r) => setTimeout(r, 50)); // wait for refill
    // Should be able to acquire again after refill
    const start = Date.now();
    await limiter.acquire(1);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
