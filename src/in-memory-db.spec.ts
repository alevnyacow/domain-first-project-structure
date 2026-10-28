import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { afterAll, beforeAll, expect, rstest, test } from '@rstest/core';
import { Folder, writePendingChanges } from './file-system';
import { plural } from './in-memory-db';
import {
    initializeUseCase,
    scaffoldNewAggregateUseCase,
    scaffoldNewCommand,
    scaffoldNewQuery
} from './use-cases';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(),
    confirm: rstest.fn(),
    select: rstest.fn(),
    checkbox: rstest.fn(),
    Separator: class {}
}));

/**
 * Dependency questions keep what is checked, unless an answer unchecks
 * all of it.
 */
const checkedChoices = (
    choices: Array<{ value?: unknown; checked?: boolean }>
) => choices.filter((x) => x.checked).map((x) => x.value);

/**
 * Answers by prompt message, so the order of questions doesn't matter.
 */
const answer = (answers: Record<string, unknown>) => {
    const reply = async ({ message }: { message: string }) => {
        if (!(message in answers)) {
            throw new Error(`Unexpected prompt: ${message}`);
        }
        return answers[message];
    };
    rstest.mocked(input).mockImplementation(reply as any);
    rstest.mocked(confirm).mockImplementation(reply as any);
    rstest.mocked(select).mockImplementation(reply as any);
    rstest
        .mocked(checkbox)
        .mockImplementation((async ({ message, choices }: any) =>
            message.startsWith('Dependencies')
                ? message in answers
                    ? answers[message]
                    : checkedChoices(choices)
                : reply({ message })) as any);
};

const projects: string[] = [];
afterAll(() => {
    for (const root of projects) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

const createProject = async (packages: string[], withInMemoryDb = true) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-in-memory-db-'));
    projects.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    rstest.spyOn(process, 'cwd').mockReturnValue(root);

    answer({
        'Root folder (use "/" for inner folders):': 'src',
        '@domain-first packages': packages,
        'Default persistence layer implementation:': 'prisma',
        'Scaffold in-memory DB for test implementations': withInMemoryDb,
        'Use React': false,
        'Scaffold unit tests': true,
        'Unit testing library:': 'vitest'
    });
    await initializeUseCase();
    writePendingChanges();

    const context = new Folder(root).subitem([
        'src',
        'bounded-contexts',
        'users'
    ]);
    const read = (...segments: string[]) =>
        fs.readFileSync(path.join(root, 'src', ...segments), 'utf8');
    return { root, context, read };
};

const scaffoldUserAggregate = async (context: Folder) => {
    answer({
        'Aggregate name:': 'user',
        'With Repository': true,
        'Repository infrastructure implementation type:': 'prisma',
        'Add a test implementation for Repository': true,
        'Test Repository infrastructure implementation type:': 'in-memory'
    });
    await scaffoldNewAggregateUseCase(context);
    writePendingChanges();
};

let wired: Awaited<ReturnType<typeof createProject>>;

beforeAll(async () => {
    wired = await createProject(['@domain-first/wire']);
    await scaffoldUserAggregate(wired.context);
});

test('initialization saves the flag and scaffolds the shared in-memory DB', () => {
    const config = JSON.parse(
        fs.readFileSync(
            path.join(wired.root, 'domain-first.project-structure.config.json'),
            'utf8'
        )
    );
    expect(config.withInMemoryDb).toBe(true);
    expect(
        wired.read(
            'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
        )
    ).toContain('export class InMemoryDbInfrastructureService');
    expect(
        wired.read(
            'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.spec.ts'
        )
    ).toContain('wireInMemoryDbInfrastructureService()');
    expect(
        wired.read(
            'shared-kernel/wiring/infrastructure-services/wire-in-memory-db-infrastructure-service.ts'
        )
    ).toContain('export const wireInMemoryDbInfrastructureService');
});

test('an in-memory repository adds a section of its aggregate', () => {
    const db = wired.read(
        'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
    );
    expect(db).toContain(
        "import type { User } from '../../../bounded-contexts/users/domain/aggregates/user';"
    );
    expect(db).toMatch(/\n {4}users = this\.section<User>\('USERS'\);\n\}\n$/);
});

test('an in-memory repository takes its section in the constructor', () => {
    expect(
        wired.read(
            'bounded-contexts/users/infrastructure/repositories/in-memory/in-memory-user-repository.ts'
        )
    ).toBe(
        `import { UserRepository } from '../../../domain/aggregates/user'
import type { InMemoryDbInfrastructureService } from '../../../../../shared-kernel/infrastructure/services/in-memory-db-infrastructure-service'

export class InMemoryUserRepository implements UserRepository {
    private readonly data: InMemoryDbInfrastructureService['users']

    constructor(inMemoryDbInfrastructureService: InMemoryDbInfrastructureService) {
        this.data = inMemoryDbInfrastructureService.users
    }
}`
    );
    expect(
        wired.read(
            'bounded-contexts/users/infrastructure/repositories/prisma/prisma-user-repository.ts'
        )
    ).not.toContain('InMemoryDb');
});

test('only the in-memory repository is wired with the in-memory DB', () => {
    const wire = wired.read(
        'bounded-contexts/users/wiring/repositories/wire-user-repository.ts'
    );
    expect(wire).toContain(
        "import { wireInMemoryDbInfrastructureService } from '../../../../shared-kernel/wiring/infrastructure-services/wire-in-memory-db-infrastructure-service'"
    );
    expect(wire).toContain(
        'wireClass(InMemoryUserRepository, [wireInMemoryDbInfrastructureService])'
    );
    expect(wire).toContain('wireClass(PrismaUserRepository, [])');
});

test('a second repository of the same aggregate reuses its section', async () => {
    await scaffoldUserAggregate(wired.context);
    const db = wired.read(
        'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
    );
    expect(db.match(/this\.section</g)).toHaveLength(1);
});

for (const [kind, scaffold, Kind] of [
    ['Query', scaffoldNewQuery, 'Query'],
    ['Command', scaffoldNewCommand, 'Command']
] as const) {
    test(`an in-memory ${kind.toLowerCase()} gets the whole in-memory DB`, async () => {
        answer({
            'Name: ': `find-user-${kind.toLowerCase()}`,
            [`${Kind} infrastructure implementation type:`]: 'prisma',
            [`Add a test implementation for ${Kind}`]: true,
            [`Test ${Kind} infrastructure implementation type:`]: 'in-memory'
        });
        await scaffold(wired.context);
        writePendingChanges();

        const folder = kind === 'Query' ? 'queries' : 'commands';
        const name = `find-user-${kind.toLowerCase()}-${kind.toLowerCase()}`;
        const className = `InMemoryFindUser${Kind}${Kind}`;
        const implementation = wired.read(
            `bounded-contexts/users/infrastructure/${folder}/in-memory/in-memory-${name}.ts`
        );
        expect(implementation).toContain(
            "import type { InMemoryDbInfrastructureService } from '../../../../../shared-kernel/infrastructure/services/in-memory-db-infrastructure-service'"
        );
        expect(implementation).toContain(
            'constructor(private readonly inMemoryDbInfrastructureService: InMemoryDbInfrastructureService) {\n        super()\n    }'
        );
        expect(
            wired.read(
                `bounded-contexts/users/wiring/${folder}/wire-${name}.ts`
            )
        ).toContain(
            `wireClass(${className}, [wireInMemoryDbInfrastructureService])`
        );
        expect(
            wired
                .read(
                    'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
                )
                .match(/this\.section</g)
        ).toHaveLength(1);
    });
}

test('without wiring, the spec of an in-memory repository passes the DB', async () => {
    const plain = await createProject([]);
    answer({
        'Aggregate name:': 'user',
        'With Repository': true,
        'Repository infrastructure implementation type:': 'in-memory',
        'Add a test implementation for Repository': false
    });
    await scaffoldNewAggregateUseCase(plain.context);
    writePendingChanges();

    const spec = plain.read(
        'bounded-contexts/users/domain/aggregates/user/user-repository.spec.ts'
    );
    expect(spec).toContain(
        "import { InMemoryDbInfrastructureService } from '../../../../../shared-kernel/infrastructure/services/in-memory-db-infrastructure-service'"
    );
    expect(spec).toContain(
        'new InMemoryUserRepository(new InMemoryDbInfrastructureService())'
    );
});

test('without the flag, in-memory implementations stay empty', async () => {
    const off = await createProject(['@domain-first/wire'], false);
    await scaffoldUserAggregate(off.context);

    expect(
        fs.existsSync(
            path.join(
                off.root,
                'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
            )
        )
    ).toBe(false);
    expect(
        off.read(
            'bounded-contexts/users/infrastructure/repositories/in-memory/in-memory-user-repository.ts'
        )
    ).toContain('constructor() {}');
});

test('an unchecked in-memory DB leaves the in-memory repository empty', async () => {
    const unchecked = await createProject(['@domain-first/wire']);
    answer({
        'Aggregate name:': 'user',
        'With Repository': true,
        'Repository infrastructure implementation type:': 'prisma',
        'Add a test implementation for Repository': true,
        'Test Repository infrastructure implementation type:': 'in-memory',
        'Dependencies for InMemoryUserRepository:': []
    });
    await scaffoldNewAggregateUseCase(unchecked.context);
    writePendingChanges();

    expect(
        unchecked.read(
            'bounded-contexts/users/infrastructure/repositories/in-memory/in-memory-user-repository.ts'
        )
    ).toContain('constructor() {}');
    expect(
        unchecked.read(
            'bounded-contexts/users/wiring/repositories/wire-user-repository.ts'
        )
    ).toContain('wireClass(InMemoryUserRepository, [])');
    expect(
        unchecked.read(
            'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
        )
    ).not.toContain('this.section<');
});

test('plural adds s, es or ies', () => {
    expect(plural('user')).toBe('users');
    expect(plural('category')).toBe('categories');
    expect(plural('day')).toBe('days');
    expect(plural('box')).toBe('boxes');
    expect(plural('status')).toBe('statuses');
    expect(plural('match')).toBe('matches');
    expect(plural('wish')).toBe('wishes');
});

test('plural doubles z after a single vowel', () => {
    expect(plural('quiz')).toBe('quizzes');
    expect(plural('whiz')).toBe('whizzes');
    expect(plural('fez')).toBe('fezzes');
    expect(plural('pop-quiz')).toBe('pop-quizzes');
    expect(plural('buzz')).toBe('buzzes');
    expect(plural('waltz')).toBe('waltzes');
});

test('plural keeps uncountable endings as they are', () => {
    for (const word of [
        'data',
        'user-data',
        'metadata',
        'profile-info',
        'api-usage',
        'user-feedback',
        'social-media',
        'middleware',
        'lab-equipment',
        'contact-information',
        'domain-knowledge',
        'network-traffic',
        'device-telemetry',
        'page-analytics',
        'time-series'
    ]) {
        expect(plural(word)).toBe(word);
    }
});

test('plural matches uncountable endings case-insensitively', () => {
    expect(plural('UserData')).toBe('UserData');
    expect(plural('PROFILE-INFO')).toBe('PROFILE-INFO');
});
