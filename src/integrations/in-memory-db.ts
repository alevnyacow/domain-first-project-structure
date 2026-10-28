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
    if (!config.withInMemoryDb) {
        ConfigFile.write({ ...config, withInMemoryDb: true });
    }
    withoutOverwrites(() =>
        scaffoldInMemoryDb(
            new Folder(new ProjectRoot().path).subitem([
                config.rootFolder,
                'shared-kernel'
            ])
        )
    );
    return [];
};

export const inMemoryDbApplied = () =>
    Boolean(ConfigFile.Instance.data.withInMemoryDb) && inMemoryDbScaffolded();
