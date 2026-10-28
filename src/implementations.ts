import fs from 'node:fs';
import path from 'node:path';
import {
    type BackendUnit,
    findBackendUnits,
    kindLayouts
} from './backend-module-move';
import { ConfigFile } from './config-file';
import { File, type Folder } from './file-system';
import {
    addInMemoryDbSection,
    injectInMemoryDb,
    inMemoryDbSectionMembers,
    inMemoryDbTypeImport,
    isInMemoryDb,
    keepInMemoryDbSection,
    usesInMemoryDb,
    wireInMemoryDb
} from './in-memory-db';
import { UnknownFormatNaming } from './unknown-format-naming';
import type { CustomWiring } from './use-cases/wire-dependency';

/**
 * Kinds of units whose contract has implementations: a repository (of
 * an aggregate), a command, a query, a port.
 */
export type ContractKind = 'aggregate' | 'command' | 'query' | 'port';

export const contractKinds: ContractKind[] = [
    'aggregate',
    'command',
    'query',
    'port'
];

const withWiring = () =>
    ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire');

const withHandlers = () =>
    ConfigFile.Instance.data.domainFirstPackages.includes(
        '@domain-first/handlers'
    );

/**
 * The contract's own file: the repository of an aggregate, the abstract
 * command, query or port.
 */
const contractFile = (unit: BackendUnit) =>
    unit.kind === 'aggregate'
        ? `domain/aggregates/${unit.name}/${unit.name}-repository.ts`
        : kindLayouts[unit.kind].files(unit, [])[0];

/**
 * Units of the folder that have a contract to implement: aggregates
 * only with their repository.
 */
export const findContracts = (ownerPath: string) =>
    findBackendUnits(ownerPath).filter(
        (unit) =>
            (contractKinds as string[]).includes(unit.kind) &&
            fs.existsSync(path.join(ownerPath, contractFile(unit)))
    );

/**
 * `in-memory` → `wireInMemoryImplementation`.
 */
export const implementationWireName = (label: string) =>
    `wire${new UnknownFormatNaming(label).ClassName}Implementation`;

/**
 * `OrderRepository`, `PlaceOrderCommand`, `PaymentGateway`.
 */
export const contractClassName = (unit: BackendUnit) =>
    kindLayouts[unit.kind].core(new UnknownFormatNaming(unit.name).ClassName);

/**
 * `in-memory` → `InMemoryOrderRepository`.
 */
export const implementationClassName = (unit: BackendUnit, label: string) =>
    `${new UnknownFormatNaming(label).ClassName}${contractClassName(unit)}`;

/**
 * The implementation's file, relative to the unit's owner.
 */
export const implementationFile = (unit: BackendUnit, label: string) => {
    const { implementations } = kindLayouts[unit.kind];
    return kindLayouts[unit.kind]
        .files(unit, [label])
        .find((file) => file.startsWith(`${implementations}/`))!;
};

/**
 * The unit's wire, relative to its owner.
 */
export const contractWireFile = (unit: BackendUnit) =>
    kindLayouts[unit.kind]
        .files(unit, [])
        .find((file) => file.startsWith('wiring/'))!;

const handlerImplementation = (
    ContractName: string,
    ClassName: string,
    contractImport: string
) =>
    withHandlers()
        ? `
import { defineHandler } from '@domain-first/handlers'
import { ${ContractName} } from '${contractImport}'

export class ${ClassName} extends ${ContractName} {
    constructor() {
        super()
    }

    handle = defineHandler({
        inputSchema: ${ContractName}.inputSchema,
        outputSchema: ${ContractName}.outputSchema,
        handler: async (input) => {
            return {}
        }
    })
}
        `.trim()
        : `
import { ${ContractName} } from '${contractImport}'

export class ${ClassName} extends ${ContractName} {
    constructor() {
        super()
    }
}
    `.trim();

/**
 * Creates the class of one implementation of the contract. Without
 * wiring, an `in-memory` one gets the in-memory DB in its constructor;
 * with wiring, it is a suggested dependency instead.
 */
export const createImplementation = (
    ownerFolder: Folder,
    unit: BackendUnit,
    label: string
) => {
    const naming = new UnknownFormatNaming(unit.name);
    const ContractName = contractClassName(unit);
    const className = implementationClassName(unit, label);
    const [folder, fileName] = [
        path.dirname(implementationFile(unit, label)),
        path.basename(implementationFile(unit, label))
    ];
    const implementationFolder = ownerFolder.subitem(folder.split('/'));
    const inMemoryDb = !withWiring() && usesInMemoryDb(label);

    switch (unit.kind) {
        case 'aggregate': {
            const contractImport = `../../../domain/aggregates/${unit.name}`;
            if (inMemoryDb) {
                /**
                 * An in-memory repository keeps its aggregates in their
                 * own section of the shared in-memory DB.
                 */
                const section = addInMemoryDbSection(
                    naming,
                    ownerFolder.subitem(['domain', 'aggregates', unit.name])
                        .path
                );
                const file = implementationFolder.createFile(
                    fileName,
                    `
${inMemoryDbTypeImport(implementationFolder.subitem([fileName]).path)}
import { ${ContractName} } from '${contractImport}'

export class ${className} implements ${ContractName} {
    ${inMemoryDbSectionMembers(section, false)}
}
                        `.trim()
                );
                return { file, className };
            }
            const file = implementationFolder.createFile(
                fileName,
                `
import { ${ContractName} } from '${contractImport}'

export class ${className} implements ${ContractName} {
    constructor() {}
}

                        `.trim()
            );
            return { file, className };
        }
        case 'command':
        case 'query': {
            const folderName = unit.kind === 'command' ? 'commands' : 'queries';
            const file = implementationFolder.createFile(
                fileName,
                handlerImplementation(
                    ContractName,
                    className,
                    `../../../application/${folderName}/${naming.fileName}-${unit.kind}`
                )
            );
            if (inMemoryDb) {
                injectInMemoryDb(file, className);
            }
            return { file, className };
        }
        case 'port': {
            const file = implementationFolder.createFile(
                fileName,
                `
import { ${ContractName} } from '../../../application/ports/${naming.fileName}'

export class ${className} extends ${ContractName} {

}
            `.trim()
            );
            return { file, className };
        }
        default:
            throw new Error(`${unit.kind} has no implementations`);
    }
};

/**
 * With wiring, an in-memory repository keeps only its aggregate's
 * section of the in-memory DB.
 */
export const inMemoryRepositoryWiring =
    (ownerFolder: Folder, unit: BackendUnit, wireFile: File): CustomWiring =>
    (implementation, dependency) => {
        if (unit.kind !== 'aggregate' || !isInMemoryDb(dependency)) {
            return false;
        }
        keepInMemoryDbSection(
            new File(implementation.file),
            addInMemoryDbSection(
                new UnknownFormatNaming(unit.name),
                ownerFolder.subitem(['domain', 'aggregates', unit.name]).path
            )
        );
        wireInMemoryDb(wireFile, implementation.className);
        return true;
    };
