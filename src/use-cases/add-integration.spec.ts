import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { File, writePendingChanges } from '../file-system';
import { addStorybook } from '../integrations';
import { addIntegration } from './add-integration';

rstest.mock('@inquirer/prompts', () => ({
    select: rstest.fn(),
    confirm: rstest.fn()
}));
rstest.mock('../integrations', () => ({
    addStorybook: rstest.fn(),
    addPrisma: rstest.fn(),
    missingDomainFirstPackages: rstest.fn()
}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-integration-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('standalone use case writes files before reporting next steps', async () => {
    const filePath = path.join(root, 'created.ts');
    rstest.mocked(select).mockResolvedValueOnce(0);
    rstest.mocked(addStorybook).mockImplementationOnce(async () => {
        new File(filePath).data = 'created';
        return ['Run npm install'];
    });
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {
        expect(fs.readFileSync(filePath, 'utf8')).toBe('created');
    });
    try {
        await addIntegration();
        expect(log).toHaveBeenCalledWith('Run npm install');
    } finally {
        log.mockRestore();
    }
});

test('cancelled overwrite discards changes and suppresses next steps', async () => {
    const filePath = path.join(root, 'existing.ts');
    fs.writeFileSync(filePath, 'original');
    rstest.mocked(select).mockResolvedValueOnce(0);
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    rstest.mocked(addStorybook).mockImplementationOnce(async () => {
        new File(filePath).data = 'replacement';
        return ['Run npm install'];
    });
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await addIntegration();
        writePendingChanges();
        expect(fs.readFileSync(filePath, 'utf8')).toBe('original');
        expect(log).not.toHaveBeenCalledWith('Run npm install');
    } finally {
        log.mockRestore();
    }
});
