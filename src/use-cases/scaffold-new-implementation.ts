import { checkbox, Separator, select } from '@inquirer/prompts';
import type { BackendUnit } from '../backend-module-move';
import { ConfigFile } from '../config-file';
import { hasNeighboringBoundedContext } from '../context-dependencies';
import { File, type Folder } from '../file-system';
import { rememberImplementation } from '../implementation-choices';
import {
    contractClassName,
    contractKinds,
    contractWireFile,
    createImplementation,
    findContracts,
    implementationWireName,
    inMemoryRepositoryWiring
} from '../implementations';
import { systemImplementationChoices } from '../system-implementations';
import {
    addBranchedImplementation,
    readWiredModule,
    relativeImport,
    wireBranches
} from '../wiring';
import { promptImplementationType } from './prompt-implementation-type';
import { wireNewImplementationDependencies } from './wire-dependency';

const kindTitles: Record<string, string> = {
    aggregate: 'Repositories',
    command: 'Commands',
    query: 'Queries',
    port: 'Ports'
};

const environments = ['test', 'development', 'production'];

/**
 * The branches of the module's wire, undefined if it isn't an
 * env-branched one.
 */
const branchesOf = (wireFile: File, wireName: string) => {
    if (!wireFile.exists) {
        return undefined;
    }
    try {
        return wireBranches(wireFile.data, wireName);
    } catch {
        return undefined;
    }
};

/**
 * Adds one more implementation to an existing repository, command,
 * query or port, and with wiring picks the environments that use it.
 */
export const scaffoldNewImplementation = async (ownerFolder: Folder) => {
    const contracts = findContracts(ownerFolder.path);
    if (!contracts.length) {
        console.log('No repositories, commands, queries or ports here yet.');
        return;
    }

    const unit = await select<BackendUnit>({
        message: 'Contract:',
        choices: contractKinds.flatMap((kind) => {
            const group = contracts.filter((x) => x.kind === kind);
            return group.length
                ? [
                      new Separator(`── ${kindTitles[kind]}`),
                      ...group.map((value) => ({
                          name: value.labels.length
                              ? `${value.name} (${value.labels.join(', ')})`
                              : value.name,
                          value
                      }))
                  ]
                : [];
        }),
        pageSize: 20
    });

    const kind =
        unit.kind === 'aggregate'
            ? 'repositories'
            : unit.kind === 'command'
              ? 'commands'
              : unit.kind === 'query'
                ? 'queries'
                : 'ports';
    const { label, saveForFutureUse } = await promptImplementationType(
        'Implementation type:',
        kind,
        {
            existing: unit.labels,
            purpose: 'all',
            remember: false,
            crossContext:
                unit.kind === 'port' &&
                hasNeighboringBoundedContext(ownerFolder.path)
        }
    );

    const { file, className } = createImplementation(ownerFolder, unit, label);
    const rememberFor = (environments: string[]) => {
        if (!saveForFutureUse) return;
        if (
            systemImplementationChoices(
                kind,
                unit.kind === 'port' &&
                    hasNeighboringBoundedContext(ownerFolder.path)
            ).some((choice) => choice.value === label)
        )
            return;
        if (environments.includes('test'))
            rememberImplementation(kind, 'test', label);
        if (environments.some((environment) => environment !== 'test'))
            rememberImplementation(kind, 'primary', label);
    };

    if (
        !ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire')
    ) {
        rememberFor(['development']);
        return;
    }

    const wireFile = new File(ownerFolder.path).subitem(
        contractWireFile(unit).split('/')
    );
    const wireName = `wire${contractClassName(unit)}`;
    const branches = branchesOf(wireFile, wireName);
    if (!branches) {
        rememberFor(['development']);
        console.log(
            `${wireFile.path} has no ${wireName} = envBranchedWire({...}): wire ${className} there yourself.`
        );
        return;
    }

    const labelOfWire = new Map(
        unit.labels.map((x) => [implementationWireName(x), x])
    );
    const chosenEnvironments = await checkbox({
        message: 'Environments:',
        choices: [...new Set([...environments, ...branches.keys()])].map(
            (environment) => {
                const current = branches.get(environment);
                return {
                    name: current
                        ? `${environment} (now: ${labelOfWire.get(current) ?? current})`
                        : environment,
                    value: environment
                };
            }
        ),
        required: true
    });
    rememberFor(chosenEnvironments);

    const before = readWiredModule(wireFile.path, ownerFolder.path);
    wireFile.update(
        addBranchedImplementation(wireFile.data, wireName, {
            importLine: `import { ${className} } from '${relativeImport(wireFile.path, file.path)}'`,
            className,
            wireName: implementationWireName(label),
            environments: chosenEnvironments
        })
    );
    const after = readWiredModule(wireFile.path, ownerFolder.path);
    const unused = (before?.implementations ?? []).filter(
        (x) => !after?.implementations.some((y) => y.className === x.className)
    );
    for (const implementation of unused) {
        console.log(
            `${implementation.className} is no longer used in any environment.`
        );
    }

    await wireNewImplementationDependencies(
        ownerFolder,
        wireFile,
        className,
        inMemoryRepositoryWiring(ownerFolder, unit, wireFile)
    );
};
