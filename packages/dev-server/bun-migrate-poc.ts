/**
 * POC: Vendure migration runner compiled as a Bun single-file executable.
 *
 * Uses deep imports to avoid the @vendure/core barrel export, which triggers
 * NestJS @Module decorator evaluation before config is set.
 *
 * Compile with:
 *   bun build --compile --minify ./bun-migrate-poc.ts --outfile ./vendure-migrate \
 *     --external @nestjs/websockets --external @nestjs/microservices ...
 *
 * Run with:
 *   ./vendure-migrate
 */
import 'reflect-metadata';
import path from 'path';
import { DataSourceOptions } from 'typeorm';

// Deep imports to bypass the barrel — avoids triggering NestJS @Module decorators
// that call PluginModule.forRoot() → getConfig() at module evaluation time.
import { runMigrations } from '@vendure/core/dist/migrate';
import { DefaultLogger } from '@vendure/core/dist/config/logger/default-logger';
import { LogLevel } from '@vendure/core/dist/config/logger/vendure-logger';

function getDbConfig(): DataSourceOptions {
    const dbType = process.env.DB || 'mysql';
    switch (dbType) {
        case 'postgres':
            console.log('Using postgres connection');
            return {
                type: 'postgres',
                host: process.env.DB_HOST || 'localhost',
                port: Number(process.env.DB_PORT) || 5432,
                username: process.env.DB_USERNAME || 'vendure',
                password: process.env.DB_PASSWORD || 'password',
                database: process.env.DB_NAME || 'vendure-dev',
                schema: process.env.DB_SCHEMA || 'public',
            };
        case 'mysql':
        case 'mariadb':
        default:
            console.log('Using mysql connection');
            return {
                type: 'mariadb',
                host: process.env.DB_HOST || '127.0.0.1',
                port: Number(process.env.DB_PORT) || 3306,
                username: process.env.DB_USERNAME || 'vendure',
                password: process.env.DB_PASSWORD || 'password',
                database: process.env.DB_NAME || 'vendure-dev',
            };
    }
}

async function main() {
    console.log('Vendure Migration Runner (Bun compiled binary POC)');
    console.log('---------------------------------------------------');

    const migrationsPath = process.env.MIGRATIONS_PATH
        || path.join(process.cwd(), 'migrations/*.js');

    console.log('[DEBUG] About to call runMigrations...');
    console.log('[DEBUG] migrations path:', migrationsPath);

    const result = await runMigrations({
        dbConnectionOptions: {
            synchronize: false,
            logging: false,
            migrations: [migrationsPath],
            ...getDbConfig(),
        },
        logger: new DefaultLogger({ level: LogLevel.Info }),
        plugins: [],
    });

    if (result.length === 0) {
        console.log('No pending migrations.');
    } else {
        console.log(`Ran ${result.length} migration(s): ${result.join(', ')}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Migration failed:', err);
    if (err.stack) {
        console.error('Stack:', err.stack);
    }
    process.exit(1);
});
