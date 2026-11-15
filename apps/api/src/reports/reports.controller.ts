import { Controller, Get, Query } from '@nestjs/common';
import { CurrentAdmin } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import { DashboardService } from './dashboard.service.js';
import { type DashboardQuery, dashboardQuery, type SearchQuery, searchQuery } from './reports.schemas.js';
import { SearchService } from './search.service.js';

@Controller()
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly searchService: SearchService,
  ) {}

  @Get('dashboard')
  summary(@CurrentAdmin() admin: Admin, @Query(new ZodValidationPipe(dashboardQuery)) query: DashboardQuery) {
    return this.dashboard.summary(query, admin);
  }

  @Get('dashboard/quota')
  quota() {
    return this.dashboard.quotaInfo();
  }

  @Get('search')
  search(@Query(new ZodValidationPipe(searchQuery)) query: SearchQuery) {
    return this.searchService.search(query.q);
  }
}
