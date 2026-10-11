import path from 'node:path';
import { File } from '../file-system';

export const addGitignoreEntry = (root: string, entry: string) => {
    const gitignore = new File(path.join(root, '.gitignore'));
    const ignored = gitignore.exists ? gitignore.data : '';
    if (ignored.split(/\r?\n/).includes(entry)) return;
    const newline = ignored.includes('\r\n') ? '\r\n' : '\n';
    gitignore.update(
        `${ignored}${ignored && !ignored.endsWith('\n') ? newline : ''}${entry}${newline}`
    );
};
