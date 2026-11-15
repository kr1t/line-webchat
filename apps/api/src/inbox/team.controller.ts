import { Controller, Get } from '@nestjs/common';
import { ConversationStatusService } from '../conversations/conversation-status.service.js';

@Controller('team')
export class TeamController {
  constructor(private readonly status: ConversationStatusService) {}

  /** Active admins, for handing over chats and tickets. */
  @Get()
  list() {
    return this.status.team();
  }
}
