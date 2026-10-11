import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addPackageScripts } from './package-scripts';

const runtimePackages = ['@prisma/orm-postgres', 'temporal-polyfill', 'dotenv'];
const developmentPackages = ['prisma', '@prisma/cli-engine'];

export const prismaScripts = (rootFolder: string) => {
    const config = JSON.stringify(
        path.posix.join(
            rootFolder.replaceAll('\\', '/'),
            'shared/infrastructure/prisma/prisma.config.ts'
        )
    );
    const emit = `prisma contract emit --config ${config}`;
    return {
        'prisma:emit': emit,
        'prisma:migration:plan': `${emit} && prisma migration plan --config ${config}`,
        'prisma:migration:apply': `prisma db migrate --advance-ref db --config ${config}`
    };
};

const prismaConfig = `import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
    orm: ormConfig({
        contract: './contract.prisma',
        migrations: { dir: './migrations' },
        db: {
            connection: process.env.DATABASE_URL
        }
    })
});
`;

const prismaService = `import 'temporal-polyfill/global';
import postgres from '@prisma/orm-postgres/runtime';
import type {} from 'temporal-polyfill/types/global';
import type { Contract } from '../prisma/contract.d';
import contractJson from '../prisma/contract.json' with { type: 'json' };

type PrismaClient = ReturnType<typeof postgres<Contract>>;

const globalForPrisma = globalThis as typeof globalThis & {
    prismaClient?: PrismaClient;
};

// Reuse the client across development hot reloads.
const prismaClient = globalForPrisma.prismaClient ??
    postgres<Contract>({ contractJson, url: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaClient = prismaClient;
}

export class PrismaInfrastructureService {
    readonly orm = prismaClient.orm.public;
}
`;

const prismaWiring = `import { wireClass } from '@domain-first/wire';
import { PrismaInfrastructureService } from '../../infrastructure/services/prisma-infrastructure-service';

export const wirePrismaInfrastructureService = wireClass(
    PrismaInfrastructureService,
    []
);
`;

const stageFile = (filePath: string, content: string) => {
    const file = new File(filePath);
    if (!file.exists || file.data !== content) file.data = content;
};

export const addPrisma = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const shared = path.resolve(root, config.rootFolder, 'shared');
    const prismaFolder = path.join(shared, 'infrastructure/prisma');

    // Adding an integration must not silently become a major-version migration.
    if (
        dependencies['@prisma/client'] ||
        (dependencies.prisma && !/^[~^]?8\./.test(dependencies.prisma)) ||
        dependencies['@prisma/orm-mongo'] ||
        dependencies['@prisma/orm-sqlite'] ||
        [
            path.join(root, 'prisma/schema.prisma'),
            path.join(prismaFolder, 'schema.prisma')
        ].some((filePath) => new File(filePath).exists)
    ) {
        throw new Error(
            'This preset adds Prisma 8 for PostgreSQL. Migrate the existing Prisma setup separately before using it.'
        );
    }

    const withService = await confirm({
        message: 'Create shared Prisma infrastructure service?',
        default: true
    });
    const useByDefault =
        config.defaultPersistenceLayerImplementation !== 'prisma' &&
        (await confirm({
            message: 'Use prisma as the default persistence implementation?',
            default: false
        }));
    const selected = await addPackageScripts(
        manifestFile,
        prismaScripts(config.rootFolder)
    );

    stageFile(path.join(prismaFolder, 'prisma.config.ts'), prismaConfig);
    const contract = new File(path.join(prismaFolder, 'contract.prisma'));
    if (!contract.exists) {
        contract.data =
            '// use prisma-8\n\n// Add your application models here before running prisma:emit.\n';
    }
    if (withService) {
        stageFile(
            path.join(
                shared,
                'infrastructure/services/prisma-infrastructure-service.ts'
            ),
            prismaService
        );
        if (config.domainFirstPackages.includes('@domain-first/wire')) {
            stageFile(
                path.join(
                    shared,
                    'wiring/infrastructure-services/wire-prisma-infrastructure-service.ts'
                ),
                prismaWiring
            );
        }
    }
    if (useByDefault) {
        ConfigFile.write({
            ...config,
            defaultPersistenceLayerImplementation: 'prisma'
        });
    }

    const install = (packages: string[], dev: boolean) => {
        const missing = packages.filter((name) => !dependencies[name]);
        return missing.length
            ? [`  npm install${dev ? ' --save-dev' : ''} ${missing.join(' ')}`]
            : [];
    };
    const scriptCommand = (name: string) =>
        selected[name]
            ? `npm run ${selected[name]}`
            : prismaScripts(config.rootFolder)[
                  name as keyof ReturnType<typeof prismaScripts>
              ];
    const relativeFolder = path
        .relative(root, prismaFolder)
        .split(path.sep)
        .join('/');
    return [
        'Prisma 8 configuration saved (PostgreSQL, RC preset).',
        'Next steps (run from the project package directory):',
        ...install(runtimePackages, false),
        ...install(developmentPackages, true),
        '  Existing dependency versions were kept.',
        '  Use Node.js 22.18+ and TypeScript 5.9+ with ESM and JSON import support.',
        '  Set DATABASE_URL in your project environment (.env for the CLI); load it in the application runtime too.',
        `  Add your models to ${relativeFolder}/contract.prisma.`,
        `  Emit the contract before compiling or importing the service: ${scriptCommand('prisma:emit')}`,
        `  Plan migrations: ${scriptCommand('prisma:migration:plan')}`,
        `  Review the generated migrations, then apply: ${scriptCommand('prisma:migration:apply')}`
    ];
};
