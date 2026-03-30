import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseEtlJob } from "../base/etl-job";
import type {
  ExtractResult,
  TransformResult,
  LoadResult,
  CursorManager,
  EtlJobConfig,
} from "../types";

// In-memory cursor manager for testing
function createMockCursorManager(): CursorManager {
  const cursors = new Map<string, { value: string; metadata?: Record<string, any>; lastProcessedAt: Date }>();
  return {
    getCursor: vi.fn(async (jobName: string) => cursors.get(jobName) ?? null),
    updateCursor: vi.fn(async (jobName: string, value: string, metadata?: Record<string, any>) => {
      cursors.set(jobName, { value, metadata, lastProcessedAt: new Date() });
    }),
    deleteCursor: vi.fn(async (jobName: string) => {
      cursors.delete(jobName);
    }),
  };
}

// Concrete test subclass
class TestEtlJob extends BaseEtlJob<string, string> {
  extractFn = vi.fn<(cursor?: string, batchSize?: number) => Promise<ExtractResult<string>>>();
  transformFn = vi.fn<(data: string[]) => Promise<TransformResult<string>>>();
  loadFn = vi.fn<(data: string[]) => Promise<LoadResult>>();
  beforeJobFn = vi.fn<() => Promise<void>>();
  afterJobFn = vi.fn<(result: any) => Promise<void>>();
  onErrorFn = vi.fn<(error: Error, stage: string, data?: any) => Promise<void>>();

  protected async extract(cursor?: string, batchSize?: number) {
    return this.extractFn(cursor, batchSize);
  }
  protected async transform(data: string[]) {
    return this.transformFn(data);
  }
  protected async load(data: string[]) {
    return this.loadFn(data);
  }
  protected async beforeJob() {
    return this.beforeJobFn();
  }
  protected async afterJob(result: any) {
    return this.afterJobFn(result);
  }
  protected async onError(error: Error, stage: any, data?: any) {
    return this.onErrorFn(error, stage, data);
  }
}

describe("BaseEtlJob", () => {
  let cursorManager: CursorManager;
  let job: TestEtlJob;
  const mockDb = {} as any;

  function createJob(configOverrides?: Partial<EtlJobConfig>) {
    cursorManager = createMockCursorManager();
    job = new TestEtlJob(
      { jobName: "test-job", ...configOverrides },
      mockDb,
      cursorManager
    );
    return job;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs a successful ETL pipeline", async () => {
    createJob();
    job.extractFn
      .mockResolvedValueOnce({
        data: ["a", "b"],
        hasMore: false,
        nextCursor: "cursor-1",
      });
    job.transformFn.mockResolvedValueOnce({ data: ["A", "B"] });
    job.loadFn.mockResolvedValueOnce({ success: true, processedCount: 2 });

    const result = await job.run();

    expect(result.success).toBe(true);
    expect(result.totalExtracted).toBe(2);
    expect(result.totalTransformed).toBe(2);
    expect(result.totalLoaded).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(job.beforeJobFn).toHaveBeenCalledOnce();
    expect(job.afterJobFn).toHaveBeenCalledOnce();
    expect(cursorManager.updateCursor).toHaveBeenCalledWith(
      "test-job",
      "cursor-1",
      expect.any(Object)
    );
  });

  it("stops when extract returns empty data", async () => {
    createJob();
    job.extractFn.mockResolvedValueOnce({ data: [], hasMore: false });

    const result = await job.run();

    expect(result.success).toBe(true);
    expect(result.totalExtracted).toBe(0);
    expect(job.transformFn).not.toHaveBeenCalled();
    expect(job.loadFn).not.toHaveBeenCalled();
  });

  it("processes multiple batches", async () => {
    createJob();
    job.extractFn
      .mockResolvedValueOnce({
        data: ["a", "b"],
        hasMore: true,
        nextCursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        data: ["c"],
        hasMore: false,
        nextCursor: "cursor-2",
      });
    job.transformFn
      .mockResolvedValueOnce({ data: ["A", "B"] })
      .mockResolvedValueOnce({ data: ["C"] });
    job.loadFn
      .mockResolvedValueOnce({ success: true, processedCount: 2 })
      .mockResolvedValueOnce({ success: true, processedCount: 1 });

    const result = await job.run();

    expect(result.totalExtracted).toBe(3);
    expect(result.totalTransformed).toBe(3);
    expect(result.totalLoaded).toBe(3);
    expect(result.success).toBe(true);
  });

  it("collects transform errors", async () => {
    createJob();
    job.extractFn.mockResolvedValueOnce({
      data: ["a"],
      hasMore: false,
    });
    job.transformFn.mockResolvedValueOnce({
      data: ["A"],
      errors: [{ originalData: "bad", error: new Error("transform fail"), index: 0 }],
    });
    job.loadFn.mockResolvedValueOnce({ success: true, processedCount: 1 });

    const result = await job.run();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe("transform");
    expect(result.success).toBe(false);
  });

  it("collects load errors", async () => {
    createJob();
    job.extractFn.mockResolvedValueOnce({
      data: ["a"],
      hasMore: false,
    });
    job.transformFn.mockResolvedValueOnce({ data: ["A"] });
    job.loadFn.mockResolvedValueOnce({
      success: false,
      processedCount: 0,
      errors: [{ data: "A", error: new Error("load fail"), index: 0 }],
    });

    const result = await job.run();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe("load");
    expect(result.success).toBe(false);
  });

  it("stops on extract error after retries exhausted", async () => {
    createJob({ maxRetries: 2, retryDelay: 0 });
    job.extractFn.mockRejectedValue(new Error("extract failed"));

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].stage).toBe("extract");
  });

  it("calls beforeJob hook and afterJob hook", async () => {
    createJob();
    job.extractFn.mockResolvedValueOnce({ data: [], hasMore: false });

    await job.run();

    expect(job.beforeJobFn).toHaveBeenCalledOnce();
    expect(job.afterJobFn).toHaveBeenCalledOnce();
  });

  it("tracks duration", async () => {
    createJob();
    job.extractFn.mockResolvedValueOnce({ data: [], hasMore: false });

    const result = await job.run();

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.endTime.getTime()).toBeGreaterThanOrEqual(result.startTime.getTime());
  });

  it("handles beforeJob failure gracefully", async () => {
    createJob();
    job.beforeJobFn.mockRejectedValueOnce(new Error("before boom"));

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe("extract"); // wraps in extract stage
    expect(job.afterJobFn).toHaveBeenCalledOnce();
  });

  it("skips load when transform produces empty data", async () => {
    createJob();
    job.extractFn.mockResolvedValueOnce({
      data: ["a"],
      hasMore: false,
    });
    job.transformFn.mockResolvedValueOnce({ data: [] });

    const result = await job.run();

    expect(result.totalTransformed).toBe(0);
    expect(job.loadFn).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("calls onError when extract retries exhaust", async () => {
    createJob({ maxRetries: 2, retryDelay: 1 });
    job.extractFn.mockRejectedValue(new Error("rpc timeout"));

    await job.run();

    expect(job.onErrorFn).toHaveBeenCalled();
    expect(job.onErrorFn.mock.calls[0][1]).toBe("extract");
  });

  describe("utility methods", () => {
    it("reset deletes cursor and resets state", async () => {
      createJob();
      await job.reset();
      expect(cursorManager.deleteCursor).toHaveBeenCalledWith("test-job");
      expect(job.getState().status).toBe("idle");
    });

    it("getCursor delegates to cursor manager", async () => {
      createJob();
      await job.getCursor();
      expect(cursorManager.getCursor).toHaveBeenCalledWith("test-job");
    });

    it("getConfig returns a copy of config with defaults", () => {
      createJob();
      const config = job.getConfig();
      expect(config.jobName).toBe("test-job");
      expect(config.batchSize).toBe(1000);
      expect(config.maxRetries).toBe(3);
    });
  });
});
