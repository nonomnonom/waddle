import { Global, Module, type DynamicModule } from '@nestjs/common';
import { createDbWithClient, pingDb, type Db, type DbClient } from '@waddle/db';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';

export const DB = Symbol('DB');
export const DB_CLIENT = Symbol('DB_CLIENT');
const DB_PAIR = Symbol('DB_PAIR');

/** Satu pool postgres-js per proses; `pingDb` membedakan "proses hidup" dari "DB siap". */
@Global()
@Module({})
export class DatabaseModule {
  static register(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DB_PAIR,
          inject: [ENV],
          useFactory: (env: Env) => createDbWithClient(env.DATABASE_URL, { max: 10 }),
        },
        { provide: DB, inject: [DB_PAIR], useFactory: (pair: ReturnType<typeof createDbWithClient>): Db => pair.db },
        {
          provide: DB_CLIENT,
          inject: [DB_PAIR],
          useFactory: (pair: ReturnType<typeof createDbWithClient>): DbClient => pair.client,
        },
      ],
      exports: [DB, DB_CLIENT],
    };
  }

  static ping(db: Db): Promise<boolean> {
    return pingDb(db);
  }
}
