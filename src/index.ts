#!/usr/bin/env node

import { select } from '@inquirer/prompts';
import { ConfigFile } from './config-file';
import { Folder } from './file-system';
import { ProjectRoot } from './project-root';
import { savePendingChanges } from './save-pending-changes';
import {
    moveBackendUnitUseCase,
    scaffoldNewAggregateUseCase,
    scaffoldNewApplicationPort,
    scaffoldNewApplicationService,
    scaffoldNewBoundedContextUseCase,
    scaffoldNewCommand,
    scaffoldNewDomainObject,
    scaffoldNewDomainService,
    scaffoldNewErrorUseCase,
    scaffoldNewHandlersRestEndpoint,
    scaffoldNewInfrastructureService,
    scaffoldNewPresentationService,
    scaffoldNewQuery,
    scaffoldNewUseCase,
    wireDependency
} from './use-cases';

const main = async () => {
    if (!ConfigFile.exists) {
        console.log(
            'No domain-first.project-structure.config.json found: run df-init first to initialize the project.'
        );
        process.exit(1);
    }

    const rootPath = new ProjectRoot().path;

    const currentBoundedContextOptions = new Folder(rootPath)
        .subitem([ConfigFile.Instance.data.rootFolder, 'bounded-contexts'])
        .content.subfolderNames.map((name) => ({
            name: `Bounded Context: ${name}`,
            action: 'Scaffold in bounded context' as const
        }));

    const scaffoldNewBoundedContext = {
        name: 'Scaffold new bounded context',
        action: 'Scaffold new bounded context' as const
    };

    const options = [
        ...currentBoundedContextOptions,
        { name: 'Shared Kernel', action: 'Scaffold in bounded context' },
        scaffoldNewBoundedContext
    ];

    const result = await select({
        message: '@domain-first/project-structure',
        choices: options.map((x) => x.name)
    });

    const { action, name } = options.find((x) => x.name === result)!;

    switch (action) {
        case 'Scaffold new bounded context': {
            await scaffoldNewBoundedContextUseCase();
            return;
        }
        case 'Scaffold in bounded context': {
            const specificContext = name.startsWith('Bounded');
            const boundedContextFolder = new Folder(
                new ProjectRoot().path
            ).subitem(
                specificContext
                    ? [
                          ConfigFile.Instance.data.rootFolder,
                          'bounded-contexts',
                          name.substring('Bounded Context: '.length)
                      ]
                    : [ConfigFile.Instance.data.rootFolder, 'shared-kernel']
            );

            const layer = await select({
                message: 'Layer:',
                choices: [
                    'Domain',
                    'Application',
                    'Infrastructure',
                    'Presentation',
                    ConfigFile.Instance.data.domainFirstPackages.includes(
                        '@domain-first/wire'
                    )
                        ? 'Wire dependency'
                        : undefined,
                    'Move or rename'
                ].filter((x) => !!x)
            });

            if (layer === 'Wire dependency') {
                await wireDependency(boundedContextFolder);
                return;
            }

            if (layer === 'Move or rename') {
                await moveBackendUnitUseCase(boundedContextFolder);
                return;
            }

            if (layer === 'Domain') {
                const operation = await select({
                    message: 'Domain layer operation:',
                    choices: specificContext
                        ? [
                              'New Aggregate',
                              'New Entity',
                              'New Value Object',
                              'Errors',
                              'New Service'
                          ]
                        : [
                              'New Entity',
                              'New Value Object',
                              'Errors',
                              'New Service'
                          ]
                });

                switch (operation) {
                    case 'New Aggregate': {
                        await scaffoldNewAggregateUseCase(boundedContextFolder);
                        return;
                    }
                    case 'New Entity': {
                        await scaffoldNewDomainObject(
                            boundedContextFolder,
                            'entity'
                        );
                        return;
                    }
                    case 'New Value Object': {
                        await scaffoldNewDomainObject(
                            boundedContextFolder,
                            'value-object'
                        );
                        return;
                    }
                    case 'Errors': {
                        await scaffoldNewErrorUseCase(boundedContextFolder);
                        return;
                    }
                    case 'New Service': {
                        await scaffoldNewDomainService(boundedContextFolder);
                        return;
                    }
                }
            }
            if (layer === 'Application') {
                const operation = await select({
                    message: 'Application layer operation:',
                    choices: specificContext
                        ? [
                              'New Query',
                              'New Command',
                              'New Use Case',
                              'New Port',
                              'New Service'
                          ]
                        : ['New Port', 'New Service']
                });

                switch (operation) {
                    case 'New Query': {
                        await scaffoldNewQuery(boundedContextFolder);
                        return;
                    }
                    case 'New Command': {
                        await scaffoldNewCommand(boundedContextFolder);
                        return;
                    }
                    case 'New Use Case': {
                        await scaffoldNewUseCase(boundedContextFolder);
                        return;
                    }
                    case 'New Port': {
                        await scaffoldNewApplicationPort(boundedContextFolder);
                        return;
                    }
                    case 'New Service': {
                        await scaffoldNewApplicationService(
                            boundedContextFolder
                        );
                        return;
                    }
                }
            }
            if (layer === 'Infrastructure') {
                const operation = await select({
                    message: 'Infrastructure layer operation:',
                    choices: ['New Service']
                });

                switch (operation) {
                    case 'New Service': {
                        await scaffoldNewInfrastructureService(
                            boundedContextFolder
                        );
                        return;
                    }
                }
            }
            if (layer === 'Presentation') {
                const action = await select({
                    message: 'Presentation layer operation:',
                    choices: specificContext
                        ? [
                              ConfigFile.Instance.data.domainFirstPackages.includes(
                                  '@domain-first/handlers-rest'
                              )
                                  ? 'New Handlers-REST Endpoint'
                                  : undefined,
                              'New Service'
                          ].filter((x) => x)
                        : ['New Service']
                });

                switch (action) {
                    case 'New Handlers-REST Endpoint': {
                        await scaffoldNewHandlersRestEndpoint(
                            boundedContextFolder
                        );
                        return;
                    }
                    case 'New Service': {
                        await scaffoldNewPresentationService(
                            boundedContextFolder
                        );
                        return;
                    }
                }
            }
            return;
        }
        default: {
            return;
        }
    }
};

const run = async () => {
    await main();

    await savePendingChanges();
};

run();
