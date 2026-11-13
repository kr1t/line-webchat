import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { webhook } from '@line/bot-sdk';
import { Public } from '../auth/decorators.js';
import { SkipOriginCheck } from '../auth/origin.guard.js';
import { LineSignatureGuard } from './line-signature.guard.js';
import { LineWebhookService } from './line-webhook.service.js';

// Authenticated by the LINE signature instead of a session
@Public()
@SkipOriginCheck()
@Controller('line')
export class LineWebhookController {
  constructor(private readonly webhookService: LineWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LineSignatureGuard)
  async receive(@Body() body: webhook.CallbackRequest): Promise<Record<string, never>> {
    if (!body || !Array.isArray(body.events)) {
      throw new BadRequestException();
    }

    // Finish all writes before responding: Vercel may freeze the function right after
    await this.webhookService.handleEvents(body.events);
    return {};
  }
}
