import path from 'node:path';
import {
    type BackendUnit,
    integrationSpecFile,
    integrationSpecsFolder,
    kindLayouts
} from './backend-module-move';
import { ConfigFile } from './config-file';
import { crossContextImplementation } from './context-dependencies';
import { File } from './file-system';
import { implementationWireName } from './implementations';
import { inMemoryImplementationType } from './in-memory-db';
import {
    answerFor,
    confirm,
    isNonInteractive,
    RequestError,
    report
} from './interaction';
import { ProjectRoot } from './project-root';
import { UnknownFormatNaming } from './unknown-format-naming';

const withWiring = () =>
    ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire');

/**
 * Integration specs are generated with the Testcontainers integration and
 * wiring: a spec builds its subject through its wire factory.
 */
export const integrationSpecsAvailable = () =>
    withWiring() &&
    new File(
        path.join(
            new ProjectRoot().path,
            integrationSpecsFolder,
            'vitest.config.ts'
        )
    ).exists;

/** Types that never get an integration spec unless listed by hand. */
export const systemImplementationTypes = new Set<string>([
    inMemoryImplementationType,
    crossContextImplementation
]);

export const integrationTestTypes = () =>
    ConfigFile.backend.implementations?.integrationTests ?? [];

/** Records the types whose implementations get integration specs. */
export const setIntegrationTestTypes = (types: string[]) => {
    const backend = ConfigFile.backend;
    ConfigFile.update({
        backend: {
            ...backend,
            implementations: {
                ...backend.implementations,
                integrationTests: [...new Set(types)]
            }
        }
    });
};

const importPath = (fromFile: string, toFile: string) => {
    const relative = path
        .relative(path.dirname(fromFile), toFile)
        .replace(/\.ts$/, '')
        .split(path.sep)
        .join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
};

/**
 * Exports the factory of an implementation from the contract's wire
 * (`const wirePrismaImplementation` → `export const ...`), so a spec can
 * build it without the environment branches. False when the wire has no
 * such factory.
 */
export const exportImplementationWire = (wireFile: File, label: string) => {
    if (!wireFile.exists) return false;
    const name = implementationWireName(label);
    const declaration = new RegExp(`^(export\\s+)?const\\s+${name}\\b`, 'm');
    const match = wireFile.data.match(declaration);
    if (!match) return false;
    if (!match[1])
        wireFile.update(
            wireFile.data.replace(declaration, `export const ${name}`)
        );
    return true;
};

type SpecSubject = Pick<BackendUnit, 'kind' | 'name' | 'ownerPath'>;

const renderSpec = ({
    title,
    className,
    classFile,
    wireImport,
    wireFile,
    factory,
    specPath
}: {
    title: string;
    className: string;
    classFile: string;
    wireImport: string;
    wireFile: string;
    factory: string;
    specPath: string;
}) =>
    `
import { describe, test, expect } from 'vitest'
import { ${className} } from '${importPath(specPath, classFile)}'
import { ${wireImport} } from '${importPath(specPath, wireFile)}'

describe('${title}', () => {
    test('can be wired', () => {
        expect(${factory}()).toBeInstanceOf(${className})
    })

    test.todo('works against the infrastructure')
})
`.trimStart();

/**
 * Stages the integration spec of an implementation, or of an
 * infrastructure service without `label`, unless it exists. An
 * implementation's factory gets exported from the contract's wire.
 * Returns the spec file, if staged.
 */
export const scaffoldIntegrationSpec = (unit: SpecSubject, label?: string) => {
    const specPath = integrationSpecFile(unit, label);
    if (!specPath) return undefined;
    const spec = new File(specPath);
    if (spec.exists) return undefined;

    const layout = kindLayouts[unit.kind];
    const naming = new UnknownFormatNaming(unit.name);
    const core = layout.core(naming.ClassName);
    const files = layout.files(
        { ownerPath: unit.ownerPath, name: unit.name },
        label === undefined ? [] : [label]
    );
    const wireFile = new File(
        path.join(
            unit.ownerPath,
            files.find((file) => file.startsWith('wiring/'))!
        )
    );

    if (label === undefined) {
        const factory = `wire${core}`;
        spec.data = renderSpec({
            title: naming.withSpaces,
            className: core,
            classFile: path.join(unit.ownerPath, files[0]),
            wireImport: factory,
            wireFile: wireFile.path,
            factory,
            specPath
        });
        return spec;
    }

    const className = `${new UnknownFormatNaming(label).ClassName}${core}`;
    if (!exportImplementationWire(wireFile, label)) {
        report(
            `No integration spec for ${className}: ${wireFile.path} has no ${implementationWireName(label)} factory.`
        );
        return undefined;
    }
    const factory = `wire${className}`;
    const wireImport = `${implementationWireName(label)} as ${factory}`;
    const title =
        unit.kind === 'aggregate'
            ? `${naming.withSpaces} repository`
            : unit.kind === 'port'
              ? naming.withSpaces
              : `${naming.withSpaces} ${unit.kind}`;
    spec.data = renderSpec({
        title: `${title} (${label})`,
        className,
        classFile: path.join(
            unit.ownerPath,
            files.find((file) =>
                file.startsWith(`${layout.implementations}/${label}/`)
            )!
        ),
        wireImport,
        wireFile: wireFile.path,
        factory,
        specPath
    });
    return spec;
};

const unusedAnswer = () =>
    new RequestError(
        'UNUSED_PARAMETERS',
        'implementation.integrationTests applies only to a newly entered primary implementation type, with the Testcontainers integration and wiring.',
        { fields: ['implementation.integrationTests'] }
    );

/**
 * Whether implementations of this primary type get an integration spec.
 * A listed type does; a newly entered one asks (default yes), and a type
 * saved for future use records the answer.
 */
export const wantsIntegrationTests = async (
    label: string,
    { entered, save }: { entered: boolean; save: boolean }
) => {
    const answer = isNonInteractive()
        ? (answerFor('implementation') as { integrationTests?: boolean })
              ?.integrationTests
        : undefined;
    const applies =
        integrationSpecsAvailable() &&
        entered &&
        !systemImplementationTypes.has(label) &&
        !integrationTestTypes().includes(label);
    if (!applies) {
        if (answer !== undefined) throw unusedAnswer();
        return (
            integrationSpecsAvailable() &&
            integrationTestTypes().includes(label)
        );
    }
    const wanted = isNonInteractive()
        ? (answer ?? true)
        : await confirm({
              message: `Generate integration tests for ${label} implementations?`,
              default: true
          });
    if (wanted && save)
        setIntegrationTestTypes([...integrationTestTypes(), label]);
    return wanted;
};

/** Whether a new infrastructure service gets an integration spec. */
export const wantsServiceIntegrationSpec = async () =>
    integrationSpecsAvailable() &&
    (await confirm({
        key: 'integrationSpec',
        message: 'Generate an integration spec?',
        default: false
    }));
