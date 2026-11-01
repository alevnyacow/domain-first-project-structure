import path from 'node:path';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from './file-system';
import {
    answerFor,
    assertAnswersConsumed,
    confirm,
    isNonInteractive,
    RequestError,
    report
} from './interaction';
import { ProjectRoot } from './project-root';

/** Shared commit step for standalone use cases and the CLI. */
export const savePendingChanges = async (): Promise<boolean> => {
    assertAnswersConsumed();
    const overwrittenFiles = filesToOverwrite({
        changedOnly: isNonInteractive()
    });
    if (
        isNonInteractive() &&
        overwrittenFiles.length &&
        !answerFor('overwrite', false)
    ) {
        throw new RequestError(
            'OVERWRITE_REQUIRED',
            'Set overwrite to true to replace existing files.',
            {
                files: overwrittenFiles.map((file) =>
                    path
                        .relative(new ProjectRoot().path, file)
                        .split(path.sep)
                        .join('/')
                )
            }
        );
    }
    if (overwrittenFiles.length) {
        const root = new ProjectRoot().path;
        report('These files already exist and will be overwritten:');
        for (const filePath of overwrittenFiles) {
            report(`  ${path.relative(root, filePath)}`);
        }
        const overwrite = await confirm({
            key: 'overwrite',
            message: 'Overwrite them?',
            default: false
        });
        if (!overwrite) {
            discardPendingChanges();
            report('Cancelled: nothing was written.');
            return false;
        }
    }
    writePendingChanges();
    return true;
};
