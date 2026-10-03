export class UnknownFormatNaming {
    private readonly camelCase: string;
    private readonly PascalCase: string;

    constructor(private readonly rawSource: string) {
        const source = rawSource.trim();

        if (!source.includes('-')) {
            this.camelCase =
                source.substring(0, 1).toLowerCase() + source.substring(1);
            this.PascalCase =
                source.substring(0, 1).toUpperCase() + source.substring(1);
        }

        /**
         * Empty segments come from empty names (e.g. a skipped test
         * implementation) or repeated hyphens and have no first letter.
         */
        const words = source.split('-').filter((word) => !!word);

        this.camelCase = words
            .map((word, index) =>
                index === 0
                    ? word.toLowerCase()
                    : word[0].toUpperCase() + word.slice(1).toLowerCase()
            )
            .join('');

        this.PascalCase = words
            .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    get fileName() {
        return this.rawSource;
    }

    get variableName() {
        return this.camelCase;
    }

    get ClassName() {
        return this.PascalCase;
    }

    get withSpaces() {
        return this.fileName.replaceAll('-', ' ');
    }
}
