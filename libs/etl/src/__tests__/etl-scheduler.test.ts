import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EtlScheduler } from "../base/etl-scheduler";
import type { BaseEtlJob } from "../base/etl-job";
import type { EtlJobResult } from "../types";

function createMockJob(
  result: Partial<EtlJobResult> = {}
): BaseEtlJob<any, any> {
  const defaultResult: EtlJobResult = {
    jobName: "mock-job",
    success: true,
    startTime: new Date(),
    endTime: new Date(),
    duration: 100,
    totalExtracted: 10,
    totalTransformed: 10,
    totalLoaded: 10,
    errors: [],
    ...result,
  };
  return {
    run: vi.fn().mockResolvedValue(defaultResult),
  } as any;
}

describe("EtlScheduler", () => {
  let scheduler: EtlScheduler;

  beforeEach(() => {
    scheduler = new EtlScheduler({ logLevel: "error" });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe("addJob / removeJob", () => {
    it("adds and runs a job", async () => {
      const job = createMockJob();
      scheduler.addJob("test", job, { intervalMs: 60000 });

      const result = await scheduler.runJob("test");
      expect(result.success).toBe(true);
      expect(job.run).toHaveBeenCalledTimes(1);
    });

    it("removes a job", () => {
      const job = createMockJob();
      scheduler.addJob("test", job, { intervalMs: 60000 });
      expect(scheduler.removeJob("test")).toBe(true);
      expect(scheduler.removeJob("nonexistent")).toBe(false);
    });
  });

  describe("setJobEnabled", () => {
    it("disables and enables a job", () => {
      const job = createMockJob();
      scheduler.addJob("test", job, { intervalMs: 60000 });

      expect(scheduler.setJobEnabled("test", false)).toBe(true);
      expect(scheduler.getJobStatuses()["test"].enabled).toBe(false);

      expect(scheduler.setJobEnabled("test", true)).toBe(true);
      expect(scheduler.getJobStatuses()["test"].enabled).toBe(true);
    });

    it("returns false for nonexistent job", () => {
      expect(scheduler.setJobEnabled("nope", true)).toBe(false);
    });
  });

  describe("runJob", () => {
    it("throws for unknown job", async () => {
      await expect(scheduler.runJob("unknown")).rejects.toThrow("not found");
    });

    it("throws for disabled job without force", async () => {
      const job = createMockJob();
      scheduler.addJob("test", job, { intervalMs: 60000 }, false);
      await expect(scheduler.runJob("test")).rejects.toThrow("disabled");
    });

    it("runs disabled job with force=true", async () => {
      const job = createMockJob();
      scheduler.addJob("test", job, { intervalMs: 60000 }, false);

      const result = await scheduler.runJob("test", true);
      expect(result.success).toBe(true);
    });

    it("disables run-once jobs after completion", async () => {
      const job = createMockJob();
      scheduler.addJob("once", job, { runOnce: true });

      await scheduler.runJob("once");
      expect(scheduler.getJobStatuses()["once"].enabled).toBe(false);
    });
  });

  describe("getJobStatuses / getRunningJobs", () => {
    it("returns statuses for all jobs", () => {
      scheduler.addJob("a", createMockJob(), { intervalMs: 1000 });
      scheduler.addJob("b", createMockJob(), { intervalMs: 2000 }, false);

      const statuses = scheduler.getJobStatuses();
      expect(statuses["a"].enabled).toBe(true);
      expect(statuses["b"].enabled).toBe(false);
    });

    it("lists running jobs", async () => {
      let resolveRun: () => void;
      const blockingJob = {
        run: vi.fn(
          () => new Promise<EtlJobResult>((r) => (resolveRun = () => r(createMockJob().run() as any)))
        ),
      } as any;

      scheduler.addJob("blocking", blockingJob, { intervalMs: 60000 });
      const promise = scheduler.runJob("blocking");

      expect(scheduler.getRunningJobs()).toContain("blocking");
      resolveRun!();
      await promise;
      expect(scheduler.getRunningJobs()).not.toContain("blocking");
    });
  });

  describe("start / stop", () => {
    it("starts the scheduler and auto-runs interval jobs", async () => {
      vi.useFakeTimers();
      const job = createMockJob();
      scheduler.addJob("auto", job, { intervalMs: 1000 });

      scheduler.start(500); // check every 500ms

      // Initial check fires immediately in start()
      await vi.advanceTimersByTimeAsync(0);
      expect(job.run).toHaveBeenCalledTimes(1);

      scheduler.stop();
      vi.useRealTimers();
    });

    it("does not start twice", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Use info level to see the "already running" message
      const s = new EtlScheduler({ logLevel: "warn" });
      s.start(60000);
      s.start(60000); // should warn
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("already running")
      );
      s.stop();
      consoleSpy.mockRestore();
    });

    it("stop is a no-op when not running", () => {
      // Should not throw
      scheduler.stop();
    });
  });

  describe("waitForAllJobs", () => {
    it("resolves with results of running jobs", async () => {
      let resolveJob: (r: EtlJobResult) => void;
      const blockingJob = {
        run: vi.fn(
          () =>
            new Promise<EtlJobResult>((r) => {
              resolveJob = r;
            })
        ),
      } as any;

      scheduler.addJob("wait-test", blockingJob, { intervalMs: 60000 });
      const runPromise = scheduler.runJob("wait-test");

      const waitPromise = scheduler.waitForAllJobs();

      resolveJob!({
        jobName: "wait-test",
        success: true,
        startTime: new Date(),
        endTime: new Date(),
        duration: 50,
        totalExtracted: 5,
        totalTransformed: 5,
        totalLoaded: 5,
        errors: [],
      });

      const results = await waitPromise;
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      await runPromise;
    });

    it("returns empty array when no jobs running", async () => {
      const results = await scheduler.waitForAllJobs();
      expect(results).toEqual([]);
    });
  });

  describe("scheduled job execution with interval", () => {
    it("runs job again after interval elapsed", async () => {
      vi.useFakeTimers();
      const job = createMockJob();
      scheduler.addJob("interval-job", job, { intervalMs: 100 });

      scheduler.start(50); // check every 50ms

      // Initial run
      await vi.advanceTimersByTimeAsync(0);
      expect(job.run).toHaveBeenCalledTimes(1);

      // Wait for interval + check
      await vi.advanceTimersByTimeAsync(150);
      expect(job.run).toHaveBeenCalledTimes(2);

      scheduler.stop();
      vi.useRealTimers();
    });

    it("skips disabled jobs in scheduled checks", async () => {
      vi.useFakeTimers();
      const job = createMockJob();
      scheduler.addJob("disabled-job", job, { intervalMs: 100 }, false);

      scheduler.start(50);
      await vi.advanceTimersByTimeAsync(200);

      expect(job.run).not.toHaveBeenCalled();
      scheduler.stop();
      vi.useRealTimers();
    });
  });

  describe("concurrent job limit", () => {
    it("throws when max concurrent jobs reached", async () => {
      const maxConcurrent = new EtlScheduler({
        maxConcurrentJobs: 1,
        logLevel: "error",
      });

      let resolveFirst: () => void;
      const blockingJob = {
        run: vi.fn(
          () =>
            new Promise<EtlJobResult>(
              (r) =>
                (resolveFirst = () =>
                  r({
                    jobName: "blocking",
                    success: true,
                    startTime: new Date(),
                    endTime: new Date(),
                    duration: 0,
                    totalExtracted: 0,
                    totalTransformed: 0,
                    totalLoaded: 0,
                    errors: [],
                  }))
            )
        ),
      } as any;

      maxConcurrent.addJob("blocking", blockingJob, { intervalMs: 60000 });
      maxConcurrent.addJob("second", createMockJob(), { intervalMs: 60000 });

      const p = maxConcurrent.runJob("blocking");
      await expect(maxConcurrent.runJob("second")).rejects.toThrow(
        "Maximum concurrent jobs"
      );

      resolveFirst!();
      await p;
      maxConcurrent.stop();
    });
  });
});
