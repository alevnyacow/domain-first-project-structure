import path from 'node:path';
import { File } from './file-system';
import { legacyHasId, legacyWithIdLookup, withIdLookup } from './in-memory-db';
import { ProjectRoot } from './project-root';
import type { UpgradeContext, UpgradeStep } from './upgrade-steps';

const serviceFile = ({ config }: UpgradeContext) => {
    const project = config.project;
    const rootFolder =
        typeof project === 'object' && project !== null
            ? (project as Record<string, unknown>).rootFolder
            : undefined;
    if (typeof rootFolder !== 'string') return undefined;
    const file = new File(
        path.join(
            new ProjectRoot().path,
            rootFolder,
            'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
        )
    );
    return file.exists ? file : undefined;
};

/**
 * Fixes `withId` of the generated in-memory DB: items saved as an
 * `[id, item]` tuple have no `id` of their own and were never found.
 * Only the untouched generated lookup is replaced.
 */
export const inMemoryDbWithIdStep: UpgradeStep = {
    id: 'in-memory-db-with-id',
    kind: 'optional',
    title: 'Let withId of the in-memory DB find items saved as [id, item]',
    detect: (context) =>
        serviceFile(context)?.data.includes(legacyWithIdLookup) ?? false,
    plan: (context) => [
        `${path
            .relative(new ProjectRoot().path, serviceFile(context)!.path)
            .split(path.sep)
            .join('/')}: withId looks up the id saved with the item`
    ],
    apply: (context) => {
        const file = serviceFile(context)!;
        const fixed = file.data.replace(legacyWithIdLookup, withIdLookup);
        // The helper was used by the old lookup only.
        file.update(
            /\bhasId\b/.test(fixed.replace(legacyHasId, ''))
                ? fixed
                : fixed.replace(legacyHasId, '')
        );
    }
};
