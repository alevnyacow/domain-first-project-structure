import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from '@rstest/core';
import {
    addConstructorParameters,
    addImport,
    addWireDependencies,
    canDependOn,
    isSuggestedFor,
    type Layer,
    readWiredModule,
    relativeImport,
    type WiredModule,
    wiredDependencyNames
} from './wiring';

describe('addConstructorParameters', () => {
    test('adds a constructor to an empty class', () => {
        const source = 'export class A {\n\n}';

        expect(
            addConstructorParameters(source, 'A', ['private readonly b: B'])
        ).toBe(
            'export class A {\n    constructor(private readonly b: B) {}\n}'
        );
    });

    test('adds a constructor before existing members', () => {
        const source = 'export class A {\n    static x = 1\n}';

        expect(
            addConstructorParameters(source, 'A', ['private readonly b: B'])
        ).toBe(
            'export class A {\n    constructor(private readonly b: B) {}\n\n    static x = 1\n}'
        );
    });

    test('calls super in a new constructor of a derived class', () => {
        const source = 'export class A extends Base {\n\n}';

        expect(
            addConstructorParameters(source, 'A', ['private readonly b: B'])
        ).toBe(
            'export class A extends Base {\n    constructor(private readonly b: B) {\n        super()\n    }\n}'
        );
    });

    test('fills an empty constructor', () => {
        const source =
            'export class A extends Base {\n    constructor() {\n        super()\n    }\n}';

        expect(
            addConstructorParameters(source, 'A', ['private readonly b: B'])
        ).toBe(
            'export class A extends Base {\n    constructor(private readonly b: B) {\n        super()\n    }\n}'
        );
    });

    test('puts several parameters on separate lines', () => {
        const source =
            'export class A {\n    constructor(private readonly b: B) {}\n}';

        expect(
            addConstructorParameters(source, 'A', [
                'private readonly c: Map<string, C>'
            ])
        ).toBe(
            'export class A {\n    constructor(\n        private readonly b: B,\n        private readonly c: Map<string, C>\n    ) {}\n}'
        );
    });

    test('finds the class by name', () => {
        expect(() =>
            addConstructorParameters('export class A {}', 'B', ['b: B'])
        ).toThrow();
    });
});

describe('addWireDependencies', () => {
    test('fills an empty list', () => {
        const source = 'export const wireA = wireClass(\n    A,\n    []\n)';

        expect(addWireDependencies(source, 'A', ['wireB', 'wireC'])).toBe(
            'export const wireA = wireClass(\n    A,\n    [wireB, wireC]\n)'
        );
    });

    test('appends to the list of the given class only', () => {
        const source = [
            'const wireX = wireClass(XA, [wireB])',
            'const wireY = wireClass(YA, [])'
        ].join('\n');

        expect(addWireDependencies(source, 'XA', ['wireC'])).toBe(
            [
                'const wireX = wireClass(XA, [wireB, wireC])',
                'const wireY = wireClass(YA, [])'
            ].join('\n')
        );
    });
});

describe('wiredDependencyNames', () => {
    test('reads the list of the given class only', () => {
        const source = [
            'const wireX = wireClass(XA, [wireB, wireC])',
            'const wireY = wireClass(YA, [])'
        ].join('\n');

        expect(wiredDependencyNames(source, 'XA')).toEqual(['wireB', 'wireC']);
        expect(wiredDependencyNames(source, 'YA')).toEqual([]);
    });
});

describe('addImport', () => {
    test('adds the line after the last import', () => {
        expect(
            addImport(
                "import { a } from 'a'\n\nconst x = 1",
                "import { b } from 'b'"
            )
        ).toBe("import { a } from 'a'\nimport { b } from 'b'\n\nconst x = 1");
    });

    test('adds the first import to the top', () => {
        expect(addImport('export class A {}', "import { b } from 'b'")).toBe(
            "import { b } from 'b'\n\nexport class A {}"
        );
    });

    test('keeps an existing import single', () => {
        const source = "import { b } from 'b'\n";

        expect(addImport(source, "import { b } from 'b'")).toBe(source);
    });
});

describe('relativeImport', () => {
    test('drops the extension and keeps a relative prefix', () => {
        expect(relativeImport('/c/wiring/x/wire-a.ts', '/c/domain/b.ts')).toBe(
            '../../domain/b'
        );
        expect(relativeImport('/c/a.ts', '/c/b.ts')).toBe('./b');
    });
});

const wiredModule = (kind: string, layer: Layer): WiredModule => ({
    wireName: `wire${kind}`,
    typeName: kind,
    wireFile: `/c/wiring/${kind}/wire-x.ts`,
    typeFile: `/c/${layer}/x.ts`,
    layer,
    implementations: [],
    branched: false,
    implementationsLayer: layer,
    kind
});

describe('canDependOn', () => {
    const repository = wiredModule('repositories', 'domain');
    const port = wiredModule('application-ports', 'application');
    const query = wiredModule('queries', 'application');
    const useCase = wiredModule('use-cases', 'application');
    const applicationService = wiredModule(
        'application-services',
        'application'
    );
    const executionQuery = {
        ...wiredModule('queries', 'application'),
        typeFile: '/c/application/queries/execution/y-query.ts'
    };
    const executionCommand = {
        ...wiredModule('commands', 'application'),
        typeFile: '/c/application/commands/execution/y-command.ts'
    };
    const infrastructureService = wiredModule(
        'infrastructure-services',
        'infrastructure'
    );

    test('follows the layers', () => {
        const domainService = wiredModule('domain-services', 'domain');
        const presentationService = wiredModule(
            'presentation-services',
            'presentation'
        );

        expect(canDependOn(domainService, repository)).toBe(true);
        expect(canDependOn(domainService, port)).toBe(false);
        expect(canDependOn(infrastructureService, useCase)).toBe(false);
        expect(canDependOn(infrastructureService, port)).toBe(true);
        expect(canDependOn(presentationService, useCase)).toBe(true);
        expect(canDependOn(presentationService, repository)).toBe(false);
    });

    test('application services use only ports from application', () => {
        expect(canDependOn(applicationService, port)).toBe(true);
        expect(canDependOn(applicationService, repository)).toBe(true);
        expect(canDependOn(applicationService, query)).toBe(false);
        expect(canDependOn(applicationService, useCase)).toBe(false);
    });

    test('repository implementations use no repositories', () => {
        const repositoryImplementations = {
            ...repository,
            implementationsLayer: 'infrastructure' as const
        };

        expect(canDependOn(repositoryImplementations, repository)).toBe(false);
        expect(canDependOn(repositoryImplementations, port)).toBe(true);
        expect(
            canDependOn(repositoryImplementations, infrastructureService)
        ).toBe(true);
    });

    test('infrastructure uses only ports from application', () => {
        const adapters = {
            ...wiredModule('application-ports', 'application'),
            implementationsLayer: 'infrastructure' as const
        };

        expect(canDependOn(adapters, port)).toBe(true);
        expect(canDependOn(adapters, query)).toBe(false);
        expect(canDependOn(adapters, useCase)).toBe(false);
        expect(canDependOn(adapters, applicationService)).toBe(false);
        expect(canDependOn(infrastructureService, executionCommand)).toBe(
            false
        );
    });

    test('execution commands and queries use no commands or queries', () => {
        // The application layer here keeps the infrastructure layer rule,
        // which allows only ports from application, out of the check.
        const consumer = {
            ...wiredModule('commands', 'application'),
            typeFile: '/c/application/commands/execution/x-command.ts'
        };

        expect(canDependOn(consumer, executionQuery)).toBe(false);
        expect(canDependOn(consumer, query)).toBe(false);
        expect(canDependOn(consumer, port)).toBe(true);
        expect(canDependOn(consumer, repository)).toBe(true);
    });

    test('orchestration commands use only execution commands and queries', () => {
        const orchestrationCommand = {
            ...wiredModule('commands', 'application'),
            typeFile: '/c/application/commands/orchestration/x-command.ts'
        };

        expect(canDependOn(orchestrationCommand, executionQuery)).toBe(true);
        expect(canDependOn(orchestrationCommand, executionCommand)).toBe(true);
        expect(canDependOn(orchestrationCommand, query)).toBe(false);
        expect(canDependOn(orchestrationCommand, port)).toBe(false);
        expect(canDependOn(orchestrationCommand, applicationService)).toBe(
            false
        );
        expect(canDependOn(orchestrationCommand, repository)).toBe(true);
    });

    test('orchestration queries use only execution queries', () => {
        const orchestrationQuery = {
            ...wiredModule('queries', 'application'),
            typeFile: '/c/application/queries/orchestration/x-query.ts'
        };

        expect(canDependOn(orchestrationQuery, executionQuery)).toBe(true);
        expect(canDependOn(orchestrationQuery, executionCommand)).toBe(false);
        expect(canDependOn(orchestrationQuery, query)).toBe(false);
        expect(canDependOn(orchestrationQuery, port)).toBe(false);
        expect(canDependOn(orchestrationQuery, applicationService)).toBe(false);
        expect(canDependOn(orchestrationQuery, repository)).toBe(true);
    });

    test('use cases use everything in application but use cases', () => {
        expect(canDependOn(useCase, port)).toBe(true);
        expect(canDependOn(useCase, query)).toBe(true);
        expect(canDependOn(useCase, applicationService)).toBe(true);
        expect(canDependOn(useCase, repository)).toBe(true);
        expect(canDependOn(useCase, useCase)).toBe(false);
        expect(canDependOn(useCase, infrastructureService)).toBe(false);
    });
});

describe('isSuggestedFor', () => {
    const service = (fileBase: string, layer: Layer = 'infrastructure') => ({
        ...wiredModule('infrastructure-services', layer),
        typeFile: `/c/${layer}/services/${fileBase}.ts`
    });

    test('matches the label as whole words', () => {
        expect(
            isSuggestedFor(
                service('in-memory-db-infrastructure-service'),
                'in-memory'
            )
        ).toBe(true);
        expect(
            isSuggestedFor(service('prisma-infrastructure-service'), 'prisma')
        ).toBe(true);
        expect(
            isSuggestedFor(service('rapid-infrastructure-service'), 'api')
        ).toBe(false);
    });

    test('suggests infrastructure only', () => {
        expect(
            isSuggestedFor(
                service('prisma-application-service', 'application'),
                'prisma'
            )
        ).toBe(false);
    });
});

describe('hand-edited files', () => {
    test('adds an import after a multi-line one', () => {
        const source = [
            "import { wireClass } from '@domain-first/wire'",
            'import {',
            '    PrismaUserRepository',
            "} from './x' // keep",
            '',
            'const x = 1'
        ].join('\n');

        expect(addImport(source, "import { wireD } from './d'")).toBe(
            [
                "import { wireClass } from '@domain-first/wire'",
                'import {',
                '    PrismaUserRepository',
                "} from './x' // keep",
                "import { wireD } from './d'",
                '',
                'const x = 1'
            ].join('\n')
        );
    });

    test('keeps comments and line breaks of a multi-line wire list', () => {
        const source = [
            'wireClass(A, [',
            '    wireB, // keep',
            '    wireC // last',
            '])'
        ].join('\n');

        expect(addWireDependencies(source, 'A', ['wireD', 'wireE'])).toBe(
            [
                'wireClass(A, [',
                '    wireB, // keep',
                '    wireC, // last',
                '    wireD,',
                '    wireE',
                '])'
            ].join('\n')
        );
    });

    test('keeps a trailing comma', () => {
        const source = 'wireClass(A, [\n    wireB,\n])';

        expect(addWireDependencies(source, 'A', ['wireC'])).toBe(
            'wireClass(A, [\n    wireB,\n    wireC,\n])'
        );
    });

    test('appends to a one-line list in place', () => {
        expect(
            addWireDependencies(
                'wireClass(A, [() => wireB().generate, wireC])',
                'A',
                ['wireD']
            )
        ).toBe('wireClass(A, [() => wireB().generate, wireC, wireD])');
    });

    test('reads list items with arrows and comments', () => {
        expect(
            wiredDependencyNames(
                'wireClass(A, [\n    () => wireB().generate, // x\n    wireC\n])',
                'A'
            )
        ).toEqual(['() => wireB().generate', 'wireC']);
    });

    test('keeps comments in a multi-line constructor', () => {
        const source = [
            'export class A {',
            '    constructor(',
            '        private readonly b: B, // keep',
            '        private readonly c: C',
            '    ) {}',
            '}'
        ].join('\n');

        expect(
            addConstructorParameters(source, 'A', ['private readonly d: D'])
        ).toBe(
            [
                'export class A {',
                '    constructor(',
                '        private readonly b: B, // keep',
                '        private readonly c: C,',
                '        private readonly d: D',
                '    ) {}',
                '}'
            ].join('\n')
        );
    });
});

describe('readWiredModule', () => {
    const context = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ps-'));
    const write = (relativePath: string, content: string) => {
        const file = path.join(context, relativePath);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
        return file;
    };

    afterAll(() => {
        fs.rmSync(context, { recursive: true, force: true });
    });

    test('finds the module wire by the file name', () => {
        write('application/services/a-application-service.ts', '');
        write('application/services/helper.ts', '');
        const wireFile = write(
            'wiring/application-services/wire-a-application-service.ts',
            [
                "import { wireClass } from '@domain-first/wire'",
                "import { Helper } from '../../application/services/helper'",
                "import { AApplicationService } from '../../application/services/a-application-service'",
                '',
                'export const wireHelper = wireClass(Helper, [])',
                '',
                'export const wireAApplicationService = wireClass(',
                '    AApplicationService,',
                '    [wireHelper]',
                ')'
            ].join('\n')
        );

        const wiredModule = readWiredModule(wireFile, context);

        expect(wiredModule?.wireName).toBe('wireAApplicationService');
        expect(wiredModule?.implementations.map((x) => x.className)).toEqual([
            'AApplicationService'
        ]);
    });

    test('reads a wire wrapped in memoWire', () => {
        write('infrastructure/services/prisma-infrastructure-service.ts', '');
        const wireFile = write(
            'wiring/infrastructure-services/wire-prisma-infrastructure-service.ts',
            [
                "import { PrismaInfrastructureService } from '../../infrastructure/services/prisma-infrastructure-service'",
                '',
                'export const wirePrismaInfrastructureService = memoWire(',
                '    wireClass(PrismaInfrastructureService, [])',
                ')'
            ].join('\n')
        );

        const wiredModule = readWiredModule(wireFile, context);

        expect(wiredModule?.branched).toBe(false);
        expect(wiredModule?.layer).toBe('infrastructure');
        expect(wiredModule?.implementations.map((x) => x.className)).toEqual([
            'PrismaInfrastructureService'
        ]);
    });

    test('takes branched implementations from envBranchedWire', () => {
        write('domain/aggregates/user/user-repository.ts', '');
        const wireFile = write(
            'wiring/repositories/wire-user-repository.ts',
            [
                "import { PrismaUserRepository } from '../../infrastructure/repositories/prisma/prisma-user-repository'",
                "import { InMemoryUserRepository } from '../../infrastructure/repositories/in-memory/in-memory-user-repository'",
                "import { Seed } from '../../infrastructure/seed'",
                '',
                'const wireSeed = wireClass(Seed, [])',
                'const wirePrismaImplementation = wireClass(PrismaUserRepository, [])',
                'const wireInMemoryImplementation = memoWire(wireClass(InMemoryUserRepository, [wireSeed]))',
                '',
                'export const wireUserRepository = envBranchedWire({',
                '    test: wireInMemoryImplementation,',
                '    development: wirePrismaImplementation,',
                '    production: wirePrismaImplementation',
                '})'
            ].join('\n')
        );

        const wiredModule = readWiredModule(wireFile, context);

        expect(wiredModule?.branched).toBe(true);
        expect(wiredModule?.layer).toBe('domain');
        expect(wiredModule?.implementations.map((x) => x.className)).toEqual([
            'PrismaUserRepository',
            'InMemoryUserRepository'
        ]);
    });
});
