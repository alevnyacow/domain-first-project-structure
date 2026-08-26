import path from 'node:path';
import z from 'zod';
import { File } from './file-system';
import { ProjectRoot } from './project-root';

const configFileName = 'domain-first.project-structure.config.json';

const configSchema = z.object({
    rootFolder: z.string(),
    domainFirstPackages: z.array(
        z.enum([
            '@domain-first/types',
            '@domain-first/errors',
            '@domain-first/handlers',
            '@domain-first/wire',
            '@domain-first/handlers-rest'
        ])
    ),
    defaultPersistenceLayerImplementation: z.string()
});

export class ConfigFile {
    public readonly data: z.infer<typeof configSchema>;

    private constructor() {
        const filePath = ConfigFile.path;
        const file = new File(filePath);
        const configObject = JSON.parse(file.data);
        this.data = configSchema.parse(configObject);
    }

    public static get Instance() {
        return new ConfigFile();
    }

    private static get path() {
        const { path: root } = new ProjectRoot();
        return path.resolve(root, configFileName);
    }

    static get exists() {
        return new File(ConfigFile.path).exists;
    }

    static write = (config: z.infer<typeof configSchema>) => {
        new File(ConfigFile.path).data = JSON.stringify(config, null, '\t');
    };
}
