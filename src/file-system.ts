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
/** Target path → source path, moved as is (binary-safe). */
const pendingMoves = new Map<string, { sourcePath: string; stopAt: string }>();
/** Deleted file → the folder where emptied parent folders stop being removed. */
const pendingDeletions = new Map<string, string>();

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

/**
 * Runs a generator that only adds files: its rewrites of files that
 * already exist on disk are dropped, so files edited by the user stay.
 */
export const withoutOverwrites = <T>(generate: () => T): T => {
    const before = new Map(pendingFiles);
    const result = generate();
    for (const [filePath, change] of pendingFiles) {
        if (
            before.get(filePath) === change ||
            !change.replacesFile ||
            !fs.existsSync(filePath)
        ) {
            continue;
        }
        const previous = before.get(filePath);
        if (previous) pendingFiles.set(filePath, previous);
        else pendingFiles.delete(filePath);
    }
    return result;
};

export const discardPendingChanges = () => {
    pendingFolders.clear();
    pendingFiles.clear();
    pendingMoves.clear();
    pendingDeletions.clear();
};

const removeEmptyFolders = (folderPath: string, stopAt: string) => {
    let current = folderPath;
    while (
        current.startsWith(`${stopAt}${path.sep}`) &&
        fs.existsSync(current) &&
        !fs.readdirSync(current).length
    ) {
        fs.rmdirSync(current);
        current = path.dirname(current);
    }
};

export const writePendingChanges = () => {
    for (const folderPath of pendingFolders) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    for (const [filePath, { content }] of pendingFiles) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }

    for (const [targetPath, { sourcePath }] of pendingMoves) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.renameSync(sourcePath, targetPath);
    }

    for (const filePath of pendingDeletions.keys()) {
        fs.rmSync(filePath, { force: true });
    }
    // Emptied folders go only after every file left them
    for (const [filePath, stopAt] of pendingDeletions) {
        removeEmptyFolders(path.dirname(filePath), stopAt);
    }
    for (const { sourcePath, stopAt } of pendingMoves.values()) {
        removeEmptyFolders(path.dirname(sourcePath), stopAt);
    }

    discardPendingChanges();
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
        return (
            pendingFiles.has(this.path) ||
            pendingMoves.has(this.path) ||
            (fs.existsSync(this.path) && !pendingDeletions.has(this.path))
        );
    }

    /**
     * Folders emptied by the deletion are removed too, up to `stopAt`
     * (exclusive), which must contain the file.
     */
    delete = (stopAt: string) => {
        pendingDeletions.set(this.path, stopAt);
    };

    /**
     * Moves the file as is, without reading it, so binary files survive.
     */
    moveTo = (targetPath: string, stopAt: string) => {
        pendingMoves.set(targetPath, { sourcePath: this.path, stopAt });
    };

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

    /**
     * Changes the content without marking a full rewrite, so editing an
     * existing file doesn't ask to overwrite it.
     */
    update = (content: string) => {
        pendingFiles.set(this.path, {
            content,
            replacesFile: pendingFiles.get(this.path)?.replacesFile ?? false
        });
    };

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
