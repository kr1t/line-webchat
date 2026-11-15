import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { cannedResponses } from '../db/schema.js';
import type { CannedBody } from './settings.schemas.js';

const columns = {
  id: cannedResponses.id,
  shortcut: cannedResponses.shortcut,
  title: cannedResponses.title,
  body: cannedResponses.body,
  useCount: cannedResponses.useCount,
};

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { cause?: { code?: string } }).cause?.code === '23505';
}

@Injectable()
export class CannedService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list() {
    return this.db.select(columns).from(cannedResponses).orderBy(desc(cannedResponses.useCount), asc(cannedResponses.shortcut));
  }

  async create(body: CannedBody, adminId: string) {
    try {
      const [row] = await this.db.insert(cannedResponses).values({ ...body, createdById: adminId }).returning(columns);
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'shortcut_taken' });
      throw error;
    }
  }

  async update(id: string, body: CannedBody) {
    try {
      const [row] = await this.db.update(cannedResponses).set(body).where(eq(cannedResponses.id, id)).returning(columns);
      if (!row) throw new NotFoundException();
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'shortcut_taken' });
      throw error;
    }
  }

  async remove(id: string) {
    const deleted = await this.db.delete(cannedResponses).where(eq(cannedResponses.id, id)).returning({ id: cannedResponses.id });
    if (deleted.length === 0) throw new NotFoundException();
  }

  async markUsed(id: string) {
    await this.db
      .update(cannedResponses)
      .set({ useCount: sql`${cannedResponses.useCount} + 1` })
      .where(eq(cannedResponses.id, id));
  }
}
