import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HealthController } from './health.controller.js';

// HealthController.v1/ping memakai SessionGuard -> butuh AuthModule
@Module({ imports: [AuthModule], controllers: [HealthController] })
export class HealthModule {}
