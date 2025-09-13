import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { etlCursors, type EtlCursor, type NewEtlCursor } from './schema';
import { CursorManager, CursorData } from '../types';

export class DatabaseCursorManager implements CursorManager {
  constructor(private db: NodePgDatabase<any>) {}

  async getCursor(jobName: string): Promise<CursorData | null> {
    try {
      const result = await this.db
        .select()
        .from(etlCursors)
        .where(eq(etlCursors.jobName, jobName))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const cursor = result[0];
      return {
        value: cursor.cursorValue,
        metadata: cursor.metadata as Record<string, any> || {},
        lastProcessedAt: cursor.lastProcessedAt,
      };
    } catch (error) {
      throw new Error(`Failed to get cursor for job ${jobName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateCursor(
    jobName: string, 
    cursorValue: string, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const now = new Date();
      
      // Try to update existing cursor first
      const updateResult = await this.db
        .update(etlCursors)
        .set({
          cursorValue,
          metadata,
          lastProcessedAt: now,
          updatedAt: now,
        })
        .where(eq(etlCursors.jobName, jobName));

      // If no rows were updated, insert a new cursor
      if (updateResult.rowCount === 0) {
        const newCursor: NewEtlCursor = {
          jobName,
          cursorValue,
          metadata,
          lastProcessedAt: now,
        };

        await this.db.insert(etlCursors).values(newCursor);
      }
    } catch (error) {
      throw new Error(`Failed to update cursor for job ${jobName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteCursor(jobName: string): Promise<void> {
    try {
      await this.db
        .delete(etlCursors)
        .where(eq(etlCursors.jobName, jobName));
    } catch (error) {
      throw new Error(`Failed to delete cursor for job ${jobName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listCursors(): Promise<EtlCursor[]> {
    try {
      return await this.db.select().from(etlCursors);
    } catch (error) {
      throw new Error(`Failed to list cursors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCursorAge(jobName: string): Promise<number | null> {
    const cursor = await this.getCursor(jobName);
    if (!cursor) {
      return null;
    }

    return Date.now() - cursor.lastProcessedAt.getTime();
  }

  async cleanupOldCursors(maxAgeMs: number): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - maxAgeMs);
      
      const result = await this.db
        .delete(etlCursors)
        .where(eq(etlCursors.lastProcessedAt, cutoffDate));

      return result.rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to cleanup old cursors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}