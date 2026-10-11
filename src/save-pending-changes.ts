import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from './file-system';
import { ProjectRoot } from './project-root';

/** Shared commit step for standalone use cases and the CLI. */
export const savePendingChanges = async (): Promise<boolean> => {
    const overwrittenFiles = filesToOverwrite();
    if (overwrittenFiles.length) {
        const root = new ProjectRoot().path;
        console.log('These files already exist and will be overwritten:');
        for (const filePath of overwrittenFiles) {
            console.log(`  ${path.relative(root, filePath)}`);
        }
        const overwrite = await confirm({
            message: 'Overwrite them?',
            default: false
        });
        if (!overwrite) {
            discardPendingChanges();
            console.log('Cancelled: nothing was written.');
            return false;
        }
    }
    writePendingChanges();
    return true;
};
