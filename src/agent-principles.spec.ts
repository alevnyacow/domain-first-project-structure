import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, test } from '@rstest/core';
import { applyPrinciples, principlesState } from './agent-principles';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'df-principles-'));
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

let root: string;
let sequence = 0;
beforeEach(() => {
    root = path.join(base, String(sequence++));
    fs.mkdirSync(root);
});
const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
};
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file: string) => fs.existsSync(path.join(root, file));

const block = (text: string) =>
    `<!-- df-principles:start -->\n${text}\n<!-- df-principles:end -->`;

describe('Claude Code', () => {
    test('creates CLAUDE.md with the import and copies the text', () => {
        expect(applyPrinciples(root, 'claude', 'Rules', true)).toBe('added');
        expect(read('CLAUDE.md')).toBe('@.claude/df-principles.md\n');
        expect(read('.claude/df-principles.md')).toBe('Rules');
        expect(principlesState(root, 'claude')).toBe('connected');
    });

    test('keeps the text of an existing CLAUDE.md', () => {
        write('CLAUDE.md', '# Mine\n\nMy rule\n');
        applyPrinciples(root, 'claude', 'Rules', true);
        expect(read('CLAUDE.md')).toBe(
            '# Mine\n\nMy rule\n\n@.claude/df-principles.md\n'
        );
    });

    test('adds the import once and refreshes the copy', () => {
        applyPrinciples(root, 'claude', 'Old', true);
        expect(applyPrinciples(root, 'claude', 'New', true)).toBe('updated');
        expect(read('CLAUDE.md')).toBe('@.claude/df-principles.md\n');
        expect(read('.claude/df-principles.md')).toBe('New');
    });

    test('refreshes without install when connected', () => {
        applyPrinciples(root, 'claude', 'Old', true);
        expect(applyPrinciples(root, 'claude', 'New', false)).toBe('updated');
        expect(read('.claude/df-principles.md')).toBe('New');
    });

    test('recognizes the import with Windows line endings', () => {
        write('CLAUDE.md', '# Mine\r\n@.claude/df-principles.md\r\n');
        expect(principlesState(root, 'claude')).toBe('connected');
    });

    test('touches nothing without install when not connected', () => {
        write('CLAUDE.md', '# Mine\n');
        expect(applyPrinciples(root, 'claude', 'Rules', false)).toBe('skipped');
        expect(read('CLAUDE.md')).toBe('# Mine\n');
        expect(exists('.claude/df-principles.md')).toBe(false);
    });

    test('uses .claude/CLAUDE.md with its own path when only it exists', () => {
        write('.claude/CLAUDE.md', '# Mine\n');
        expect(applyPrinciples(root, 'claude', 'Rules', true)).toBe('added');
        expect(read('.claude/CLAUDE.md')).toBe('# Mine\n\n@df-principles.md\n');
        expect(exists('CLAUDE.md')).toBe(false);
        expect(principlesState(root, 'claude')).toBe('connected');
    });

    test('prefers CLAUDE.md when both exist', () => {
        write('CLAUDE.md', '# Root\n');
        write('.claude/CLAUDE.md', '# Nested\n');
        applyPrinciples(root, 'claude', 'Rules', true);
        expect(read('CLAUDE.md')).toContain('@.claude/df-principles.md');
        expect(read('.claude/CLAUDE.md')).toBe('# Nested\n');
    });
});

describe('Codex', () => {
    test('creates AGENTS.md with the block', () => {
        expect(applyPrinciples(root, 'codex', 'Rules\n', true)).toBe('added');
        expect(read('AGENTS.md')).toBe(`${block('Rules')}\n`);
        expect(principlesState(root, 'codex')).toBe('connected');
    });

    test('replaces only the block', () => {
        write('AGENTS.md', `# Before\n\n${block('Old')}\n\n# After\n`);
        expect(applyPrinciples(root, 'codex', 'New', false)).toBe('updated');
        expect(read('AGENTS.md')).toBe(
            `# Before\n\n${block('New')}\n\n# After\n`
        );
    });

    test('keeps a dollar sign of the text as it is', () => {
        applyPrinciples(root, 'codex', 'Use $& and $1', true);
        applyPrinciples(root, 'codex', 'Use $& and $2', false);
        expect(read('AGENTS.md')).toBe(`${block('Use $& and $2')}\n`);
    });

    test('appends the block to an existing AGENTS.md', () => {
        write('AGENTS.md', '# Mine\n');
        applyPrinciples(root, 'codex', 'Rules', true);
        expect(read('AGENTS.md')).toBe(`# Mine\n\n${block('Rules')}\n`);
    });

    test('touches nothing without install when not connected', () => {
        expect(applyPrinciples(root, 'codex', 'Rules', false)).toBe('skipped');
        expect(exists('AGENTS.md')).toBe(false);
    });

    test.each([
        ['only a start', '<!-- df-principles:start -->\nText\n'],
        ['only an end', 'Text\n<!-- df-principles:end -->\n'],
        [
            'reversed markers',
            '<!-- df-principles:end -->\nText\n<!-- df-principles:start -->\n'
        ],
        ['two blocks', `${block('A')}\n${block('B')}\n`]
    ])('leaves a file with %s alone', (_title, content) => {
        write('AGENTS.md', content);
        expect(principlesState(root, 'codex')).toBe('broken');
        expect(applyPrinciples(root, 'codex', 'Rules', true)).toBe('conflict');
        expect(read('AGENTS.md')).toBe(content);
    });
});
