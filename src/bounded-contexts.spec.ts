import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, test } from '@rstest/core';
import {
    boundedContextNames,
    splitContextSegments,
    validateBoundedContextName
} from './bounded-contexts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-contexts-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const folder = (...segments: string[]) =>
    fs.mkdirSync(path.join(root, ...segments), { recursive: true });

folder('blog', 'domain');
folder('drafts');
folder('commerce', 'orders', 'application');
folder('commerce', 'payments');
folder('commerce', 'shipping', 'tracking', 'wiring');

test('contexts are folders with a layer folder or none; other folders group them', () => {
    expect(boundedContextNames(root)).toEqual([
        'blog',
        'commerce/orders',
        'commerce/payments',
        'commerce/shipping/tracking',
        'drafts'
    ]);
    expect(boundedContextNames(path.join(root, 'missing'))).toEqual([]);
});

test('a path below bounded-contexts splits at its first layer folder', () => {
    expect(
        splitContextSegments(['commerce', 'orders', 'domain', 'errors'])
    ).toEqual({ name: 'commerce/orders', segments: ['domain', 'errors'] });
    expect(splitContextSegments(['blog', 'wiring'])).toEqual({
        name: 'blog',
        segments: ['wiring']
    });
    expect(splitContextSegments(['blog', 'notes.md'])).toEqual({
        name: 'blog',
        segments: ['notes.md']
    });
});

test('new names avoid layer folders, nesting in a context and groups', () => {
    const validate = (name: string) => validateBoundedContextName(root, name);
    expect(validate('commerce/returns')).toBe(true);
    expect(validate('marketing/campaigns')).toBe(true);
    expect(validate('blog')).toBe(true);
    expect(validate('')).toBe('Name is required');
    expect(validate('commerce/../x')).toContain('without "." or ".."');
    expect(validate('commerce/wiring')).toContain('is a layer folder');
    expect(validate('blog/comments')).toBe(
        "blog is a bounded context: contexts can't be nested in one"
    );
    expect(validate('commerce')).toContain('groups bounded contexts');
});
