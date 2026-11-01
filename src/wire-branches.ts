import { ConfigFile } from './config-file';

export const defaultEnvBranches: { names: string[]; test?: string } = {
    names: ['test', 'development', 'production'],
    test: 'test'
};

/**
 * The branches every `envBranchedWire` has: the test one gets the test
 * implementation, the others (`primary`) the primary one.
 */
export const envBranches = () => {
    const configured = ConfigFile.exists
        ? ConfigFile.Instance.data.backend?.envBranches
        : undefined;
    const { names, test } = configured ?? defaultEnvBranches;
    return {
        names,
        test,
        primary: names.filter((name) => name !== test),
        custom: Boolean(configured)
    };
};

/**
 * Whether generators ask for test implementations: not when the wire has
 * custom branches without a test one, since nothing would select them.
 */
export const offersTestImplementation = () => {
    const backend = ConfigFile.exists
        ? ConfigFile.Instance.data.backend
        : undefined;
    return !(
        backend?.domainFirstPackages.includes('@domain-first/wire') &&
        backend.envBranches &&
        backend.envBranches.test === undefined
    );
};

/**
 * The `envBranchedWire({...})` argument: the test branch first, then the
 * others in their configured order.
 */
export const envBranchedWireArgument = (
    testWire: string,
    primaryWire: string
) => {
    const { test, primary } = envBranches();
    return `{\n${[
        ...(test ? [`    ${test}: ${testWire}`] : []),
        ...primary.map((name) => `    ${name}: ${primaryWire}`)
    ].join(',\n')}\n}`;
};

/** `env-branched-wire.ts` of the Shared Kernel for the configured branches. */
export const envBranchedWireSource = () => {
    const { names, custom } = envBranches();
    if (!custom)
        return `import { branchedWire } from '@domain-first/wire'

export const envBranchedWire = branchedWire(() => {
    return process.env.NODE_ENV ?? 'development' as 'test' | 'development' | 'production'
});`;
    return `import { branchedWire } from '@domain-first/wire'

export type EnvBranch = ${names.map((name) => `'${name}'`).join(' | ')}

/**
 * The branch this process runs in. Write how it is selected:
 * until then, this function doesn't compile.
 */
const currentBranch = (): EnvBranch => {
}

export const envBranchedWire = branchedWire(currentBranch)`;
};
