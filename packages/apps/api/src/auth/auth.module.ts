import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccountService } from './account.service.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AccountService, SessionGuard],
  exports: [AuthService, AccountService, SessionGuard],
})
export class AuthModule {}
