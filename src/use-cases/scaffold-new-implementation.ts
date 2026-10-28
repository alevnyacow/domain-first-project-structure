import { checkbox, input, Separator, select } from '@inquirer/prompts';
import { type BackendUnit, kebabName } from '../backend-module-move';
import { ConfigFile } from '../config-file';
import { File, type Folder } from '../file-system';
import {
    contractClassName,
    contractKinds,
    contractWireFile,
    createImplementation,
    findContracts,
    implementationWireName,
    inMemoryRepositoryWiring
} from '../implementations';
import {
    addBranchedImplementation,
    readWiredModule,
    relativeImport,
    wireBranches
} from '../wiring';
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

    const label = (
        await input({
            message: 'Implementation type:',
            validate: (value) => {
                const type = value.trim();
                if (!kebabName.test(type)) {
                    return 'Use lowercase kebab-case, e.g. api or in-memory.';
                }
                return unit.labels.includes(type)
                    ? `${unit.name} already has the ${type} implementation.`
                    : true;
            }
        })
    ).trim();

    const { file, className } = createImplementation(ownerFolder, unit, label);

    if (
        !ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        return;
    }

    const wireFile = new File(ownerFolder.path).subitem(
        contractWireFile(unit).split('/')
    );
    const wireName = `wire${contractClassName(unit)}`;
    const branches = branchesOf(wireFile, wireName);
    if (!branches) {
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
