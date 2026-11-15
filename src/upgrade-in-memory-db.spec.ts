import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import ts from 'typescript';
import { discardPendingChanges, writePendingChanges } from './file-system';
import {
    inMemoryDbService,
    legacyHasId,
    legacyWithIdLookup,
    withIdLookup
} from './in-memory-db';
import { planUpgrade } from './upgrade-steps';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-in-memory-db-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** The generated service of 8.9.0 and earlier. */
const legacyService = inMemoryDbService
    .replace(withIdLookup, legacyWithIdLookup)
    .replace(
        'export class InMemoryDbInfrastructureService',
        `${legacyHasId}export class InMemoryDbInfrastructureService`
    );

let sequence = 0;
/** Runs the service source and returns a DB with an `orders` section. */
const load = async (source: string) => {
    const file = path.join(root, `service-${sequence++}.mjs`);
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022
        }
    });
    fs.writeFileSync(
        file,
        `${outputText}
export const db = () => new (class extends InMemoryDbInfrastructureService {
    orders = this.section('ORDERS');
})();
`
    );
    (globalThis as Record<string, unknown>).___SHARED_IN_MEMORY_DB___ =
        undefined;
    return (await import(pathToFileURL(file).href)).db().orders;
};

class OrderId {
    constructor(readonly value: string) {}
    equals(other: OrderId) {
        return this.value === other.value;
    }
}

test('the old withId misses items saved as [id, item]', async () => {
    const orders = await load(legacyService);
    orders.save(['a', { total: 1 }]);
    expect(orders.withId('a')).toBe(null);
});

test('withId finds items saved as [id, item] and as items with an id', async () => {
    const orders = await load(inMemoryDbService);
    orders.save(['a', { total: 1 }]);
    orders.save([new OrderId('b'), { total: 2 }]);
    orders.save({ id: 'c', total: 3 });
    expect(orders.withId('a')).toEqual({ total: 1 });
    expect(orders.withId(new OrderId('b'))).toEqual({ total: 2 });
    expect(orders.withId('c')).toEqual({ id: 'c', total: 3 });
    expect(orders.withId('missing')).toBe(null);

    orders.save(['a', { total: 10 }]);
    expect(orders.withId('a')).toEqual({ total: 10 });
    expect(orders.all()).toHaveLength(3);
    orders.deleteById(new OrderId('b'));
    expect(orders.withId(new OrderId('b'))).toBe(null);
});

let project: string;
const servicePath = () =>
    path.join(
        project,
        'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
    );
const current = { project: { rootFolder: 'src' } };
beforeEach(() => {
    project = path.join(root, `project-${sequence++}`);
    fs.mkdirSync(path.dirname(servicePath()), { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), '{}');
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});

test('df-upgrade fixes withId of a generated service, keeping its sections', async () => {
    const sections = legacyService.replace(
        /\n}\n$/,
        "\n    orders = this.section<Order>('ORDERS');\n}\n"
    );
    fs.writeFileSync(servicePath(), sections);
    const { planned } = await planUpgrade(current);
    expect(planned.map(({ step, changes }) => [step.id, changes])).toEqual([
        [
            'in-memory-db-with-id',
            [
                'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts: withId looks up the id saved with the item'
            ]
        ]
    ]);
    writePendingChanges();
    expect(fs.readFileSync(servicePath(), 'utf8')).toBe(
        inMemoryDbService.replace(
            /\n}\n$/,
            "\n    orders = this.section<Order>('ORDERS');\n}\n"
        )
    );
    expect((await planUpgrade(current)).planned).toEqual([]);
});

test('df-upgrade keeps hasId when other code uses it', async () => {
    const used = `${legacyService}\nexport const withIds = (xs: unknown[]) => xs.filter(hasId);\n`;
    fs.writeFileSync(servicePath(), used);
    await planUpgrade(current);
    writePendingChanges();
    const fixed = fs.readFileSync(servicePath(), 'utf8');
    expect(fixed).toContain(withIdLookup);
    expect(fixed).toContain(legacyHasId);
});

test('a withId changed by hand is left as it is', async () => {
    fs.writeFileSync(
        servicePath(),
        legacyService.replace(legacyWithIdLookup, '            withId: own,\n')
    );
    expect((await planUpgrade(current)).planned).toEqual([]);
});
