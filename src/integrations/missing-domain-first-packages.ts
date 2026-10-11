import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';

export const missingDomainFirstPackages = (): string[] => {
    const packages = ConfigFile.Instance.data.domainFirstPackages;
    const manifest = JSON.parse(
        new File(path.join(new ProjectRoot().path, 'package.json')).data
    );
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies
    };
    const missing = [...new Set(packages)].filter(
        (name) => !Object.hasOwn(dependencies, name)
    );

    return missing.length
        ? [
              'Install missing domain-first packages (run from the project package directory):',
              `  npm i ${missing.join(' ')}`
          ]
        : [
              'All configured domain-first packages are already declared in package.json.'
          ];
};
