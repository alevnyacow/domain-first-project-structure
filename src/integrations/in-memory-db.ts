import { ConfigFile } from '../config-file';
import { Folder, withoutOverwrites } from '../file-system';
import { inMemoryDbScaffolded, scaffoldInMemoryDb } from '../in-memory-db';
import { ProjectRoot } from '../project-root';

/**
 * Turns on `withInMemoryDb` and adds the missing files of the shared
 * in-memory DB, as the current wiring and testing library need them.
 */
export const addInMemoryDb = (): string[] => {
    const config = ConfigFile.Instance.data;
    if (!ConfigFile.backend.withInMemoryDb) {
        ConfigFile.update({
            backend: { ...ConfigFile.backend, withInMemoryDb: true }
        });
    }
    withoutOverwrites(() =>
        scaffoldInMemoryDb(
            new Folder(new ProjectRoot().path).subitem([
                config.project.rootFolder,
                'shared-kernel'
            ])
        )
    );
    return [];
};

export const inMemoryDbApplied = () =>
    Boolean(ConfigFile.Instance.data.backend?.withInMemoryDb) &&
    inMemoryDbScaffolded();
