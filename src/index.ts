#!/usr/bin/env node

import { select } from '@inquirer/prompts';
import { ConfigFile } from './config-file';
import { Folder } from './file-system';
import { ProjectRoot } from './project-root';
import {
    initializeUseCase,
    scaffoldNewAggregateUseCase,
    scaffoldNewApplicationPort,
    scaffoldNewBoundedContextUseCase,
    scaffoldNewCommand,
    scaffoldNewDomainService,
    scaffoldNewErrorUseCase,
    scaffoldNewHandlersRestEndpoint,
    scaffoldNewQuery,
    scaffoldNewUseCase
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
        { name: 'Shared Layer', action: 'Scaffold in bounded context' },
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
                    : [ConfigFile.Instance.data.rootFolder, 'shared']
            );

            const layer = await select({
                message: 'Layer:',
                choices: ['Domain', 'Application', 'Presentation']
            });

            if (layer === 'Domain') {
                const operation = await select({
                    message: 'Domain layer operation:',
                    choices: specificContext
                        ? ['New Aggregate', 'Errors', 'New Service']
                        : ['Errors']
                });

                switch (operation) {
                    case 'New Aggregate': {
                        await scaffoldNewAggregateUseCase(boundedContextFolder);
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
                              'New Port'
                          ]
                        : ['New Port']
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
                                  : undefined
                          ].filter((x) => x)
                        : ['']
                });

                switch (action) {
                    case 'New Handlers-REST Endpoint': {
                        await scaffoldNewHandlersRestEndpoint(
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

main();
