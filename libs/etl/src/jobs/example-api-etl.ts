import { BaseEtlJob } from '../base/etl-job';
import { ExtractResult, TransformResult, LoadResult, EtlJobConfig } from '../types';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
// This example uses a hypothetical users table - replace with your actual schema

interface NewUser {
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// Example: ETL job that fetches users from an external API
interface ApiUser {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'inactive';
}

interface TransformedUser {
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ExampleApiEtlJob extends BaseEtlJob<ApiUser, TransformedUser> {
  constructor(
    config: EtlJobConfig,
    db: NodePgDatabase<any>,
    private apiBaseUrl: string = 'https://api.example.com',
    private apiKey?: string
  ) {
    super(config, db);
  }

  protected async extract(cursor?: string, batchSize: number = 1000): Promise<ExtractResult<ApiUser>> {
    try {
      // Build API URL with cursor and batch size
      const url = new URL(`${this.apiBaseUrl}/users`);
      url.searchParams.set('limit', batchSize.toString());
      
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      // Make API request
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Assuming API returns: { users: ApiUser[], next_cursor?: string, has_more: boolean }
      return {
        data: data.users || [],
        nextCursor: data.next_cursor,
        hasMore: data.has_more || false,
        metadata: {
          responseTime: response.headers.get('x-response-time'),
          rateLimit: response.headers.get('x-rate-limit-remaining'),
        },
      };
    } catch (error) {
      throw new Error(`Extract failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async transform(data: ApiUser[]): Promise<TransformResult<TransformedUser>> {
    const transformed: TransformedUser[] = [];
    const errors: Array<{ originalData: ApiUser; error: Error; index: number }> = [];

    for (let i = 0; i < data.length; i++) {
      const user = data[i];

      try {
        // Validate required fields
        if (!user.email || !user.name) {
          throw new Error('Missing required fields: email or name');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(user.email)) {
          throw new Error('Invalid email format');
        }

        // Skip inactive users
        if (user.status === 'inactive') {
          continue;
        }

        // Transform the data
        const transformedUser: TransformedUser = {
          email: user.email.toLowerCase().trim(),
          name: user.name.trim(),
          createdAt: new Date(user.created_at),
          updatedAt: new Date(user.updated_at),
        };

        // Validate dates
        if (isNaN(transformedUser.createdAt.getTime()) || isNaN(transformedUser.updatedAt.getTime())) {
          throw new Error('Invalid date format');
        }

        transformed.push(transformedUser);
      } catch (error) {
        errors.push({
          originalData: user,
          error: error instanceof Error ? error : new Error(String(error)),
          index: i,
        });
      }
    }

    return {
      data: transformed,
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        originalCount: data.length,
        transformedCount: transformed.length,
        errorCount: errors.length,
        skippedInactive: data.filter(u => u.status === 'inactive').length,
      },
    };
  }

  protected async load(data: TransformedUser[]): Promise<LoadResult> {
    let processedCount = 0;
    const errors: Array<{ data: TransformedUser; error: Error; index: number }> = [];

    try {
      // Convert to database format
      const dbUsers: NewUser[] = data.map(user => ({
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));

      // Batch insert (replace with your actual table)
      // This is just an example - you would use your actual database schema
      console.log('Would insert users:', dbUsers.length);
      processedCount = dbUsers.length;

      // Example implementation (commented out since we don't have the actual table):
      // for (let i = 0; i < dbUsers.length; i++) {
      //   const user = dbUsers[i];
      //   const originalUser = data[i];
      //
      //   try {
      //     await this.db
      //       .insert(usersTable)
      //       .values(user)
      //       .onConflictDoUpdate({
      //         target: usersTable.email,
      //         set: {
      //           name: user.name,
      //           updatedAt: user.updatedAt,
      //         },
      //       });
      //
      //     processedCount++;
      //   } catch (error) {
      //     errors.push({
      //       data: originalUser,
      //       error: error instanceof Error ? error : new Error(String(error)),
      //       index: i,
      //     });
      //   }
      // }

      return {
        success: errors.length === 0,
        processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          totalRecords: data.length,
          successCount: processedCount,
          errorCount: errors.length,
        },
      };
    } catch (error) {
      throw new Error(`Load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Optional: Override lifecycle hooks
  protected async beforeJob(): Promise<void> {
    console.log(`Starting ETL job: ${this.config.jobName}`);
    console.log(`API Base URL: ${this.apiBaseUrl}`);
    console.log(`Batch Size: ${this.config.batchSize}`);
  }

  protected async afterJob(result: any): Promise<void> {
    console.log(`ETL job completed: ${this.config.jobName}`);
    console.log(`Success: ${result.success}`);
    console.log(`Total Extracted: ${result.totalExtracted}`);
    console.log(`Total Loaded: ${result.totalLoaded}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`Duration: ${result.duration}ms`);
  }

  protected async onError(error: Error, stage: 'extract' | 'transform' | 'load', data?: any): Promise<void> {
    console.error(`Error in ${stage} stage:`, error.message);
    if (data) {
      console.error('Failed data:', JSON.stringify(data, null, 2));
    }

    // Could send to monitoring service, etc.
  }
}