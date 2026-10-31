import { input, select } from '@inquirer/prompts';
import { kebabName } from '../backend-module-move';
import { crossContextImplementation } from '../context-dependencies';
import {
    type ImplementationKind,
    type ImplementationPurpose,
    rememberImplementation,
    savedImplementations
} from '../implementation-choices';
import { systemImplementationChoices } from '../system-implementations';

export const enterImplementationTypeOnce = Symbol(
    'enter-implementation-type-once'
);
export const implementationTypeEntryChoices = [
    { name: 'Enter implementation type and save for future use', value: null },
    {
        name: 'Enter implementation type for this run only',
        value: enterImplementationTypeOnce
    }
] as const;

export type ImplementationTypeSelection = {
    label: string;
    saveForFutureUse: boolean;
};

/** Saved choices, active system implementations, and explicit manual entry. */
export const promptImplementationType = async (
    message: string,
    kind: ImplementationKind,
    {
        existing = [],
        purpose = 'primary',
        crossContext = false,
        remember = true
    }: {
        existing?: string[];
        purpose?: ImplementationPurpose | 'all';
        crossContext?: boolean;
        remember?: boolean;
    } = {}
): Promise<ImplementationTypeSelection> => {
    const roles =
        purpose === 'all' ? (['primary', 'test'] as const) : [purpose];
    const saved = [
        ...new Set(roles.flatMap((role) => savedImplementations(kind, role)))
    ].filter(
        (label) =>
            label !== crossContextImplementation ||
            (kind === 'ports' && crossContext)
    );
    const allowCrossContext = kind === 'ports' && crossContext;
    const system = systemImplementationChoices(kind, crossContext);
    const choices = saved.map(
        (label) =>
            system.find(({ value }) => value === label) ?? {
                name: label,
                value: label
            }
    );
    for (const choice of system) {
        if (!choices.some(({ value }) => value === choice.value))
            choices.push(choice);
    }
    const defaultType = saved.find((label) => !existing.includes(label));
    const preferred =
        choices.find(
            ({ value }) => value === defaultType && !existing.includes(value)
        ) ?? choices.find(({ value }) => !existing.includes(value));
    const type = await select<
        string | null | typeof enterImplementationTypeOnce
    >({
        message,
        choices: [
            ...choices.map((choice) => ({
                ...choice,
                disabled: existing.includes(choice.value)
            })),
            ...implementationTypeEntryChoices
        ],
        default: preferred?.value ?? null
    });
    if (typeof type === 'string')
        return { label: type, saveForFutureUse: true };
    const saveForFutureUse = type !== enterImplementationTypeOnce;
    const label = (
        await input({
            message,
            default: defaultType ?? '',
            validate: (value) => {
                const label = value.trim();
                if (!allowCrossContext && label === crossContextImplementation)
                    return 'Cross-context implementations require an application port with a neighboring bounded context.';
                if (!kebabName.test(label))
                    return 'Use lowercase kebab-case, e.g. prisma or in-memory.';
                return existing.includes(label)
                    ? `The ${label} implementation already exists.`
                    : true;
            }
        })
    ).trim();
    if (
        saveForFutureUse &&
        remember &&
        !choices.some(({ value }) => value === label)
    )
        rememberImplementation(
            kind,
            purpose === 'all' ? 'primary' : purpose,
            label
        );
    return { label, saveForFutureUse };
};
