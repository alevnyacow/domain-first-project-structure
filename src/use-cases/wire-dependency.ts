import { moduleId } from '../agent-identifiers';
import { ConfigFile } from '../config-file';
import { type File, Folder } from '../file-system';
import { checkbox, report, Separator, select } from '../interaction';
import { ProjectRoot } from '../project-root';
import {
    availableDependencies,
    findWiredModules,
    implementationType,
    isSuggestedFor,
    readWiredModule,
    type WiredClass,
    type WiredModule,
    wireDependencies
} from '../wiring';

/**
 * Group headers, in the order of layers.
 */
const kindTitles: Record<string, string> = {
    repositories: 'Repositories',
    'domain-services': 'Domain services',
    'application-ports': 'Ports',
    'application-services': 'Application services',
    queries: 'Queries',
    commands: 'Commands',
    'use-cases': 'Use cases',
    'infrastructure-services': 'Infrastructure services',
    'presentation-services': 'Presentation services'
};

/**
 * Choices under a header per kind of module, suggested ones first, only
 * there and checked; the order inside a group is kept.
 */
const groupedChoices = <T extends Option>(items: T[], suggested: T[] = []) => {
    const suggestedChoices = suggested.length
        ? [
              new Separator('── Suggested'),
              ...suggested.map((x) => ({
                  name: x.label,
                  value: x,
                  checked: true
              }))
          ]
        : [];
    const kinds = [
        ...new Set([
            ...Object.keys(kindTitles),
            ...items.map((x) => x.module.kind)
        ])
    ];
    return [
        ...suggestedChoices,
        ...kinds.flatMap((kind) => {
            const group = items.filter(
                (x) => x.module.kind === kind && !suggested.includes(x)
            );
            return group.length
                ? [
                      new Separator(`── ${kindTitles[kind] ?? kind}`),
                      ...group.map((x) => ({ name: x.label, value: x }))
                  ]
                : [];
        })
    ];
};

/**
 * Headers take lines too, so show more than the default 7.
 */
const groupedPageSize = 20;

type Option = { module: WiredModule; label: string };

/**
 * Wires a chosen dependency in its own way. Returns false to leave it to
 * the default wiring.
 */
export type CustomWiring = (
    implementation: WiredClass,
    dependency: WiredModule
) => boolean;

/**
 * Local, Shared Kernel and neighboring modules, labelled by owner.
 */
const dependencyOptions = (boundedContextFolder: Folder): Option[] => {
    const sharedFolder = new Folder(new ProjectRoot().path).subitem([
        ConfigFile.Instance.data.project.rootFolder,
        'shared-kernel'
    ]);
    const isShared = sharedFolder.path === boundedContextFolder.path;
    const contextsFolder = new Folder(new ProjectRoot().path).subitem([
        ConfigFile.Instance.data.project.rootFolder,
        'bounded-contexts'
    ]);

    return [
        ...findWiredModules(boundedContextFolder.path).map((x) => ({
            module: x,
            label: x.typeName
        })),
        ...(isShared
            ? []
            : findWiredModules(sharedFolder.path).map((x) => ({
                  module: x,
                  label: `${x.typeName} (shared-kernel)`
              }))),
        ...(isShared
            ? []
            : contextsFolder.content.subfolderNames
                  .filter((name) => name !== boundedContextFolder.name)
                  .sort()
                  .flatMap((name) =>
                      findWiredModules(contextsFolder.subitem([name]).path).map(
                          (module) => ({
                              module,
                              label: `${module.typeName} (${name})`
                          })
                      )
                  ))
    ];
};

/**
 * Asks which permitted modules to inject. Returns false if there is
 * nothing to choose.
 */
const promptDependencies = async (
    boundedContextFolder: Folder,
    consumer: WiredModule,
    implementations: WiredClass[] = consumer.implementations,
    customWiring?: CustomWiring
) => {
    const options = dependencyOptions(boundedContextFolder);
    let asked = false;

    /**
     * Implementations of a branched wire are wired in isolation: each
     * gets its own question.
     */
    for (const implementation of implementations) {
        const available = availableDependencies(
            consumer,
            implementation,
            options.map((x) => x.module)
        );
        const candidates = options.filter((x) => available.includes(x.module));

        if (!candidates.length) {
            continue;
        }
        asked = true;

        const type = implementationType(consumer, implementation);
        const suggested = type
            ? candidates.filter((x) => isSuggestedFor(x.module, type))
            : [];

        const dependencies = await checkbox({
            key: `dependencies.${implementation.className}`,
            id: (value) => moduleId(value.module),
            message: consumer.branched
                ? `Dependencies for ${implementation.className}:`
                : 'Dependencies:',
            choices: groupedChoices(candidates, suggested),
            pageSize: groupedPageSize,
            loop: false
        });

        const defaultWired = dependencies
            .map((x) => x.module)
            .filter((x) => !customWiring?.(implementation, x));

        if (defaultWired.length) {
            wireDependencies(consumer, implementation, defaultWired);
        }
    }

    return asked;
};

/**
 * The last step of generators that create a wire.
 */
export const wireNewModuleDependencies = async (
    boundedContextFolder: Folder,
    wireFile: File,
    customWiring?: CustomWiring
) => {
    const consumer = readWiredModule(wireFile.path, boundedContextFolder.path);
    if (consumer) {
        await promptDependencies(
            boundedContextFolder,
            consumer,
            consumer.implementations,
            customWiring
        );
    }
};

/**
 * The last step of adding an implementation to a branched wire: only
 * the new implementation is asked about.
 */
export const wireNewImplementationDependencies = async (
    boundedContextFolder: Folder,
    wireFile: File,
    className: string,
    customWiring?: CustomWiring
) => {
    const consumer = readWiredModule(wireFile.path, boundedContextFolder.path);
    const implementation = consumer?.implementations.find(
        (x) => x.className === className
    );
    if (consumer && implementation) {
        await promptDependencies(
            boundedContextFolder,
            consumer,
            [implementation],
            customWiring
        );
    }
};

export const wireDependency = async (boundedContextFolder: Folder) => {
    const modules = findWiredModules(boundedContextFolder.path);

    if (!modules.length) {
        report('No wired modules here yet.');
        return;
    }

    /**
     * A branched module is listed once per implementation, which is then
     * wired alone.
     */
    const { module: consumer, implementation } = await select({
        key: 'module',
        id: (value) =>
            `${moduleId(value.module)}:${value.implementation.className}`,
        message: 'Module:',
        choices: groupedChoices(
            modules.flatMap((x) =>
                x.implementations.map((implementation) => {
                    const type = implementationType(x, implementation);
                    return {
                        module: x,
                        label: type ? `${x.typeName} (${type})` : x.typeName,
                        implementation
                    };
                })
            )
        ),
        pageSize: groupedPageSize,
        loop: false
    });

    if (
        !(await promptDependencies(boundedContextFolder, consumer, [
            implementation
        ]))
    ) {
        report('No dependencies available for this module.');
    }
};

/**
 * The endpoint's handler, from the context's queries, commands, and use
 * cases. Undefined when there is nothing to choose from.
 */
export const promptEndpointHandler = async (boundedContextFolder: Folder) => {
    const handlers = findWiredModules(boundedContextFolder.path)
        .filter((x) => ['queries', 'commands', 'use-cases'].includes(x.kind))
        .map((x) => ({ module: x, label: x.typeName }));

    return handlers.length
        ? (
              await select({
                  key: 'handler',
                  id: (value) => moduleId(value.module),
                  message: 'Handler:',
                  choices: groupedChoices(handlers),
                  pageSize: groupedPageSize,
                  loop: false
              })
          ).module
        : undefined;
};
