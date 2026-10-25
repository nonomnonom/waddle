import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
// APP_* diekspor dari @nestjs/core pada Nest 11 (bukan @nestjs/common)
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ENV, EnvModule } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { DatabaseModule } from '../db/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ContentsModule } from '../contents/contents.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AiModule } from '../ai/ai.module.js';
import { HealthModule } from '../health/health.module.js';
import { RequestContextMiddleware } from '../common/request-context.middleware.js';
import { EnvelopeInterceptor } from '../common/envelope.interceptor.js';
import { BusinessErrorFilter } from '../common/business-error.filter.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [EnvModule],
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // teks user tidak boleh masuk log: hanya panjang yang dicatat
          redact: { paths: ['req.body.text', 'req.body.items[*].sourceText', 'req.body.sourceText'], censor: '<redacted:len>' },
          // pino-pretty memakai worker thread; aktifkan eksplisit saja supaya
          // bundel webpack (tanpa file worker) tidak crash saat boot
          transport:
            env.NODE_ENV === 'development' && process.env.LOG_PRETTY === '1'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    EnvModule,
    DatabaseModule.register(),
    AuthModule,
    ContentsModule,
    SettingsModule,
    AiModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: BusinessErrorFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
