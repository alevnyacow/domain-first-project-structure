import { UnknownFormatNaming } from './unknown-format-naming';

const splitSegments = (rawSource: string) =>
    rawSource
        .split(/[\\/]/)
        .map((segment) => segment.trim())
        .filter((segment) => !!segment);

/**
 * A name with optional folders before it, e.g. `admin/panel/users`.
 * The last segment names the files; the whole path names the code
 * (`AdminPanelUsers`), so equal names in different folders don't clash.
 */
export class NestedName {
    readonly folders: string[];
    readonly fileName: string;
    readonly ClassName: string;
    /**
     * Each segment as a class name, e.g. `['Admin', 'Panel', 'Users']`.
     */
    readonly classNameSegments: string[];

    constructor(rawSource: string) {
        const segments = splitSegments(rawSource);

        this.folders = segments.slice(0, -1);
        this.fileName = new UnknownFormatNaming(segments.at(-1) ?? '').fileName;
        this.classNameSegments = segments.map(
            (segment) => new UnknownFormatNaming(segment).ClassName
        );
        this.ClassName = this.classNameSegments.join('');
    }

    /**
     * `.` and `..` would place files outside the target folder.
     */
    static validate = (rawSource: string) => {
        const segments = splitSegments(rawSource);

        if (!segments.length) {
            return 'Name is required';
        }

        if (segments.some((segment) => segment === '.' || segment === '..')) {
            return 'Use a path relative to the folder, without "." or ".."';
        }

        return true;
    };
}
