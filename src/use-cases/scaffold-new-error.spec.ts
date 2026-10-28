import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import { afterAll, beforeEach, expect, rstest, test } from '@rstest/core';
import { Folder, writePendingChanges } from '../file-system';
import { scaffoldNewErrorUseCase } from './scaffold-new-error';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(),
    select: rstest.fn()
}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-errors-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const errorsFolder = (layer: string[]) =>
    path.join(root, 'src', ...layer, 'domain', 'errors');

beforeEach(() => {
    fs.rmSync(path.join(root, 'src'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    fs.writeFileSync(
        path.join(root, 'domain-first.project-structure.config.json'),
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: ['@domain-first/errors'],
            defaultPersistenceLayerImplementation: 'prisma',
            useReact: false
        })
    );
    for (const [layer, namespace, code] of [
        [['bounded-contexts', 'sales'], 'SalesErrors', 'sales'],
        [['shared-kernel'], 'SharedKernelErrors', 'shared-kernel']
    ] as const) {
        fs.mkdirSync(errorsFolder([...layer]), { recursive: true });
        fs.writeFileSync(
            path.join(errorsFolder([...layer]), 'index.ts'),
            `import { errorNamespace } from '@domain-first/errors'\n\nexport const ${namespace} = errorNamespace('${code}')`
        );
    }
    rstest.spyOn(process, 'cwd').mockReturnValue(root);
});

const run = async (layer: string[], action: string, name: string) => {
    rstest.mocked(select).mockResolvedValueOnce(action);
    rstest.mocked(input).mockResolvedValueOnce(name);
    await scaffoldNewErrorUseCase(new Folder(root).subitem(['src', ...layer]));
    writePendingChanges();
};

const read = (layer: string[], file: string) =>
    fs.readFileSync(path.join(errorsFolder(layer), file), 'utf8');

const sales = ['bounded-contexts', 'sales'];
const shared = ['shared-kernel'];

test('a context error is a class named without the context', async () => {
    await run(sales, 'New error without namespace', 'out-of-stock');
    expect(read(sales, 'index.ts')).toContain(
        "\n\nexport class OutOfStock extends SalesErrors.define('out-of-stock') {}"
    );
});

test('a context namespace and its errors put the namespace first', async () => {
    await run(sales, 'New namespace', 'payment');
    expect(read(sales, 'payment.ts')).toBe(
        "import { errorNamespace } from '@domain-first/errors'\n\nexport const PaymentErrors = errorNamespace('sales').subnamespace('payment')"
    );
    await run(sales, 'New error in namespace payment', 'declined');
    expect(read(sales, 'payment.ts')).toContain(
        "\n\nexport class PaymentDeclined extends PaymentErrors.define('declined') {}"
    );
});

test('shared errors end with SharedKernelError', async () => {
    await run(shared, 'New error without namespace', 'timeout');
    expect(read(shared, 'index.ts')).toContain(
        "export class TimeoutSharedKernelError extends SharedKernelErrors.define('timeout') {}"
    );
    await run(shared, 'New namespace', 'payment');
    expect(read(shared, 'payment.ts')).toContain(
        'export const PaymentSharedKernelErrors = errorNamespace'
    );
    await run(shared, 'New error in namespace payment', 'declined');
    expect(read(shared, 'payment.ts')).toContain(
        "export class PaymentDeclinedSharedKernelError extends PaymentSharedKernelErrors.define('declined') {}"
    );
});

test('a namespace file of the older naming keeps its namespace name', async () => {
    fs.writeFileSync(
        path.join(errorsFolder(sales), 'payment.ts'),
        "import { errorNamespace } from '@domain-first/errors'\n\nexport const PaymentSalesErrors = errorNamespace('sales').subnamespace('payment')"
    );
    await run(sales, 'New error in namespace payment', 'declined');
    expect(read(sales, 'payment.ts')).toContain(
        "export class PaymentDeclined extends PaymentSalesErrors.define('declined') {}"
    );
});

test('the first error without a namespace creates the root namespace', async () => {
    fs.rmSync(errorsFolder(sales), { recursive: true, force: true });
    await run(sales, 'New error without namespace', 'out-of-stock');
    expect(read(sales, 'index.ts')).toBe(
        "import { errorNamespace } from '@domain-first/errors'\n\nexport const SalesErrors = errorNamespace('sales')\n\nexport class OutOfStock extends SalesErrors.define('out-of-stock') {}"
    );
});

test('the root namespace goes above re-exports of earlier namespaces', async () => {
    fs.rmSync(errorsFolder(shared), { recursive: true, force: true });
    await run(shared, 'New namespace', 'payment');
    expect(read(shared, 'index.ts')).toBe("export * from './payment'");
    await run(shared, 'New error without namespace', 'timeout');
    expect(read(shared, 'index.ts')).toBe(
        "import { errorNamespace } from '@domain-first/errors'\n\nexport const SharedKernelErrors = errorNamespace('shared-kernel')\n\nexport * from './payment'\n\nexport class TimeoutSharedKernelError extends SharedKernelErrors.define('timeout') {}"
    );
});
