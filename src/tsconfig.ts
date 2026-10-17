import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * tsconfig is JSON with comments and trailing commas.
 */
export const stripJsonComments = (source: string) =>
    source
        .replace(
            /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
            (_, text) => (text ? text : '')
        )
        .replace(/,(\s*[}\]])/g, '$1');

/**
 * A relative `extends` or a package one, from the folder of the config
 * that extends it.
 */
const resolveExtends = (fromFile: string, target: string) => {
    if (target.startsWith('.') || path.isAbsolute(target)) {
        const resolved = path.resolve(path.dirname(fromFile), target);
        return resolved.endsWith('.json') ? resolved : `${resolved}.json`;
    }
    const require = createRequire(fromFile);
    for (const candidate of [target, `${target}/tsconfig.json`]) {
        try {
            return require.resolve(candidate);
        } catch {}
    }
    return undefined;
};

/**
 * The compiler option as the config sets it, through its `extends`
 * chain: the nearest config that sets it wins. Undefined when no config
 * sets it; null when a config can't be read, so the value is unknown.
 */
export const compilerOption = (
    configFile: string,
    name: string,
    seen = new Set<string>()
): unknown => {
    if (seen.has(configFile) || !fs.existsSync(configFile)) {
        return null;
    }
    seen.add(configFile);

    let config: {
        extends?: string | string[];
        compilerOptions?: Record<string, unknown>;
    };
    try {
        config = JSON.parse(
            stripJsonComments(fs.readFileSync(configFile, 'utf8'))
        );
    } catch {
        return null;
    }
    if (config.compilerOptions && name in config.compilerOptions) {
        return config.compilerOptions[name];
    }

    /**
     * Later configs of an `extends` array override earlier ones.
     */
    const parents = [config.extends ?? []].flat().reverse();
    for (const parent of parents) {
        const parentFile = resolveExtends(configFile, parent);
        const value = parentFile
            ? compilerOption(parentFile, name, seen)
            : null;
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
};
