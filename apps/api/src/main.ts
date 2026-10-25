import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app/app.module.js';
import { AuthService } from './auth/auth.service.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  // batch koleksi bisa berisi 200 fragmen; default 100kb terlalu kecil
  app.useBodyParser('json', { limit: '2mb' });

  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    exposedHeaders: ['etag', 'x-request-id'],
  });

  // better-auth memiliki route-nya sendiri (sign-in/up, session, revoke, callback)
  const auth = app.get(AuthService);
  app.use('/api/auth', (req: Request, res: Response, next: NextFunction) => {
    void auth.nodeHandler(req, res).catch(next);
  });

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`api pada http://localhost:${env.PORT} (channel ${env.APP_CHANNEL})`);
}

void bootstrap();
