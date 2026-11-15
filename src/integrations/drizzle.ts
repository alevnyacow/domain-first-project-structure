import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { rememberImplementation } from '../implementation-choices';
import { confirm } from '../interaction';
import { ProjectRoot } from '../project-root';
import { addPackageScripts, describeScripts } from './package-scripts';

const runtimePackages = ['drizzle-orm', 'pg', 'dotenv'];
const developmentPackages = ['drizzle-kit', '@types/pg'];

/** The Drizzle folder, relative to the project root. */
export const drizzleFolder = (rootFolder: string) =>
    path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        'shared-kernel/infrastructure/drizzle'
    );

export const drizzleConfigPath = (rootFolder: string) =>
    path.posix.join(drizzleFolder(rootFolder), 'drizzle.config.ts');

export const drizzleScripts = (rootFolder: string) => {
    const config = JSON.stringify(drizzleConfigPath(rootFolder));
    return {
        'drizzle:generate': `drizzle-kit generate --config ${config}`,
        'drizzle:migrate': `drizzle-kit migrate --config ${config}`
    };
};

// drizzle-kit resolves these paths from the working directory, which is the
// project root for package scripts.
const drizzleConfig = (rootFolder: string) => {
    const folder = drizzleFolder(rootFolder);
    return `import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Paths are relative to the project root, where package scripts run.
export default defineConfig({
    dialect: 'postgresql',
    schema: ${JSON.stringify(path.posix.join(folder, 'schema.ts'))},
    out: ${JSON.stringify(path.posix.join(folder, 'migrations'))},
    dbCredentials: {
        url: process.env.DATABASE_URL as string
    }
});
`;
};

const drizzleSchema = `// Add your application tables here before running drizzle:generate, e.g.
//
// import { pgTable, text } from 'drizzle-orm/pg-core';
//
// export const orders = pgTable('orders', {
//     id: text('id').primaryKey()
// });

export {};
`;

const drizzleService = `import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const createDatabase = () =>
    drizzle({
        client: new Pool({ connectionString: process.env.DATABASE_URL })
    });

type DrizzleDatabase = ReturnType<typeof createDatabase>;

const globalForDrizzle = globalThis as typeof globalThis & {
    drizzleDatabase?: DrizzleDatabase;
};

// Reuse the connection pool across development hot reloads.
const drizzleDatabase = globalForDrizzle.drizzleDatabase ?? createDatabase();

if (process.env.NODE_ENV !== 'production') {
    globalForDrizzle.drizzleDatabase = drizzleDatabase;
}

export class DrizzleInfrastructureService {
    readonly db = drizzleDatabase;
}
`;

const drizzleWiring = `import { wireClass } from '@domain-first/wire';
import { DrizzleInfrastructureService } from '../../infrastructure/services/drizzle-infrastructure-service';

export const wireDrizzleInfrastructureService = wireClass(
    DrizzleInfrastructureService,
    []
);
`;

const stageFile = (filePath: string, content: string) => {
    const file = new File(filePath);
    if (!file.exists || file.data !== content) file.data = content;
};

export const addDrizzle = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const shared = path.resolve(
        root,
        config.project.rootFolder,
        'shared-kernel'
    );
    const folder = path.join(shared, 'infrastructure/drizzle');

    // Adding an integration must not silently take over another Drizzle setup.
    if (
        ['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.json'].some(
            (name) => new File(path.join(root, name)).exists
        )
    ) {
        throw new Error(
            'This preset adds Drizzle for PostgreSQL in the Shared Kernel. Move the existing Drizzle setup separately before using it.'
        );
    }

    const withService = await confirm({
        key: 'withService',
        message:
            'Create the Drizzle infrastructure service in the Shared Kernel?',
        default: true
    });
    const selected = await addPackageScripts(
        manifestFile,
        drizzleScripts(config.project.rootFolder)
    );

    stageFile(
        path.join(folder, 'drizzle.config.ts'),
        drizzleConfig(config.project.rootFolder)
    );
    const schema = new File(path.join(folder, 'schema.ts'));
    if (!schema.exists) schema.data = drizzleSchema;
    if (withService) {
        stageFile(
            path.join(
                shared,
                'infrastructure/services/drizzle-infrastructure-service.ts'
            ),
            drizzleService
        );
        if (
            ConfigFile.backend.domainFirstPackages.includes(
                '@domain-first/wire'
            )
        ) {
            stageFile(
                path.join(
                    shared,
                    'wiring/infrastructure-services/wire-drizzle-infrastructure-service.ts'
                ),
                drizzleWiring
            );
        }
    }
    for (const kind of ['repositories', 'commands', 'queries'] as const)
        rememberImplementation(kind, 'primary', 'drizzle');

    const install = (packages: string[], dev: boolean) => {
        const missing = packages.filter((name) => !dependencies[name]);
        return missing.length
            ? [`npm install${dev ? ' --save-dev' : ''} ${missing.join(' ')}`]
            : [];
    };
    const relativeFolder = path
        .relative(root, folder)
        .split(path.sep)
        .join('/');
    return [
        ...install(runtimePackages, false),
        ...install(developmentPackages, true),
        `Add !${relativeFolder}/migrations in your linter, to ignore generated migrations.`,
        ...describeScripts(selected, {
            'drizzle:generate':
                'generate a SQL migration from changes in schema.ts',
            'drizzle:migrate':
                'apply generated migrations to the database in DATABASE_URL'
        })
    ];
};
