import fs from 'node:fs';
import path from 'node:path';

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
        fs.mkdirSync(this.path, { recursive: true });
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
    get data() {
        if (!this.exists) {
            throw new Error('File does not exist');
        }
        return fs.readFileSync(this.path, 'utf-8');
    }

    set data(content: string) {
        fs.writeFileSync(this.path, content);
    }

    addLine = (newLine: string, separator = '\n') => {
        let content = '';

        try {
            content = fs.readFileSync(this.path, 'utf8');
        } catch {}

        fs.writeFileSync(
            this.path,
            [content.trim(), newLine.trim()].filter((x) => !!x).join(separator),
            'utf8'
        );
    };
}
