import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt, inArray, lt } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { loginAttempts } from '../db/schema.js';
import { ATTEMPT_WINDOW_MS, MAX_FAILED_ATTEMPTS } from './constants.js';

/**
 * Counts failed attempts in Postgres (serverless instances share no memory).
 * Any key over the limit within the window blocks the attempt.
 */
@Injectable()
export class AttemptsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isBlocked(keys: string[]): Promise<boolean> {
    const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
    const rows = await this.db
      .select({ key: loginAttempts.key, failures: count() })
      .from(loginAttempts)
      .where(and(inArray(loginAttempts.key, keys), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)))
      .groupBy(loginAttempts.key);
    return rows.some((row) => row.failures >= MAX_FAILED_ATTEMPTS);
  }

  async record(keys: string[], success: boolean): Promise<void> {
    await this.db.insert(loginAttempts).values(keys.map((key) => ({ key, success })));
    // Old rows are useless after the window; prune occasionally
    if (Math.random() < 0.05) {
      await this.db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 3600_000)));
    }
  }
}
