import { select as inquirerSelect, search } from '@inquirer/prompts';
import { afterEach, expect, rstest, test } from '@rstest/core';
import {
    filterChoices,
    Separator,
    searchThreshold,
    select
} from './interaction';

rstest.mock('@inquirer/prompts', () => ({
    select: rstest.fn(async () => 'picked'),
    search: rstest.fn(async () => 'searched'),
    Separator: class {
        readonly type = 'separator';
        constructor(readonly separator = '') {}
    }
}));
afterEach(() => {
    rstest.clearAllMocks();
});

const names = (count: number) =>
    Array.from({ length: count }, (_, index) => `module-${index}`);

test('short menus keep the plain select', async () => {
    expect(
        await select({ message: 'Module:', choices: names(searchThreshold) })
    ).toBe('picked');
    expect(search).not.toHaveBeenCalled();
});

test('long menus get a search field with the same default and page size', async () => {
    expect(
        await select({
            message: 'Module:',
            choices: names(searchThreshold + 1),
            default: 'module-3',
            pageSize: 20
        })
    ).toBe('searched');
    expect(inquirerSelect).not.toHaveBeenCalled();
    const config = rstest.mocked(search).mock.calls[0][0] as any;
    expect(config).toMatchObject({
        message: 'Module: (type to filter)',
        default: 'module-3',
        pageSize: 20
    });
    expect(
        config.source('module-1').map(({ value }: { value: string }) => value)
    ).toEqual(['module-1', 'module-10']);
});

test('filtering matches every word in any case and keeps only group headers with matches', () => {
    const queries = new Separator('── Queries');
    const commands = new Separator('── Commands');
    const choices = [
        queries,
        { name: 'OrdersQuery (prisma)', value: 1 },
        { name: 'InvoicesQuery (prisma)', value: 2 },
        commands,
        { name: 'PayCommand (stripe)', value: 3 }
    ];
    expect(filterChoices(choices, 'orders PRISMA')).toEqual([
        queries,
        { name: 'OrdersQuery (prisma)', value: 1 }
    ]);
    expect(filterChoices(choices, 'stripe')).toEqual([
        commands,
        { name: 'PayCommand (stripe)', value: 3 }
    ]);
    expect(filterChoices(choices, '  ')).toEqual(choices);
    expect(filterChoices(choices, 'nothing')).toEqual([]);
});

test('choices starting with the typed text come first, with their group', () => {
    const queries = new Separator('── Queries');
    const services = new Separator('── Services');
    const choices = [
        queries,
        { name: 'OrderLinesQuery', value: 1 },
        { name: 'LinesQuery', value: 2 },
        services,
        { name: 'LinesService', value: 3 }
    ];
    expect(filterChoices(choices, 'lines')).toEqual([
        queries,
        { name: 'LinesQuery', value: 2 },
        { name: 'OrderLinesQuery', value: 1 },
        services,
        { name: 'LinesService', value: 3 }
    ]);
    expect(filterChoices(choices, 'lines serv')).toEqual([
        services,
        { name: 'LinesService', value: 3 }
    ]);
    const ungrouped = [
        { name: 'OrderLinesQuery', value: 1 },
        services,
        { name: 'LinesService', value: 3 }
    ];
    // Choices without a group stay on top, never under another header.
    expect(filterChoices(ungrouped, 'lines')).toEqual([
        { name: 'OrderLinesQuery', value: 1 },
        services,
        { name: 'LinesService', value: 3 }
    ]);
});
