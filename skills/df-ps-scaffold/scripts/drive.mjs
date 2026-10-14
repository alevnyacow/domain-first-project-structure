#!/usr/bin/env node
/**
 * Drives the interactive `df-ps` CLI with a scripted list of answers and
 * prints the files it created or changed.
 *
 * Usage:
 *   node drive.mjs [--cwd <dir>] [--delay <ms>] <step> [<step> ...]
 *
 * Steps (one per prompt, in the order the CLI asks them):
 *   pick:<label>   select prompt: type the choice label (or a unique prefix) and press Enter
 *   text:<value>   input prompt: type the value and press Enter
 *   default        input prompt: accept the suggested default (press Enter)
 *   yes | no       confirm prompt
 *   toggle:<n,..>  checkbox prompt: toggle 1-based items (headers not counted),
 *                  moving with the arrow keys, then press Enter
 *   none           checkbox prompt: submit with nothing selected
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let cwd = process.cwd();
let delay = 600;
const steps = [];

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd') cwd = path.resolve(args[++i]);
    else if (args[i] === '--delay') delay = Number(args[++i]);
    else steps.push(args[i]);
}

const findProjectRoot = (dir) => {
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error(`No package.json found above ${cwd}`);
};

const projectRoot = findProjectRoot(cwd);

const toKeys = (step) => {
    if (step === 'yes') return ['y\r'];
    if (step === 'no') return ['n\r'];
    if (step === 'default' || step === 'none') return ['\r'];
    if (step.startsWith('text:')) return [`${step.slice(5)}\r`];
    // Select prompts jump to the first choice starting with the typed text.
    if (step.startsWith('pick:')) return [step.slice(5), '\r'];
    if (step.startsWith('toggle:')) {
        const items = step
            .slice(7)
            .split(',')
            .map((n) => n.trim());
        if (!items.every((n) => /^[1-9]\d*$/.test(n))) {
            throw new Error(`Toggle items must be positive numbers: ${step}`);
        }
        // Sent by the main loop, which moves with the arrow keys.
        return [];
    }
    throw new Error(`Unknown step: ${step}`);
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI escapes
const stripAnsi = (text) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

// Fail on malformed steps before the CLI starts writing files.
try {
    steps.forEach(toKeys);
} catch (error) {
    console.error(error.message);
    process.exit(2);
}

const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
const snapshot = () => {
    const result = new Map();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ignored.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else result.set(full, fs.readFileSync(full, 'utf8'));
        }
    };
    walk(projectRoot);
    return result;
};

const localBin = path.join(projectRoot, 'node_modules', '.bin', 'df-ps');
const [command, commandArgs] = fs.existsSync(localBin)
    ? [localBin, []]
    : [
          'npm',
          ['exec', '--yes', '--package=@domain-first/project-structure', '--', 'df-ps']
      ];

const before = snapshot();
const child = spawn(command, commandArgs, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let exited = false;
const exitCode = new Promise((resolve) =>
    child.on('exit', (code) => {
        exited = true;
        resolve(code);
    })
);

// npm exec may need extra time to download the package on first use.
await sleep(fs.existsSync(localBin) ? 1200 : 8000);
let aborted;
const arrowDown = '\x1b[B';

// The latest highlighted choice, without checkbox marks.
const highlightedChoice = () =>
    [...stripAnsi(output).matchAll(/❯\s*([^\n]*)/g)]
        .at(-1)?.[1]
        ?.replace(/^[◯◉]\s*/, '')
        .trim();

for (const step of steps) {
    if (exited) break;
    const keys = toKeys(step);
    if (step.startsWith('toggle:')) {
        // Number keys reach only items 1-9, so walk down from the first
        // item instead. Headers are skipped by the prompt itself.
        const targets = [
            ...new Set(
                step
                    .slice(7)
                    .split(',')
                    .map((n) => Number(n.trim()))
            )
        ].sort((a, b) => a - b);
        let position = 1;
        for (const target of targets) {
            for (; position < target - 1; position++) {
                child.stdin.write(arrowDown);
                await sleep(Math.min(delay, 100));
            }
            if (position < target) {
                // The cursor stays put past the last item, so check the
                // last step down.
                await sleep(delay);
                const before = highlightedChoice();
                child.stdin.write(arrowDown);
                position++;
                await sleep(delay);
                if (highlightedChoice() === before) {
                    aborted = `${step}: item ${target} does not exist; the list ends at "${before ?? '?'}".`;
                    break;
                }
            }
            child.stdin.write(' ');
            await sleep(delay);
        }
        if (aborted) break;
        child.stdin.write('\r');
        await sleep(delay);
        continue;
    }
    if (step.startsWith('pick:')) {
        // Type the label, then make sure the highlighted choice really
        // matches before pressing Enter: a miss would silently keep the
        // previously highlighted choice.
        child.stdin.write(keys[0]);
        await sleep(delay);
        // No re-render happens when the match is already highlighted, so
        // read the latest highlighted line from the whole output.
        const render = stripAnsi(output);
        const highlighted = [...render.matchAll(/❯\s*([^\n]*)/g)]
            .at(-1)?.[1]
            ?.trim();
        const wanted = step.slice(5).toLowerCase();
        if (!highlighted?.toLowerCase().startsWith(wanted)) {
            aborted = `"${step.slice(5)}" does not match the highlighted choice "${highlighted ?? '?'}". A pick label must be a prefix of a choice shown in the menu.`;
            break;
        }
        child.stdin.write(keys[1]);
        await sleep(delay);
        continue;
    }
    for (const key of keys) {
        child.stdin.write(key);
        await sleep(delay);
    }
}
await sleep(delay);
const unansweredPrompt = !exited && !aborted;
if (aborted) child.kill();
child.stdin.end();
const code = await exitCode;

const after = snapshot();
const rel = (p) => path.relative(projectRoot, p);
const created = [...after.keys()].filter((p) => !before.has(p)).map(rel);
const changed = [...after.keys()]
    .filter((p) => before.has(p) && before.get(p) !== after.get(p))
    .map(rel);

const plain = stripAnsi(output);
const answered = [...plain.matchAll(/✔\s*([^\n]*)/g)].map((m) => m[1].trim());

console.log(`project root: ${projectRoot}`);
console.log(`exit code: ${code}`);
if (aborted) {
    console.log(`ABORTED before submitting the answer: ${aborted}`);
}
if (unansweredPrompt) {
    console.log('WARNING: the CLI was still waiting for input after the last step.');
}
console.log('\nanswered prompts:');
for (const line of answered) console.log(`  ${line}`);
console.log('\ncreated:');
for (const file of created) console.log(`  + ${file}`);
console.log('\nchanged:');
for (const file of changed) console.log(`  ~ ${file}`);
if (code !== 0 || unansweredPrompt || aborted) {
    console.log('\nraw output (tail):');
    console.log(plain.split('\n').slice(-15).join('\n'));
    process.exitCode = 1;
}
