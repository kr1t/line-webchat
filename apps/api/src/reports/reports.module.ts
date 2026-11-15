import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { DashboardService } from './dashboard.service.js';
import { ReportsController } from './reports.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [TicketsModule],
  controllers: [ReportsController],
  providers: [DashboardService, SearchService],
})
export class ReportsModule {}
