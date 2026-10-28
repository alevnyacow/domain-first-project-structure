import { styleText } from 'node:util';

const installCommand =
    /^\s*npm (?:i|install)((?:\s+(?:--save-dev|-D))?)\s+(.+)$/;

/**
 * Collects the packages of all install commands into one command for
 * dependencies and one for dev dependencies. A package wanted both ways
 * is installed as a dependency. Other commands follow, since they may
 * need the installed packages.
 */
export const mergeInstallCommands = (commands: string[]) => {
    const runtime = new Set<string>();
    const development = new Set<string>();
    const rest: string[] = [];
    for (const command of commands) {
        const match = installCommand.exec(command);
        if (!match) {
            rest.push(command);
            continue;
        }
        for (const name of match[2].trim().split(/\s+/)) {
            (match[1] ? development : runtime).add(name);
        }
    }
    const devOnly = [...development].filter((name) => !runtime.has(name));
    return [
        ...(runtime.size ? [`npm install ${[...runtime].join(' ')}`] : []),
        ...(devOnly.length
            ? [`npm install --save-dev ${devOnly.join(' ')}`]
            : []),
        ...rest
    ];
};

/**
 * Prints the steps left after a use case: one installation command to
 * copy, then additional information.
 */
export const printNextSteps = (nextSteps: string[]) => {
    const isCommand = (line: string) =>
        /^\s*(?:npm (?:i|install)|npx playwright install)\b/.test(line);
    const commands = mergeInstallCommands(nextSteps.filter(isCommand));
    const notes = nextSteps.filter((line) => !isCommand(line));
    const sections = [];
    if (commands.length) {
        sections.push(
            [
                'Run this command to install the required dependencies:',
                styleText(['bold', 'cyan'], commands.join(' && '))
            ].join('\n')
        );
    }
    if (notes.length) {
        sections.push(
            [
                'Additional information:',
                ...notes.map((line) =>
                    line.replace(
                        /^(\s*Add )(!\S+)/,
                        (_, prefix, path) =>
                            prefix + styleText(['bold', 'cyan'], path)
                    )
                )
            ].join('\n')
        );
    }
    if (sections.length) console.log(sections.join('\n\n'));
};
