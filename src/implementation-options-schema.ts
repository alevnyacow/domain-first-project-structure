import z from 'zod';

export const implementationKinds = [
    'repositories',
    'commands',
    'queries',
    'ports'
] as const;
export type ImplementationKind = (typeof implementationKinds)[number];
export type ImplementationPurpose = 'primary' | 'test';
export const implementationLabelSchema = z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const implementationGroupSchema = z
    .object({
        primary: z.array(implementationLabelSchema).default([]),
        test: z.array(implementationLabelSchema).default([])
    })
    .strict();
export const implementationOptionsSchema = z
    .object({
        ...Object.fromEntries(
            implementationKinds.map((kind) => [
                kind,
                implementationGroupSchema.optional()
            ])
        ),
        /**
         * Implementation types whose implementations get an integration
         * spec, for every contract kind.
         */
        integrationTests: z.array(implementationLabelSchema).optional()
    } as {
        [K in ImplementationKind]: z.ZodOptional<
            typeof implementationGroupSchema
        >;
    } & {
        integrationTests: z.ZodOptional<
            z.ZodArray<typeof implementationLabelSchema>
        >;
    })
    .strict();
