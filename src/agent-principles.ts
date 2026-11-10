import fs from 'node:fs';
import path from 'node:path';

export type PrinciplesAgent = 'claude' | 'codex';
export type PrinciplesState = 'connected' | 'absent' | 'broken';
export type PrinciplesResult = 'added' | 'updated' | 'skipped' | 'conflict';

const copyName = 'df-principles.md';
const blockStart = '<!-- df-principles:start -->';
const blockEnd = '<!-- df-principles:end -->';

const read = (file: string) =>
    fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;

const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
};

/** Keeps what the user wrote and adds a paragraph after it. */
const withParagraph = (content: string | undefined, paragraph: string) =>
    content?.trim()
        ? `${content.trimEnd()}\n\n${paragraph}\n`
        : `${paragraph}\n`;

/**
 * Claude Code resolves an import relative to the file that holds it, so
 * each place of CLAUDE.md has its own line.
 */
const claudeEntries = (root: string) => [
    {
        file: path.join(root, 'CLAUDE.md'),
        line: `@.claude/${copyName}`
    },
    {
        file: path.join(root, '.claude', 'CLAUDE.md'),
        line: `@${copyName}`
    }
];

const connectedClaudeEntry = (root: string) =>
    claudeEntries(root).find(({ file, line }) =>
        read(file)
            ?.split('\n')
            .some((candidate) => candidate.trim() === line)
    );

const occurrences = (content: string, marker: string) =>
    content.split(marker).length - 1;

const blockState = (content = ''): PrinciplesState => {
    const starts = occurrences(content, blockStart);
    const ends = occurrences(content, blockEnd);
    if (!starts && !ends) return 'absent';
    return starts === 1 &&
        ends === 1 &&
        content.indexOf(blockStart) < content.indexOf(blockEnd)
        ? 'connected'
        : 'broken';
};

const applyToClaude = (
    root: string,
    text: string,
    install: boolean
): PrinciplesResult => {
    const copy = path.join(root, '.claude', copyName);
    if (connectedClaudeEntry(root)) {
        write(copy, text);
        return 'updated';
    }
    if (!install) return 'skipped';
    const [rootEntry, nestedEntry] = claudeEntries(root);
    const entry =
        !fs.existsSync(rootEntry.file) && fs.existsSync(nestedEntry.file)
            ? nestedEntry
            : rootEntry;
    write(copy, text);
    write(entry.file, withParagraph(read(entry.file), entry.line));
    return 'added';
};

/** Codex has no imports in AGENTS.md: the text itself goes there. */
const applyToCodex = (
    root: string,
    text: string,
    install: boolean
): PrinciplesResult => {
    const file = path.join(root, 'AGENTS.md');
    const content = read(file);
    const state = blockState(content);
    if (state === 'broken') return 'conflict';
    const block = `${blockStart}\n${text.trim()}\n${blockEnd}`;
    if (state === 'connected' && content !== undefined) {
        write(
            file,
            content.slice(0, content.indexOf(blockStart)) +
                block +
                content.slice(content.indexOf(blockEnd) + blockEnd.length)
        );
        return 'updated';
    }
    if (!install) return 'skipped';
    write(file, withParagraph(content, block));
    return 'added';
};

export const principlesState = (
    root: string,
    agent: PrinciplesAgent
): PrinciplesState => {
    if (agent === 'codex')
        return blockState(read(path.join(root, 'AGENTS.md')));
    return connectedClaudeEntry(root) ? 'connected' : 'absent';
};

/**
 * Refreshes connected principles. Connects them only with `install`, so
 * a project that removed them stays without them.
 */
export const applyPrinciples = (
    root: string,
    agent: PrinciplesAgent,
    text: string,
    install: boolean
): PrinciplesResult =>
    (agent === 'codex' ? applyToCodex : applyToClaude)(root, text, install);
