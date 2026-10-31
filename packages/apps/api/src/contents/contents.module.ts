import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContentsController } from './contents.controller.js';
import { ContentsService } from './contents.service.js';

@Module({ imports: [AuthModule], controllers: [ContentsController], providers: [ContentsService] })
export class ContentsModule {}
