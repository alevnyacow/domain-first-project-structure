import { styleText } from 'node:util';

/**
 * Prints the steps left after a use case: installation commands first,
 * then additional information.
 */
export const printNextSteps = (nextSteps: string[]) => {
    const isCommand = (line: string) =>
        /^\s*(?:npm (?:i|install)|npx playwright install)\b/.test(line);
    const commands = nextSteps.filter(isCommand);
    const notes = nextSteps.filter((line) => !isCommand(line));
    const sections = [];
    if (commands.length) {
        sections.push(
            [
                'Run these commands to install the required dependencies:',
                ...commands.map((line) => styleText(['bold', 'cyan'], line))
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
