import { AsyncLocalStorage } from 'node:async_hooks';
import {
    checkbox as interactiveCheckbox,
    confirm as interactiveConfirm,
    input as interactiveInput,
    select as interactiveSelect,
    Separator
} from '@inquirer/prompts';

export { Separator };

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
        .filter((choice) => !(choice instanceof Separator))
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
export const select = async <T>(config: SelectConfig<T>): Promise<T> => {
    const { key, id, ...interactive } = config;
    if (!isNonInteractive()) return interactiveSelect(interactive);
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
