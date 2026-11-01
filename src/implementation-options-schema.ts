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
export const implementationOptionsSchema = z.partialRecord(
    z.enum(implementationKinds),
    z
        .object({
            primary: z.array(implementationLabelSchema).default([]),
            test: z.array(implementationLabelSchema).default([])
        })
        .strict()
);
