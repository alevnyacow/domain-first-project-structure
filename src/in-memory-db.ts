import { ConfigFile } from './config-file';
import { File, Folder } from './file-system';
import { ProjectRoot } from './project-root';
import { UnknownFormatNaming } from './unknown-format-naming';
import {
    addClassMember,
    addConstructorParameters,
    addImport,
    addWireDependencies,
    relativeImport,
    type WiredModule
} from './wiring';

/**
 * Implementations of this type get the in-memory DB.
 */
const inMemoryImplementationType = 'in-memory';

const className = 'InMemoryDbInfrastructureService';
const wireName = 'wireInMemoryDbInfrastructureService';
const parameterName = 'inMemoryDbInfrastructureService';

const inMemoryDbService = `type Entry = {
    id: unknown;
    item: any;
};

declare global {
    var ___SHARED_IN_MEMORY_DB___: Record<string, Array<Entry>> | undefined;
}

type Section<T, TId> = {
    all: (predicate?: (x: T) => boolean) => T[];
    first: (predicate: (x: T) => boolean) => T | null;
    withId: (id: TId) => T | null;
    lastAddedItem: () => T | null;
    save: (payload: T extends { id: TId } ? T : [TId, T]) => void;
    deleteById: (id: TId) => void;
    delete: (predicate: (x: T) => boolean) => void;
};

type IdsAreEqual<TId> = (a: TId, b: TId) => boolean;

const comparisonMethodNames = ['equals', 'same', 'isSame', 'isEqual'] as const;

const defaultIdsAreEqual = (a: unknown, b: unknown): boolean => {
    if (typeof a !== 'object' || a === null) {
        return Object.is(a, b);
    }

    for (const methodName of comparisonMethodNames) {
        const method: unknown = (a as Record<string, unknown>)[methodName];
        if (typeof method === 'function') {
            return Boolean(method.call(a, b));
        }
    }

    return Object.is(a, b);
};

const hasId = (x: unknown): x is { id: unknown } =>
    typeof x === 'object' && x !== null && 'id' in x;

export class InMemoryDbInfrastructureService {
    protected section<T extends { id: unknown }>(
        key: string,
        idsAreEqual?: IdsAreEqual<T['id']>
    ): Section<T, T['id']>;
    protected section<T, TId>(
        key: string,
        idsAreEqual?: IdsAreEqual<TId>
    ): Section<T, TId>;
    protected section<T, TId>(
        key: string,
        idsAreEqual: IdsAreEqual<TId> = defaultIdsAreEqual
    ): Section<T, TId> {
        if (!globalThis.___SHARED_IN_MEMORY_DB___) {
            globalThis.___SHARED_IN_MEMORY_DB___ = {};
        }

        if (!globalThis.___SHARED_IN_MEMORY_DB___[key]) {
            globalThis.___SHARED_IN_MEMORY_DB___[key] = [];
        }

        const items = (): T[] =>
            globalThis.___SHARED_IN_MEMORY_DB___![key].map(
                (entry) => entry.item
            );

        return {
            all: (predicate: (x: T) => boolean = () => true): T[] =>
                items().filter(predicate),
            first: (predicate: (x: T) => boolean): T | null =>
                items().find(predicate) ?? null,
            withId: (id: TId): T | null =>
                items().find(
                    (x: T) => hasId(x) && idsAreEqual(x.id as TId, id)
                ) ?? null,
            lastAddedItem: (): T | null =>
                globalThis.___SHARED_IN_MEMORY_DB___![key].at(-1)?.item ?? null,
            save: (payload: T extends { id: TId } ? T : [TId, T]) => {
                const id = Array.isArray(payload) ? payload[0] : payload.id;
                const item = Array.isArray(payload) ? payload[1] : payload;
                const entries = globalThis.___SHARED_IN_MEMORY_DB___![key];
                const existing = entries.find((entry) =>
                    idsAreEqual(entry.id as TId, id)
                );
                if (existing) {
                    existing.item = item;
                    return;
                }
                entries.push({ id, item });
            },
            deleteById: (id: TId) => {
                globalThis.___SHARED_IN_MEMORY_DB___![key] =
                    globalThis.___SHARED_IN_MEMORY_DB___![key].filter(
                        (entry) => !idsAreEqual(entry.id as TId, id)
                    );
            },
            delete: (predicate: (x: T) => boolean) => {
                globalThis.___SHARED_IN_MEMORY_DB___![key] =
                    globalThis.___SHARED_IN_MEMORY_DB___![key].filter(
                        (entry) => !predicate(entry.item)
                    );
            }
        };
    }
}
`;

const inMemoryDbWiring = `import { wireClass } from '@domain-first/wire';
import { InMemoryDbInfrastructureService } from '../../infrastructure/services/in-memory-db-infrastructure-service';

export const wireInMemoryDbInfrastructureService = wireClass(
    InMemoryDbInfrastructureService,
    []
);
`;

const inMemoryDbSpec = (testingLibrary: string, withWiring: boolean) =>
    `
import { describe, test, expect, beforeEach } from '${testingLibrary}'
${
    withWiring
        ? `import { type InMemoryDbInfrastructureService } from './in-memory-db-infrastructure-service'
import { wireInMemoryDbInfrastructureService } from '../../wiring/infrastructure-services/wire-in-memory-db-infrastructure-service'`
        : `import { InMemoryDbInfrastructureService } from './in-memory-db-infrastructure-service'`
}

let inMemoryDbInfrastructureService: InMemoryDbInfrastructureService

beforeEach(() => {
    inMemoryDbInfrastructureService = ${withWiring ? 'wireInMemoryDbInfrastructureService()' : 'new InMemoryDbInfrastructureService()'}
})

describe('in memory db', () => {
    test('can be ${withWiring ? 'wired' : 'created'}', () => {
        expect(inMemoryDbInfrastructureService).toBeDefined()
    })
})
`.trim();

const withWiring = () =>
    ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire');

const sharedFolder = () =>
    new Folder(new ProjectRoot().path).subitem([
        ConfigFile.Instance.data.rootFolder,
        'shared-kernel'
    ]);

const serviceFile = () =>
    new File(sharedFolder().path).subitem([
        'infrastructure',
        'services',
        'in-memory-db-infrastructure-service.ts'
    ]);

const wireFile = () =>
    new File(sharedFolder().path).subitem([
        'wiring',
        'infrastructure-services',
        'wire-in-memory-db-infrastructure-service.ts'
    ]);

/**
 * The shared in-memory DB with its spec and wire, as the config says.
 */
export const scaffoldInMemoryDb = (shared: Folder) => {
    const { testingLibrary } = ConfigFile.Instance.data;
    const servicesFolder = shared.subitem(['infrastructure', 'services']);

    servicesFolder.createFile(
        'in-memory-db-infrastructure-service.ts',
        inMemoryDbService
    );

    if (testingLibrary) {
        servicesFolder.createFile(
            'in-memory-db-infrastructure-service.spec.ts',
            inMemoryDbSpec(testingLibrary, withWiring())
        );
    }

    if (withWiring()) {
        shared
            .subitem(['wiring', 'infrastructure-services'])
            .createFile(
                'wire-in-memory-db-infrastructure-service.ts',
                inMemoryDbWiring
            );
    }
};

/**
 * Whether the files of the in-memory DB are there, its wire included
 * with wiring.
 */
export const inMemoryDbScaffolded = () =>
    serviceFile().exists && (!withWiring() || wireFile().exists);

/**
 * Whether implementations of this type get the in-memory DB: it is
 * enabled in the config and its files are there.
 */
export const usesInMemoryDb = (implementationType: string) =>
    Boolean(ConfigFile.Instance.data.withInMemoryDb) &&
    new UnknownFormatNaming(implementationType).fileName ===
        inMemoryImplementationType &&
    inMemoryDbScaffolded();

/**
 * Endings of words that stay the same in plural.
 */
const uncountableEndings = [
    'data',
    'info',
    'usage',
    'feedback',
    'media',
    'ware',
    'equipment',
    'information',
    'knowledge',
    'traffic',
    'telemetry',
    'analytics',
    'series'
];

const uncountable = new RegExp(`(${uncountableEndings.join('|')})$`, 'i');

/**
 * `user` → `users`, `category` → `categories`, `box` → `boxes`,
 * `quiz` → `quizzes`, `user-data` → `user-data`.
 */
export const plural = (word: string) => {
    if (uncountable.test(word)) return word;
    if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
    // A single vowel before `z` doubles it; `qu` counts as a consonant.
    if (/(^|[^aeiou]|qu)[aeiou]z$/i.test(word)) return `${word}zes`;
    if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
    return `${word}s`;
};

/**
 * Adds a section of the type to the in-memory DB, unless it is there,
 * and returns the section's field name.
 */
export const addInMemoryDbSection = (
    typeNaming: UnknownFormatNaming,
    typeImportTarget: string
) => {
    const file = serviceFile();
    const sectionNaming = new UnknownFormatNaming(plural(typeNaming.fileName));
    const field = sectionNaming.variableName;

    if (new RegExp(`\\b${field}\\s*=\\s*this\\.section\\b`).test(file.data)) {
        return field;
    }

    const withImport = addImport(
        file.data,
        `import type { ${typeNaming.ClassName} } from '${relativeImport(file.path, typeImportTarget)}';`
    );
    file.update(
        addClassMember(
            withImport,
            className,
            `${field} = this.section<${typeNaming.ClassName}>('${sectionNaming.fileName.toUpperCase()}');`
        )
    );
    return field;
};

/**
 * Import of the in-memory DB type for a file.
 */
export const inMemoryDbTypeImport = (fromFile: string) =>
    `import type { ${className} } from '${relativeImport(fromFile, serviceFile().path)}'`;

/**
 * Constructor of an implementation that keeps one section of the
 * in-memory DB as `data`.
 */
export const inMemoryDbSectionMembers = (field: string, derived: boolean) =>
    `
    private readonly data: ${className}['${field}']

    constructor(${parameterName}: ${className}) {
        ${derived ? 'super()\n        ' : ''}this.data = ${parameterName}.${field}
    }
`.trim();

/**
 * Puts one section of the in-memory DB in place of the implementation's
 * empty constructor.
 */
export const keepInMemoryDbSection = (classFile: File, field: string) => {
    classFile.update(
        addImport(classFile.data, inMemoryDbTypeImport(classFile.path)).replace(
            'constructor() {}',
            inMemoryDbSectionMembers(field, false)
        )
    );
};

/**
 * Whether the wired module is the in-memory DB.
 */
export const isInMemoryDb = (module: WiredModule) =>
    module.wireName === wireName;

/**
 * Injects the whole in-memory DB into the implementation's constructor.
 */
export const injectInMemoryDb = (
    classFile: File,
    implementationName: string
) => {
    classFile.update(
        addConstructorParameters(
            addImport(classFile.data, inMemoryDbTypeImport(classFile.path)),
            implementationName,
            [`private readonly ${parameterName}: ${className}`]
        )
    );
};

/**
 * Passes the in-memory DB wire to the implementation's `wireClass`.
 */
export const wireInMemoryDb = (
    consumerWireFile: File,
    implementationName: string
) => {
    consumerWireFile.update(
        addWireDependencies(
            addImport(
                consumerWireFile.data,
                `import { ${wireName} } from '${relativeImport(consumerWireFile.path, wireFile().path)}'`
            ),
            implementationName,
            [wireName]
        )
    );
};

/**
 * A spec without wiring builds the implementation itself, so it has to
 * pass the in-memory DB.
 */
export const passInMemoryDb = (specFile: File, implementationName: string) => {
    specFile.update(
        addImport(
            specFile.data,
            `import { ${className} } from '${relativeImport(specFile.path, serviceFile().path)}'`
        ).replace(
            `new ${implementationName}()`,
            `new ${implementationName}(new ${className}())`
        )
    );
};
