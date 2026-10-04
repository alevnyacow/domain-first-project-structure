#!/usr/bin/env node

import path from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { ConfigFile } from './config-file';
import { Folder, filesToOverwrite, writePendingChanges } from './file-system';
import { ProjectRoot } from './project-root';
import {
    initializeUseCase,
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
    scaffoldReactPage,
    scaffoldReactSharedHook,
    scaffoldReactUIKitComponent,
    scaffoldReactWidget
} from './use-cases';

const main = async () => {
    /**
     * If no config file was found, initialize a project.
     */
    if (!ConfigFile.exists) {
        await initializeUseCase();
        return;
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
        ConfigFile.Instance.data.useReact
            ? {
                  name: 'Scaffold React module',
                  action: 'Scaffold React module'
              }
            : undefined,
        { name: 'Shared Layer', action: 'Scaffold in bounded context' },
        scaffoldNewBoundedContext
    ].filter((x) => !!x);

    const result = await select({
        message: '@domain-first/project-structure',
        choices: options.map((x) => x.name)
    });

    const { action, name } = options.find((x) => x.name === result)!;

    switch (action) {
        case 'Scaffold React module': {
            const reactFolder = new Folder(rootPath).subitem([
                ConfigFile.Instance.data.rootFolder,
                'presentation',
                'react'
            ]);
            const action = await select({
                message: 'Module: ',
                choices: [
                    'New widget',
                    'New page',
                    'New UI-kit component',
                    'New shared hook'
                ]
            });
            switch (action) {
                case 'New widget': {
                    await scaffoldReactWidget(reactFolder);
                    return;
                }
                case 'New page': {
                    await scaffoldReactPage(reactFolder);
                    return;
                }
                case 'New UI-kit component': {
                    await scaffoldReactUIKitComponent(reactFolder);
                    return;
                }
                case 'New shared hook': {
                    await scaffoldReactSharedHook(reactFolder);
                    return;
                }
                default: {
                    return;
                }
            }
        }
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
                    : [ConfigFile.Instance.data.rootFolder, 'shared']
            );

            const layer = await select({
                message: 'Layer:',
                choices: [
                    'Domain',
                    'Application',
                    'Infrastructure',
                    'Presentation'
                ]
            });

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
                        : ['New Entity', 'New Value Object', 'Errors']
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

    const overwrittenFiles = filesToOverwrite();

    if (overwrittenFiles.length) {
        const root = new ProjectRoot().path;
        console.log('These files already exist and will be overwritten:');
        for (const filePath of overwrittenFiles) {
            console.log(`  ${path.relative(root, filePath)}`);
        }

        const overwrite = await confirm({
            message: 'Overwrite them?',
            default: false
        });

        if (!overwrite) {
            console.log('Cancelled: nothing was written.');
            return;
        }
    }

    writePendingChanges();
};

run();
