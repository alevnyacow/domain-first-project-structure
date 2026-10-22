import { describe, expect, test } from '@rstest/core';
import {
    defaultDependencies,
    dependencyRulesSchema,
    fileModuleKind,
    resolveDependencyRules
} from './dependency-rules';

describe('resolveDependencyRules', () => {
    test('keeps the defaults without config', () => {
        const rules = resolveDependencyRules();

        expect([...rules['use-cases']]).toEqual(
            defaultDependencies['use-cases']
        );
    });

    test('adds and removes kinds, or replaces the list', () => {
        const rules = resolveDependencyRules({
            'use-cases': { add: ['use-cases'], remove: ['repositories'] },
            queries: ['repositories']
        });

        expect(rules['use-cases'].has('use-cases')).toBe(true);
        expect(rules['use-cases'].has('repositories')).toBe(false);
        expect(rules['use-cases'].has('application-ports')).toBe(true);
        expect([...rules.queries]).toEqual(['repositories']);
    });

    test('rejects unknown kinds', () => {
        expect(
            dependencyRulesSchema.safeParse({ 'use-case': ['use-cases'] })
                .success
        ).toBe(false);
        expect(
            dependencyRulesSchema.safeParse({ 'use-cases': { add: ['ports'] } })
                .success
        ).toBe(false);
    });
});

describe('fileModuleKind', () => {
    test('finds the kind of module files', () => {
        expect(fileModuleKind(['application', 'use-cases', 'pay.ts'])).toBe(
            'use-cases'
        );
        expect(fileModuleKind(['application', 'queries', 'x.ts'])).toBe(
            'queries'
        );
        expect(
            fileModuleKind(['infrastructure', 'commands', 'prisma', 'x.ts'])
        ).toBe('commands');
        expect(
            fileModuleKind([
                'domain',
                'aggregates',
                'order',
                'order-repository.ts'
            ])
        ).toBe('repositories');
        expect(
            fileModuleKind([
                'infrastructure',
                'application-adapters',
                'api',
                'x.ts'
            ])
        ).toBe('application-ports');
    });

    test('leaves out other files and barrels', () => {
        expect(
            fileModuleKind(['domain', 'aggregates', 'order', 'order.ts'])
        ).toBeUndefined();
        expect(
            fileModuleKind(['domain', 'errors', 'index.ts'])
        ).toBeUndefined();
        expect(
            fileModuleKind(['application', 'use-cases', 'index.ts'])
        ).toBeUndefined();
    });
});
