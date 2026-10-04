import fs from 'node:fs';
import path from 'node:path';

/**
 * Generators change files here first and the disk only in
 * `writePendingChanges`, so a whole run can be confirmed or cancelled.
 * `replacesFile` marks a full rewrite (not lines added to a file).
 */
const pendingFiles = new Map<
    string,
    { content: string; replacesFile: boolean }
>();
const pendingFolders = new Set<string>();

/**
 * Existing files a full rewrite would replace, whatever their content.
 */
export const filesToOverwrite = () =>
    [...pendingFiles]
        .filter(
            ([filePath, { replacesFile }]) =>
                replacesFile && fs.existsSync(filePath)
        )
        .map(([filePath]) => filePath);

export const writePendingChanges = () => {
    for (const folderPath of pendingFolders) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    for (const [filePath, { content }] of pendingFiles) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }

    pendingFolders.clear();
    pendingFiles.clear();
};

class FileSystemItem {
    constructor(public readonly path: string) {}

    subitem = (relativePath: string[]): this => {
        return new (this.constructor as any)(
            path.resolve(this.path, ...relativePath)
        );
    };

    get exists() {
        return fs.existsSync(this.path);
    }
}

export class Folder extends FileSystemItem {
    createIfNotExisted = () => {
        pendingFolders.add(this.path);
    };

    get content() {
        if (!this.exists) {
            return { subfolderNames: [], fileNames: [] };
        }
        const content = fs.readdirSync(this.path, { withFileTypes: true });

        return {
            subfolderNames: content
                .filter((x) => x.isDirectory())
                .map((x) => x.name),
            fileNames: content
                .filter((x) => !x.isDirectory())
                .map((x) => path.parse(x.name).name)
        };
    }

    get name() {
        return path.basename(this.path);
    }

    createFile = (name: string, content: string) => {
        this.createIfNotExisted();
        const file = new File(this.path).subitem([name]);
        file.data = content;
        return file;
    };

    file = (name: string) => {
        this.createIfNotExisted();
        const file = new File(this.path).subitem([name]);
        return file;
    };
}

export class File extends FileSystemItem {
    get exists() {
        return pendingFiles.has(this.path) || fs.existsSync(this.path);
    }

    get data() {
        const pendingFile = pendingFiles.get(this.path);
        if (pendingFile) {
            return pendingFile.content;
        }
        if (!this.exists) {
            throw new Error('File does not exist');
        }
        return fs.readFileSync(this.path, 'utf-8');
    }

    set data(content: string) {
        pendingFiles.set(this.path, { content, replacesFile: true });
    }

    addLine = (newLine: string, separator = '\n') => {
        const content = this.exists ? this.data : '';

        pendingFiles.set(this.path, {
            content: [content.trim(), newLine.trim()]
                .filter((x) => !!x)
                .join(separator),
            replacesFile: pendingFiles.get(this.path)?.replacesFile ?? false
        });
    };

    /**
     * Re-running a generator for the same name must not duplicate the line.
     */
    addLineIfMissing = (newLine: string, separator = '\n') => {
        const alreadyAdded =
            this.exists &&
            this.data
                .split('\n')
                .some((line) => line.trim() === newLine.trim());

        if (!alreadyAdded) {
            this.addLine(newLine, separator);
        }
    };
}
