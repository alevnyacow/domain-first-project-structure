import { AsyncLocalStorage } from 'node:async_hooks';
import {
    checkbox as interactiveCheckbox,
    confirm as interactiveConfirm,
    input as interactiveInput,
    search as interactiveSearch,
    select as interactiveSelect,
    Separator
} from '@inquirer/prompts';

export { Separator };

const isSeparator = (choice: unknown): choice is Separator =>
    (typeof Separator === 'function' && choice instanceof Separator) ||
    (typeof choice === 'object' &&
        choice !== null &&
        (choice as { type?: unknown }).type === 'separator');

export class RequestError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
    }
}

type Interaction = {
    answers: Record<string, unknown>;
    defaults: Record<string, unknown>;
    used: Set<string>;
    messages: string[];
};
const storage = new AsyncLocalStorage<Interaction>();
export const isNonInteractive = () => Boolean(storage.getStore());
export const runWithAnswers = async <T>(
    answers: Record<string, unknown>,
    defaults: Record<string, unknown>,
    run: () => Promise<T>
) =>
    storage.run(
        { answers, defaults, used: new Set(), messages: [] },
        async () => {
            const result = await run();
            const state = storage.getStore()!;
            assertAnswersConsumed();
            return { result, messages: state.messages };
        }
    );
export const assertAnswersConsumed = () => {
    const state = storage.getStore();
    if (!state) return;
    const unused = Object.keys(state.answers).filter(
        (key) => !state.used.has(key)
    );
    if (unused.length)
        throw new RequestError(
            'UNUSED_PARAMETERS',
            'Some parameters do not apply to this operation.',
            { fields: unused }
        );
};
export const answerFor = (key: string, fallback?: unknown): unknown => {
    const state = storage.getStore();
    if (!state) return undefined;
    if (Object.hasOwn(state.answers, key)) {
        state.used.add(key);
        return state.answers[key];
    }
    return Object.hasOwn(state.defaults, key) ? state.defaults[key] : fallback;
};
export const report = (...values: unknown[]) => {
    const state = storage.getStore();
    if (state) state.messages.push(values.map(String).join(' '));
    else console.log(...values);
};
const requireKey = (key?: string) => {
    if (!key)
        throw new RequestError(
            'UNSUPPORTED_PROMPT',
            'This operation needs an answer that is not supported in non-interactive mode.'
        );
    return key;
};
const missing = (key: string) =>
    new RequestError('MISSING_PARAMETER', `Provide ${key}.`, { field: key });

export const input = async (
    config: Parameters<typeof interactiveInput>[0] & { key?: string }
): Promise<string> => {
    const { key, ...interactive } = config;
    if (!isNonInteractive()) return interactiveInput(interactive);
    const field = requireKey(key);
    const value = answerFor(field, config.default);
    if (typeof value !== 'string') throw missing(field);
    const valid = await config.validate?.(value);
    if (valid !== undefined && valid !== true)
        throw new RequestError(
            'INVALID_PARAMETER',
            typeof valid === 'string' ? valid : `Invalid ${field}.`,
            { field }
        );
    return value;
};

export const confirm = async (
    config: Parameters<typeof interactiveConfirm>[0] & {
        key?: string;
        requestRequired?: boolean;
    }
): Promise<boolean> => {
    const { key, requestRequired, ...interactive } = config;
    if (!isNonInteractive()) return interactiveConfirm(interactive);
    const field = requireKey(key);
    const value = answerFor(
        field,
        requestRequired ? undefined : (config.default ?? false)
    );
    if (value === undefined) throw missing(field);
    if (typeof value !== 'boolean')
        throw new RequestError(
            'INVALID_PARAMETER',
            `${field} must be a boolean.`,
            { field }
        );
    return value;
};

type Choice<T> = {
    value: T;
    name?: string;
    disabled?: boolean | string;
    checked?: boolean;
};
type SelectConfig<T> = {
    message: string;
    key?: string;
    choices: readonly (T | Choice<T> | Separator)[];
    default?: NoInfer<T>;
    pageSize?: number;
    loop?: boolean;
    id?: (value: T) => string;
};
const choicesOf = <T>(config: SelectConfig<T>): Choice<T>[] =>
    config.choices
        .filter((choice) => !isSeparator(choice))
        .map((choice) =>
            typeof choice === 'object' && choice !== null && 'value' in choice
                ? (choice as Choice<T>)
                : { value: choice as T }
        );
const choiceId = <T>(choice: Choice<T>, id?: (value: T) => string) =>
    id?.(choice.value) ?? choice.value;
const resolveChoice = <T>(
    value: unknown,
    choices: Choice<T>[],
    key: string,
    id?: (value: T) => string
) => {
    const matches = choices.filter(
        (choice) =>
            Object.is(choice.value, value) || choiceId(choice, id) === value
    );
    if (matches.length !== 1 || matches[0].disabled)
        throw new RequestError(
            'INVALID_CHOICE',
            `Invalid or unavailable choice for ${key}.`,
            {
                field: key,
                value,
                choices: choices
                    .filter((choice) => !choice.disabled)
                    .map((choice) => choiceId(choice, id))
            }
        );
    return matches[0].value;
};
/** Longer menus get a search field: typing filters the choices. */
export const searchThreshold = 10;

const choiceLabel = <T>(choice: Choice<T>) =>
    choice.name ?? String(choice.value);

/**
 * The choices whose label contains every typed word, in any case. Labels
 * that start with the typed text come first, and so do their groups, so
 * the highlighted choice is the one a prefix names. A group separator
 * stays only when a choice of its group is left.
 */
export const filterChoices = <T>(
    choices: SelectConfig<T>['choices'],
    term: string | undefined
) => {
    const text = (term ?? '').trim().toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [...choices];
    type Match = { choice: Choice<T>; prefix: boolean };
    const groups: { separator?: Separator; matches: Match[] }[] = [
        { matches: [] }
    ];
    for (const choice of choices) {
        if (isSeparator(choice)) {
            groups.push({ separator: choice, matches: [] });
            continue;
        }
        const normalized =
            typeof choice === 'object' && choice !== null && 'value' in choice
                ? (choice as Choice<T>)
                : { value: choice as T };
        const label = choiceLabel(normalized).toLowerCase();
        if (!words.every((word) => label.includes(word))) continue;
        groups.at(-1)?.matches.push({
            choice: normalized,
            prefix: label.startsWith(text)
        });
    }
    const byPrefix = <X>(items: X[], prefix: (item: X) => boolean) => [
        ...items.filter(prefix),
        ...items.filter((item) => !prefix(item))
    ];
    // Choices before the first separator have no header, so they stay on
    // top: below another group they would look like part of it.
    const [ungrouped, ...grouped] = groups;
    return [
        ungrouped,
        ...byPrefix(
            grouped.filter(({ matches }) => matches.length),
            ({ matches }) => matches.some(({ prefix }) => prefix)
        )
    ].flatMap(({ separator, matches }) => [
        ...(separator ? [separator] : []),
        ...byPrefix(matches, ({ prefix }) => prefix).map(({ choice }) => choice)
    ]);
};

export const select = async <T>(config: SelectConfig<T>): Promise<T> => {
    const { key, id, ...interactive } = config;
    if (!isNonInteractive()) {
        if (choicesOf(config).length <= searchThreshold)
            return interactiveSelect(interactive);
        return interactiveSearch({
            message: `${config.message.trimEnd()} (type to filter)`,
            source: (term) => filterChoices(config.choices, term),
            pageSize: config.pageSize,
            default: config.default
        }) as Promise<T>;
    }
    const field = requireKey(key);
    const value = answerFor(field, config.default);
    if (value === undefined) throw missing(field);
    return resolveChoice(value, choicesOf(config), field, id);
};
export const checkbox = async <T>(
    config: Omit<SelectConfig<T>, 'default'> & { required?: boolean }
): Promise<T[]> => {
    const { key, id, ...interactive } = config;
    if (!isNonInteractive()) return interactiveCheckbox(interactive);
    const field = requireKey(key);
    const choices = choicesOf(config);
    const values = answerFor(
        field,
        choices
            .filter((choice) => choice.checked && !choice.disabled)
            .map((choice) => choice.value)
    );
    if (!Array.isArray(values))
        throw new RequestError(
            'INVALID_PARAMETER',
            `${field} must be an array.`,
            { field }
        );
    const selected = values.map((value) =>
        resolveChoice(value, choices, field, id)
    );
    if (new Set(selected).size !== selected.length)
        throw new RequestError(
            'INVALID_PARAMETER',
            `Duplicate choices for ${field}.`,
            { field }
        );
    if (config.required && !selected.length) throw missing(field);
    return selected;
};
