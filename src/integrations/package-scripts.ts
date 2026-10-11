import { input, select } from '@inquirer/prompts';
import type { File } from '../file-system';

export const addPackageScripts = async (
    file: File,
    additions: Record<string, string>
) => {
    const original = file.data;
    const manifest = JSON.parse(original);
    const scripts: Record<string, string> = { ...manifest.scripts };
    const selected: Record<string, string> = {};

    for (const [name, command] of Object.entries(additions)) {
        let target = name;
        if (Object.hasOwn(scripts, name) && scripts[name] !== command) {
            const action = await select({
                message: `Script "${name}" already exists: ${scripts[name]}`,
                choices: ['Keep existing', 'Replace', 'Use another name']
            });
            if (action === 'Keep existing') continue;
            if (action === 'Use another name') {
                target = await input({
                    message: 'New script name:',
                    validate: (value) =>
                        /^[a-zA-Z0-9:_-]+$/.test(value) &&
                        !Object.hasOwn(scripts, value) &&
                        !Object.hasOwn(additions, value)
                            ? true
                            : 'Enter an unused script name (letters, numbers, :, _, -).'
                });
            }
        }
        scripts[target] = command;
        selected[name] = target;
    }

    if (JSON.stringify(manifest.scripts) !== JSON.stringify(scripts)) {
        manifest.scripts = scripts;
        const indent = original.match(/\n([\t ]+)"/)?.[1] ?? '  ';
        file.update(`${JSON.stringify(manifest, null, indent)}\n`);
    }
    return selected;
};
