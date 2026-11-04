import z from 'zod';
import { implementationLabelSchema } from './implementation-options-schema';
import { integrationIds } from './use-cases/add-integration';

const name = implementationLabelSchema;
const nestedName = z
    .string()
    .regex(
        /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/
    );
const id = z.string().min(1);
const implementation = z.strictObject({
    type: name,
    save: z
        .boolean()
        .optional()
        .describe(
            'Remember this ordinary type for future runs. Default: false.'
        )
});
const dependencies = z
    .record(z.string().regex(/^[A-Z][A-Za-z0-9]*$/), z.array(id))
    .describe(
        'Implementation/class name -> exact module IDs from --describe. Omitted entries keep suggested dependencies; [] selects none.'
    );
const common = {
    overwrite: z.boolean().optional(),
    dryRun: z.boolean().optional()
};
const owner = {
    context: name.describe('A bounded-context name, or shared-kernel.')
};
const wired = { dependencies: dependencies.optional() };
const implementations = {
    implementation,
    testImplementation: implementation.optional(),
    ...wired
};
const named = { ...common, ...owner, name };
const operation = <T extends string, S extends z.ZodRawShape>(
    value: T,
    shape: S
) => z.strictObject({ operation: z.literal(value), ...shape });

export const scaffoldRequestSchema = z.discriminatedUnion('operation', [
    operation('bounded-context', {
        ...common,
        name: name.refine(
            (value) => value !== 'shared-kernel',
            'shared-kernel is reserved for the Shared Kernel.'
        )
    }),
    operation('aggregate', {
        ...named,
        withRepository: z.boolean().optional(),
        implementation: implementation.optional(),
        testImplementation: implementation.optional(),
        ...wired
    }),
    operation('entity', { ...named, aggregate: name.optional() }),
    operation('value-object', { ...named, aggregate: name.optional() }),
    operation('error', { ...named, namespace: name.optional() }),
    operation('error-namespace', named),
    operation('domain-service', { ...named, ...wired }),
    operation('application-service', { ...named, ...wired }),
    operation('infrastructure-service', { ...named, ...wired }),
    operation('presentation-service', { ...named, ...wired }),
    operation('use-case', { ...named, ...wired }),
    operation('command', { ...named, ...implementations }),
    operation('query', { ...named, ...implementations }),
    operation('port', { ...named, ...implementations }),
    operation('implementation', {
        ...common,
        ...owner,
        contract: id.describe('Exact contract ID from --describe.'),
        implementation,
        environments: z
            .array(name)
            .min(1)
            .optional()
            .describe(
                'Required when the contract wire is envBranchedWire; omit it otherwise.'
            ),
        ...wired
    }),
    operation('endpoint', {
        ...common,
        ...owner,
        controller: name
            .optional()
            .describe(
                'Omit for the context-root controller (root): `/<context>/<path>`.'
            ),
        method: z.enum(['get', 'post', 'put', 'patch', 'delete']),
        path: z
            .string()
            .regex(/^(?:\/?(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*\/?$/),
        handler: id
            .optional()
            .describe(
                'Exact handler module ID from --describe. Required when the context has wired queries, commands or use cases; omit it otherwise.'
            )
    }),
    operation('wire-dependency', {
        ...common,
        ...owner,
        module: id.describe(
            'Exact wiring target ID, including implementation class, from --describe.'
        ),
        dependencies
    }),
    operation('delete', {
        ...common,
        ...owner,
        module: id.describe(
            'Exact unit ID from --describe. Refused while other files use it.'
        )
    }),
    operation('move', {
        ...common,
        ...owner,
        module: id.describe('Exact unit ID from --describe.'),
        targetContext: name.optional(),
        name: name.optional(),
        aggregate: name.optional()
    })
]);
export const reactRequestSchema = z.discriminatedUnion('operation', [
    operation('page', { ...common, name: nestedName }),
    operation('widget', {
        ...common,
        name: nestedName,
        widgetType: z.enum(['monolithic', 'separated', 'headless']).optional()
    }),
    operation('ui-kit-component', { ...common, name }),
    operation('shared-hook', { ...common, name }),
    operation('move-page', {
        ...common,
        module: nestedName,
        name: nestedName,
        moveRoute: z
            .boolean()
            .optional()
            .describe(
                'With Next.js and a route at the page path: move it too (default true). Omit it without such a route.'
            )
    }),
    operation('delete-page', {
        ...common,
        module: nestedName,
        deleteRoute: z
            .boolean()
            .optional()
            .describe(
                "With Next.js and the page's own route: delete it too (default true). Omit it without such a route."
            )
    }),
    operation('delete-widget', { ...common, module: nestedName }),
    operation('move-ui-kit-component', { ...common, module: name, name }),
    operation('move-shared-hook', { ...common, module: name, name }),
    operation('delete-ui-kit-component', { ...common, module: name }),
    operation('delete-shared-hook', { ...common, module: name }),
    operation('move-widget', {
        ...common,
        module: nestedName,
        name: nestedName
    })
]);
const relativePath = z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
    .refine(
        (value) =>
            !value.split('/').some((part) => part === '.' || part === '..'),
        'Use a project-relative path without . or .. segments.'
    );
export const integrationRequestSchema = operation('add', {
    ...common,
    integrations: z.array(z.enum(integrationIds)).min(1),
    nextAdapter: z.boolean().optional(),
    configureReact: z.boolean().optional(),
    replaceTestingLibrary: z.boolean().optional(),
    withService: z.boolean().optional(),
    routePrefix: z
        .string()
        .regex(/^\/?[a-zA-Z0-9_/-]*$/)
        .optional(),
    openapiPath: relativePath.optional(),
    withExtractor: z.boolean().optional(),
    swaggerPage: z.boolean().optional(),
    targets: z
        .array(z.enum(['hooks', 'client']))
        .min(1)
        .optional(),
    scriptConflicts: z
        .record(id, z.enum(['keep', 'replace', 'rename']))
        .optional(),
    scriptNames: z.record(id, z.string().regex(/^[a-zA-Z0-9:_-]+$/)).optional()
});
export type AgentCommand = 'df-scaffold' | 'df-react' | 'df-integration';
export const requestSchemaFor = (command: AgentCommand) =>
    ({
        'df-scaffold': scaffoldRequestSchema,
        'df-react': reactRequestSchema,
        'df-integration': integrationRequestSchema
    })[command];
