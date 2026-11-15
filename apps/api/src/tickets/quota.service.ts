import { Inject, Injectable, Logger } from '@nestjs/common';
import { messagingApi } from '@line/bot-sdk';
import { LINE_MESSAGING_CLIENT } from '../line/line.constants.js';

const CACHE_MS = 5 * 60_000;

export interface QuotaInfo {
  /** "none" means the plan has no monthly limit */
  type: 'limited' | 'none';
  limit: number | null;
  used: number;
  remaining: number | null;
  checkedAt: string;
}

/** Monthly push quota of the OA. Cached so dashboards and notifications do not call LINE every time. */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private cached: { value: QuotaInfo; at: number } | null = null;

  constructor(@Inject(LINE_MESSAGING_CLIENT) private readonly line: messagingApi.MessagingApiClient) {}

  async get(): Promise<QuotaInfo | null> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    try {
      const [quota, usage] = await Promise.all([this.line.getMessageQuota(), this.line.getMessageQuotaConsumption()]);
      const limit = quota.type === 'limited' ? (quota.value ?? 0) : null;
      const value: QuotaInfo = {
        type: quota.type === 'limited' ? 'limited' : 'none',
        limit,
        used: usage.totalUsage,
        remaining: limit === null ? null : Math.max(0, limit - usage.totalUsage),
        checkedAt: new Date().toISOString(),
      };
      this.cached = { value, at: Date.now() };
      return value;
    } catch (error) {
      this.logger.warn(`Could not read message quota: ${(error as Error).message}`);
      return null;
    }
  }

  /** Stop optional pushes once the month's quota is gone; replies still work. */
  async isExhausted(): Promise<boolean> {
    const quota = await this.get();
    return quota?.remaining === 0;
  }

  /** Forget the cached value (tests, or right after a push failed with 429). */
  reset() {
    this.cached = null;
  }
}
