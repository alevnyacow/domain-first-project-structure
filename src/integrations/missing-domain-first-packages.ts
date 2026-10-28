import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';

/**
 * Whether the project's manifest declares `name` in any dependency group.
 */
export const hasDependency = (name: string) => {
    const manifestFile = new File(
        path.join(new ProjectRoot().path, 'package.json')
    );
    if (!manifestFile.exists) return false;
    const manifest = JSON.parse(manifestFile.data);
    return [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.optionalDependencies
    ].some((dependencies) => dependencies && Object.hasOwn(dependencies, name));
};

/**
 * The install command for the packages the manifest doesn't declare.
 */
export const missingPackages = (packages: string[]): string[] => {
    const missing = [...new Set(packages)].filter(
        (name) => !hasDependency(name)
    );
    return missing.length ? [`npm i ${missing.join(' ')}`] : [];
};

export const missingDomainFirstPackages = (): string[] =>
    missingPackages(ConfigFile.Instance.data.domainFirstPackages);
