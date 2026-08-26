import fs from 'node:fs';
import path from 'node:path';

export class ProjectRoot {
    public readonly path: string;

    constructor() {
        let dir = process.cwd();
        while (dir !== path.parse(dir).root) {
            if (fs.existsSync(path.join(dir, 'package.json'))) {
                this.path = dir;
                return;
            }
            dir = path.dirname(dir);
        }
        throw new Error('No package.json was found');
    }
}
