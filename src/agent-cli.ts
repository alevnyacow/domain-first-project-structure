import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import z from 'zod';
import { moduleId, unitId } from './agent-identifiers';
import { type AgentCommand, requestSchemaFor } from './agent-requests';
import { findBackendUnits } from './backend-module-move';
import { ConfigFile } from './config-file';
import { hasNeighboringBoundedContext } from './context-dependencies';
import {
    discardPendingChanges,
    Folder,
    filesToOverwrite,
    pendingChanges
} from './file-system';
import {
    implementationKinds,
    savedImplementations
} from './implementation-choices';
import { findContracts } from './implementations';
import {
    assertAnswersConsumed,
    RequestError,
    runWithAnswers
} from './interaction';
import { ProjectRoot } from './project-root';
import {
    findReactModules,
    type ReactModuleKind,
    reactKindTitles
} from './react-module-move';
import { restControllers } from './rest-layout';
import { savePendingChanges } from './save-pending-changes';
import { systemImplementationChoices } from './system-implementations';
import {
    addIntegration,
    deleteBackendUnitUseCase,
    deleteReactModuleUseCase,
    moveBackendUnitUseCase,
    moveReactModuleUseCase,
    scaffoldNewAggregateUseCase,
    scaffoldNewApplicationPort,
    scaffoldNewApplicationService,
    scaffoldNewBoundedContextUseCase,
    scaffoldNewCommand,
    scaffoldNewDomainObject,
    scaffoldNewDomainService,
    scaffoldNewErrorUseCase,
    scaffoldNewHandlersRestEndpoint,
    scaffoldNewImplementation,
    scaffoldNewInfrastructureService,
    scaffoldNewPresentationService,
    scaffoldNewQuery,
    scaffoldNewUseCase,
    scaffoldReactPage,
    scaffoldReactSharedHook,
    scaffoldReactUIKitComponent,
    scaffoldReactWidget,
    wireDependency
} from './use-cases';
import { integrationDescriptions } from './use-cases/add-integration';
import { findRestEndpointGenerator } from './use-cases/rest-endpoint-generator';
import { rootControllerChoice } from './use-cases/scaffold-new-handlers-rest-endpoint';
import { availableDependencies, findWiredModules } from './wiring';

export type AgentRequest = {
    operation: string;
    context?: string;
    name?: string;
    module?: string;
    aggregate?: string;
    namespace?: string;
    targetContext?: string;
    controller?: string;
    withRepository?: boolean;
    dryRun?: boolean;
    overwrite?: boolean;
    dependencies?: Record<string, string[]>;
    scriptConflicts?: Record<string, string>;
    scriptNames?: Record<string, string>;
    [key: string]: unknown;
};
const requireProject = () => {
    try {
        return new ProjectRoot().path;
    } catch {
        throw new RequestError(
            'PROJECT_NOT_FOUND',
            'Run inside a project with package.json.'
        );
    }
};
const ownerFolders = (root: string) => {
    const source = new Folder(root).subitem([
        ConfigFile.Instance.data.project.rootFolder
    ]);
    return [
        { name: 'shared-kernel', folder: source.subitem(['shared-kernel']) },
        ...source
            .subitem(['bounded-contexts'])
            .content.subfolderNames.sort()
            .map((name) => ({
                name,
                folder: source.subitem(['bounded-contexts', name])
            }))
    ];
};
const ownerFor = (context: string) => {
    const owner = ownerFolders(requireProject()).find(
        (owner) => owner.name === context
    );
    if (!owner)
        throw new RequestError(
            'CONTEXT_NOT_FOUND',
            `Unknown context: ${context}.`,
            { context }
        );
    return owner.folder;
};
const precondition = (command: AgentCommand) => {
    requireProject();
    if (!ConfigFile.exists)
        throw new RequestError(
            'CONFIG_NOT_FOUND',
            'Ask the project owner to run df-init.'
        );
    if (ConfigFile.outdated)
        throw new RequestError(
            'CONFIG_OUTDATED',
            'The config has the format of an earlier major version: ask the project owner to run df-upgrade.'
        );
    if (command === 'df-scaffold' && !ConfigFile.Instance.data.backend)
        throw new RequestError(
            'BACKEND_NOT_CONFIGURED',
            'Ask the project owner to run df-init --section backend.'
        );
    if (command === 'df-react' && !ConfigFile.Instance.data.frontend?.react)
        throw new RequestError(
            'FRONTEND_NOT_CONFIGURED',
            'Ask the project owner to run df-init --section frontend.'
        );
};

/** Schema and selectable IDs use the same scanners and dependency rules as the menus. */
export const describeAgentCommand = (command: AgentCommand) => {
    let root: string | undefined;
    try {
        root = new ProjectRoot().path;
    } catch {
        /* Describing the protocol needs no initialized project. */
    }
    const configStatus =
        !root || !ConfigFile.exists
            ? 'missing'
            : ConfigFile.outdated
              ? 'outdated'
              : 'current';
    const configured = configStatus === 'current';
    const config = configured ? ConfigFile.Instance.data : undefined;
    const owners = configured ? ownerFolders(root!) : [];
    const modules = owners.flatMap((owner) =>
        findWiredModules(owner.folder.path)
    );
    const relative = (file: string) =>
        path.relative(root!, file).split(path.sep).join('/');
    return {
        schemaVersion: 1,
        command,
        requestSchema: z.toJSONSchema(requestSchemaFor(command)),
        project: root
            ? {
                  root,
                  configured,
                  configStatus,
                  config,
                  contexts: owners.map((owner) => ({
                      name: owner.name,
                      units: findBackendUnits(owner.folder.path).map(
                          (unit) => ({
                              id: unitId(unit),
                              kind: unit.kind,
                              name: unit.name,
                              aggregate: unit.aggregate,
                              implementations: unit.labels
                          })
                      ),
                      contracts: findContracts(owner.folder.path).map(
                          (unit) => ({
                              id: unitId(unit),
                              kind: unit.kind,
                              implementations: unit.labels
                          })
                      ),
                      modules: findWiredModules(owner.folder.path).map(
                          (module) => ({
                              id: moduleId(module),
                              kind: module.kind,
                              file: relative(module.typeFile),
                              implementations: module.implementations.map(
                                  (implementation) => ({
                                      className: implementation.className,
                                      target: `${moduleId(module)}:${implementation.className}`,
                                      dependencies: availableDependencies(
                                          module,
                                          implementation,
                                          owner.name === 'shared-kernel'
                                              ? modules.filter((module) =>
                                                    moduleId(module).startsWith(
                                                        'shared-kernel:'
                                                    )
                                                )
                                              : modules
                                      ).map(moduleId)
                                  })
                              )
                          })
                      ),
                      implementationTypes: config?.backend
                          ? Object.fromEntries(
                                implementationKinds.map((kind) => [
                                    kind,
                                    {
                                        primary: savedImplementations(
                                            kind,
                                            'primary'
                                        ),
                                        test: savedImplementations(
                                            kind,
                                            'test'
                                        ),
                                        system: systemImplementationChoices(
                                            kind,
                                            owner.name !== 'shared-kernel' &&
                                                hasNeighboringBoundedContext(
                                                    owner.folder.path
                                                )
                                        )
                                    }
                                ])
                            )
                          : undefined
                  })),
                  integrations: integrationDescriptionsSafe(configured),
                  reactModules: config?.frontend?.react
                      ? (['page', 'widget', 'ui-kit', 'hook'] as const).flatMap(
                            (kind) =>
                                findReactModules(
                                    path.join(
                                        root!,
                                        config.project.rootFolder,
                                        'presentation/react'
                                    ),
                                    kind
                                ).map((module) => ({
                                    kind,
                                    name: module.name,
                                    file: relative(module.path)
                                }))
                        )
                      : []
              }
            : null
    };
};
const integrationDescriptionsSafe = (configured: boolean) =>
    configured ? integrationDescriptions() : [];

const answersFor = (
    command: AgentCommand,
    request: AgentRequest,
    owner?: Folder
) => {
    const answers: Record<string, unknown> = {};
    const defaults: Record<string, unknown> = {
        overwrite: request.overwrite ?? false,
        apply: true,
        withRepository: false,
        widgetType: 'with separated ui'
    };
    const ignored = new Set([
        'operation',
        'context',
        'overwrite',
        'dryRun',
        'dependencies',
        'scriptConflicts',
        'scriptNames',
        'namespace'
    ]);
    for (const [key, value] of Object.entries(request))
        if (!ignored.has(key)) answers[key] = value;
    for (const [implementation, ids] of Object.entries(
        request.dependencies ?? {}
    ))
        answers[`dependencies.${implementation}`] = ids;
    for (const [script, action] of Object.entries(
        request.scriptConflicts ?? {}
    ))
        answers[`scriptConflicts.${script}`] = {
            keep: 'Keep existing',
            replace: 'Replace',
            rename: 'Use another name'
        }[action];
    for (const [script, name] of Object.entries(request.scriptNames ?? {}))
        answers[`scriptNames.${script}`] = name;
    defaults.withTestImplementation = Boolean(request.testImplementation);
    if (request.operation === 'entity' || request.operation === 'value-object')
        defaults.aggregate = 'No aggregate';
    if (request.widgetType === 'separated')
        answers.widgetType = 'with separated ui';
    if (command === 'df-scaffold') {
        if (
            request.operation === 'error' ||
            request.operation === 'error-namespace'
        )
            defaults.errorAction =
                request.operation === 'error-namespace'
                    ? 'New namespace'
                    : request.namespace
                      ? `New error in namespace ${request.namespace}`
                      : 'New error without namespace';
        if (request.operation === 'endpoint') {
            delete answers.controller;
            if (request.controller === undefined)
                answers.controllerSelection = rootControllerChoice;
            else {
                const existing = restControllers(owner!.path).includes(
                    request.controller
                );
                answers.controllerSelection = existing
                    ? request.controller
                    : 'New controller';
                if (!existing) answers.controllerName = request.controller;
            }
        }
        if (request.operation === 'move')
            defaults.targetContext = request.context;
    }
    return { answers, defaults };
};

const executeScaffold = async (request: AgentRequest, owner: Folder) => {
    if (
        request.context === 'shared-kernel' &&
        ['aggregate', 'use-case', 'command', 'query', 'endpoint'].includes(
            request.operation
        )
    )
        throw new RequestError(
            'OPERATION_NOT_AVAILABLE',
            'This operation requires a bounded context.'
        );
    if (
        request.operation === 'aggregate' &&
        !request.withRepository &&
        (request.implementation ||
            request.testImplementation ||
            request.dependencies)
    )
        throw new RequestError(
            'INVALID_REQUEST',
            'Repository options require withRepository: true.'
        );
    if (
        request.operation === 'error' &&
        request.namespace &&
        !owner
            .subitem(['domain', 'errors'])
            .content.fileNames.includes(request.namespace)
    )
        throw new RequestError(
            'TARGET_NOT_FOUND',
            `Unknown namespace: ${request.namespace}.`
        );
    if (
        request.operation === 'implementation' &&
        !findContracts(owner.path).length
    )
        throw new RequestError(
            'TARGET_NOT_FOUND',
            'No contracts in this context.'
        );
    if (
        (request.operation === 'move' || request.operation === 'delete') &&
        !findBackendUnits(owner.path).length
    )
        throw new RequestError(
            'TARGET_NOT_FOUND',
            'No modules in this context.'
        );
    if (
        request.operation === 'wire-dependency' &&
        (!ConfigFile.backend.domainFirstPackages.includes(
            '@domain-first/wire'
        ) ||
            !findWiredModules(owner.path).length)
    )
        throw new RequestError(
            'TARGET_NOT_FOUND',
            'No wired modules in this context.'
        );
    if (request.operation === 'endpoint') {
        if (
            !ConfigFile.backend.domainFirstPackages.includes(
                '@domain-first/handlers-rest'
            ) ||
            !findRestEndpointGenerator(
                new Folder(requireProject()).subitem([
                    ConfigFile.Instance.data.project.rootFolder,
                    'shared-kernel'
                ])
            )
        )
            throw new RequestError(
                'REST_NOT_CONFIGURED',
                'Add the REST endpoint generator integration first.'
            );
    }
    if (
        (request.operation === 'entity' ||
            request.operation === 'value-object') &&
        request.aggregate &&
        !owner
            .subitem(['domain', 'aggregates'])
            .content.subfolderNames.includes(request.aggregate)
    )
        throw new RequestError(
            'TARGET_NOT_FOUND',
            `Unknown aggregate: ${request.aggregate}.`
        );
    const actions: Record<string, () => Promise<unknown>> = {
        aggregate: () => scaffoldNewAggregateUseCase(owner),
        entity: () => scaffoldNewDomainObject(owner, 'entity'),
        'value-object': () => scaffoldNewDomainObject(owner, 'value-object'),
        error: () => scaffoldNewErrorUseCase(owner),
        'error-namespace': () => scaffoldNewErrorUseCase(owner),
        'domain-service': () => scaffoldNewDomainService(owner),
        'application-service': () => scaffoldNewApplicationService(owner),
        'infrastructure-service': () => scaffoldNewInfrastructureService(owner),
        'presentation-service': () => scaffoldNewPresentationService(owner),
        'use-case': () => scaffoldNewUseCase(owner),
        command: () => scaffoldNewCommand(owner),
        query: () => scaffoldNewQuery(owner),
        port: () => scaffoldNewApplicationPort(owner),
        implementation: () => scaffoldNewImplementation(owner),
        endpoint: () => scaffoldNewHandlersRestEndpoint(owner),
        'wire-dependency': () => wireDependency(owner),
        move: () => moveBackendUnitUseCase(owner),
        delete: () => deleteBackendUnitUseCase(owner)
    };
    return actions[request.operation]();
};
const executeReact = async (request: AgentRequest) => {
    const folder = new Folder(requireProject()).subitem([
        ConfigFile.Instance.data.project.rootFolder,
        'presentation/react'
    ]);
    const kindOf = (operation: string): ReactModuleKind | undefined =>
        operation.endsWith('-page')
            ? 'page'
            : operation.endsWith('-widget')
              ? 'widget'
              : operation.endsWith('-ui-kit-component')
                ? 'ui-kit'
                : operation.endsWith('-shared-hook')
                  ? 'hook'
                  : undefined;
    const kind = /^(move|delete)-/.test(request.operation)
        ? kindOf(request.operation)
        : undefined;
    if (kind && !findReactModules(folder.path, kind).length)
        throw new RequestError(
            'TARGET_NOT_FOUND',
            `No React ${reactKindTitles[kind][1]} here.`
        );
    const actions: Record<string, () => Promise<unknown>> = {
        page: () => scaffoldReactPage(folder),
        widget: () => scaffoldReactWidget(folder),
        'ui-kit-component': () => scaffoldReactUIKitComponent(folder),
        'shared-hook': () => scaffoldReactSharedHook(folder),
        'move-page': () => moveReactModuleUseCase(folder, 'page'),
        'move-widget': () => moveReactModuleUseCase(folder, 'widget'),
        'delete-page': () => deleteReactModuleUseCase(folder, 'page'),
        'delete-widget': () => deleteReactModuleUseCase(folder, 'widget'),
        'move-ui-kit-component': () => moveReactModuleUseCase(folder, 'ui-kit'),
        'move-shared-hook': () => moveReactModuleUseCase(folder, 'hook'),
        'delete-ui-kit-component': () =>
            deleteReactModuleUseCase(folder, 'ui-kit'),
        'delete-shared-hook': () => deleteReactModuleUseCase(folder, 'hook')
    };
    return actions[request.operation]();
};

export const executeAgentRequest = async (
    command: AgentCommand,
    value: unknown
) => {
    discardPendingChanges();
    try {
        const parsed = requestSchemaFor(command).safeParse(value);
        if (!parsed.success)
            throw new RequestError(
                'INVALID_REQUEST',
                'Request does not match the operation schema.',
                {
                    issues: parsed.error.issues.map((issue) => ({
                        field: issue.path.join('.'),
                        message: issue.message
                    }))
                }
            );
        const request = parsed.data as AgentRequest;
        precondition(command);
        const root = requireProject();
        const owner =
            command === 'df-scaffold' && request.operation !== 'bounded-context'
                ? ownerFor(request.context!)
                : undefined;
        const { answers, defaults } = answersFor(command, request, owner);
        const execution = await runWithAnswers(answers, defaults, async () => {
            let nextSteps: string[] = [];
            if (command === 'df-scaffold') {
                if (request.operation === 'bounded-context')
                    await scaffoldNewBoundedContextUseCase();
                else await executeScaffold(request, owner!);
            } else if (command === 'df-react') await executeReact(request);
            else nextSteps = await addIntegration({ save: false });
            assertAnswersConsumed();
            const relative = (file: string) =>
                path.relative(root, file).split(path.sep).join('/');
            const planned = pendingChanges();
            const files = {
                created: planned.created.map(relative),
                updated: planned.updated.map(relative),
                deleted: planned.deleted.map(relative)
            };
            const directories = planned.directories.map(relative);
            const overwriteRequired = filesToOverwrite({
                changedOnly: true
            }).map(relative);
            if (request.dryRun) discardPendingChanges();
            else if (!(await savePendingChanges()))
                throw new RequestError('CANCELLED', 'Nothing was written.');
            return {
                schemaVersion: 1,
                ok: true,
                operation: request.operation,
                dryRun: request.dryRun ?? false,
                files,
                directories,
                overwriteRequired,
                nextSteps
            };
        });
        return { ...execution.result, messages: execution.messages };
    } catch (error) {
        discardPendingChanges();
        throw error;
    }
};

export const agentError = (error: unknown) => ({
    schemaVersion: 1,
    ok: false,
    error: {
        code:
            error instanceof RequestError
                ? error.code
                : error instanceof z.ZodError
                  ? 'INVALID_CONFIG'
                  : 'OPERATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof RequestError && error.details
            ? { details: error.details }
            : {})
    }
});
export const runCLI = async (
    command: AgentCommand,
    interactive: () => Promise<unknown>
) => {
    const args = process.argv.slice(2);
    const machine = args.some(
        (arg) =>
            arg === '--request' ||
            arg.startsWith('--request=') ||
            arg === '--describe' ||
            arg.startsWith('--describe=')
    );
    if (!machine) {
        if (
            command === 'df-scaffold' &&
            args.some((arg) => arg !== '--help' && arg !== '-h')
        )
            throw new RequestError(
                'INVALID_ARGUMENTS',
                'Use --request <json|->, --describe, or run without arguments.'
            );
        await interactive();
        return;
    }
    try {
        const { values } = parseArgs({
            args,
            options: {
                request: { type: 'string' },
                describe: { type: 'boolean' }
            }
        });
        if (values.describe && values.request !== undefined)
            throw new RequestError(
                'INVALID_ARGUMENTS',
                'Choose --describe or --request.'
            );
        if (values.describe)
            console.log(JSON.stringify(describeAgentCommand(command)));
        else {
            let value: unknown;
            try {
                value = JSON.parse(
                    values.request === '-'
                        ? fs.readFileSync(0, 'utf8')
                        : values.request!
                );
            } catch {
                throw new RequestError(
                    'INVALID_JSON',
                    'Provide valid JSON in --request, or use --request - with JSON on stdin.'
                );
            }
            console.log(
                JSON.stringify(await executeAgentRequest(command, value))
            );
        }
    } catch (error) {
        console.log(JSON.stringify(agentError(error)));
        process.exitCode = 1;
    }
};
