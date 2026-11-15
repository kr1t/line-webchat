import { Module } from '@nestjs/common';
import { RichMenuService } from './rich-menu.service.js';

@Module({
  providers: [RichMenuService],
  exports: [RichMenuService],
})
export class RichMenuModule {}
