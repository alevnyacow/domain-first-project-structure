import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { discardPendingChanges, writePendingChanges } from './file-system';
import {
    findReactModules,
    moveReactModule,
    validateMove
} from './react-module-move';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-move-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => discardPendingChanges());

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe]);

let sequence = 0;
const setup = () => {
    const project = path.join(root, String(sequence++));
    const files: Record<string, string | Buffer> = {
        // Comments and trailing commas are allowed in tsconfig
        'tsconfig.json': `{
    "compilerOptions": {
        // aliases
        "paths": { "@/*": ["./*"] },
    }
}`,
        'presentation/react/ui-kit/button.tsx':
            'export const Button = () => null',
        'presentation/react/widgets/users/index.ts':
            "export * from './users-widget'",
        'presentation/react/widgets/users/types.ts': `export type UsersWidgetProps = {}
export type UsersWidgetUIProps = {}`,
        'presentation/react/widgets/users/users-widget.tsx': `import { Button } from '../../ui-kit/button'
import { Card } from '@/presentation/react/ui-kit/card'
import type { UsersWidgetProps } from './types'
import { UsersWidgetUI } from './ui/users-widget-ui'
import { useUsersUIModel } from './hooks/use-users-ui-model'

export const UsersWidget = (props: UsersWidgetProps) => {
    const uiModel = useUsersUIModel(props)
    return <UsersWidgetUI {...uiModel} />
}`,
        'presentation/react/widgets/users/ui/users-widget-ui.tsx': `import styles from './users-widget-ui.module.css'
import type { UsersWidgetUIProps } from '../types'

export const UsersWidgetUI = (props: UsersWidgetUIProps) => <div className={styles.root} />`,
        'presentation/react/widgets/users/ui/users-widget-ui.module.css':
            '.users-widget { display: grid; }',
        'presentation/react/widgets/users/ui/users-widget-ui.stories.tsx': `import { UsersWidgetUI } from './users-widget-ui'

const meta = { title: 'Widgets/Users', component: UsersWidgetUI }`,
        'presentation/react/widgets/users/ui/logo.png': png,
        'presentation/react/widgets/users/hooks/use-users-ui-model.ts': `import type { UsersWidgetProps, UsersWidgetUIProps } from '../types'

export const useUsersUIModel = (props: UsersWidgetProps): UsersWidgetUIProps => ({})`,
        'presentation/react/pages/users-page.tsx': `import styles from './users-page.module.css'
import { UsersWidget } from '../widgets/users'

const UsersListTitle = 'Users'

export const UsersPage = () => <UsersWidget />`,
        'presentation/react/pages/users-page.module.css': '.page {}',
        'app/page.tsx': `import { UsersPage } from '@/presentation/react/pages/users-page'

export default () => <UsersPage />`
    };
    for (const [file, content] of Object.entries(files)) {
        const filePath = path.join(project, file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
    }
    const reactFolder = path.join(project, 'presentation/react');
    const read = (file: string) =>
        fs.readFileSync(path.join(project, file), 'utf8');
    const exists = (file: string) => fs.existsSync(path.join(project, file));
    return { project, reactFolder, read, exists };
};

describe('findReactModules', () => {
    test('finds widgets and pages with their names', () => {
        const { reactFolder } = setup();
        const nested = path.join(reactFolder, 'pages/admin');
        fs.mkdirSync(nested);
        fs.writeFileSync(
            path.join(nested, 'admin-panel-page.tsx'),
            'export const AdminPanelPage = () => null'
        );

        expect(findReactModules(reactFolder, 'widget')).toEqual([
            {
                kind: 'widget',
                name: 'users',
                path: path.join(reactFolder, 'widgets/users'),
                fileBase: 'users',
                ClassName: 'Users'
            }
        ]);
        expect(
            findReactModules(reactFolder, 'page').map(
                ({ name, fileBase, ClassName }) => ({
                    name,
                    fileBase,
                    ClassName
                })
            )
        ).toEqual([
            {
                name: 'admin/panel',
                fileBase: 'admin-panel',
                ClassName: 'AdminPanel'
            },
            { name: 'users', fileBase: 'users', ClassName: 'Users' }
        ]);
    });
});

describe('moveReactModule', () => {
    test('moves a widget, renames its files and code, and updates imports', () => {
        const { project, reactFolder, read, exists } = setup();
        const [widget] = findReactModules(reactFolder, 'widget');
        const plan = moveReactModule(
            project,
            reactFolder,
            widget,
            'admin/users'
        );
        expect(exists('presentation/react/widgets/admin')).toBe(false);
        writePendingChanges();

        const folder = 'presentation/react/widgets/admin/users';
        expect(
            plan.moves.map(([from, to]) => [
                path.relative(project, from),
                path.relative(project, to)
            ])
        ).toContainEqual([
            'presentation/react/widgets/users/hooks/use-users-ui-model.ts',
            `${folder}/hooks/use-admin-users-ui-model.ts`
        ]);
        expect(plan.updated).toEqual([
            path.join(project, 'presentation/react/pages/users-page.tsx')
        ]);
        expect(exists('presentation/react/widgets/users')).toBe(false);
        expect(exists('presentation/react/widgets')).toBe(true);

        expect(read(`${folder}/index.ts`)).toBe(
            "export * from './admin-users-widget'"
        );
        expect(
            read(`${folder}/admin-users-widget.tsx`)
        ).toBe(`import { Button } from '../../../ui-kit/button'
import { Card } from '@/presentation/react/ui-kit/card'
import type { AdminUsersWidgetProps } from './types'
import { AdminUsersWidgetUI } from './ui/admin-users-widget-ui'
import { useAdminUsersUIModel } from './hooks/use-admin-users-ui-model'

export const AdminUsersWidget = (props: AdminUsersWidgetProps) => {
    const uiModel = useAdminUsersUIModel(props)
    return <AdminUsersWidgetUI {...uiModel} />
}`);
        expect(read(`${folder}/ui/admin-users-widget-ui.tsx`)).toContain(
            "import styles from './admin-users-widget-ui.module.css'"
        );
        expect(read(`${folder}/ui/admin-users-widget-ui.module.css`)).toBe(
            '.users-widget { display: grid; }'
        );
        expect(
            read(`${folder}/ui/admin-users-widget-ui.stories.tsx`)
        ).toContain(
            "title: 'Widgets/Admin/Users', component: AdminUsersWidgetUI"
        );
        expect(
            fs.readFileSync(path.join(project, folder, 'ui/logo.png'))
        ).toEqual(png);
        expect(
            read('presentation/react/pages/users-page.tsx')
        ).toBe(`import styles from './users-page.module.css'
import { AdminUsersWidget } from '../widgets/admin/users'

const UsersListTitle = 'Users'

export const UsersPage = () => <AdminUsersWidget />`);
    });

    test('moves a page with its CSS module and updates relative and alias imports', () => {
        const { project, reactFolder, read, exists } = setup();
        const page = findReactModules(reactFolder, 'page')[0];
        const plan = moveReactModule(project, reactFolder, page, 'admin/users');
        writePendingChanges();

        expect(plan.updated).toEqual([path.join(project, 'app/page.tsx')]);
        expect(exists('presentation/react/pages/users-page.tsx')).toBe(false);
        expect(exists('presentation/react/pages/users-page.module.css')).toBe(
            false
        );
        expect(
            read('presentation/react/pages/admin/admin-users-page.module.css')
        ).toBe('.page {}');
        expect(
            read('presentation/react/pages/admin/admin-users-page.tsx')
        ).toBe(`import styles from './admin-users-page.module.css'
import { UsersWidget } from '../../widgets/users'

const UsersListTitle = 'Users'

export const AdminUsersPage = () => <UsersWidget />`);
        expect(
            read('app/page.tsx')
        ).toBe(`import { AdminUsersPage } from '@/presentation/react/pages/admin/admin-users-page'

export default () => <AdminUsersPage />`);
    });

    test('renames files in place to full names under the same name', () => {
        const { project, reactFolder, read, exists } = setup();
        fs.mkdirSync(path.join(reactFolder, 'pages/admin'));
        fs.writeFileSync(
            path.join(reactFolder, 'pages/admin/users-page.tsx'),
            'export const AdminUsersPage = () => null'
        );
        const page = findReactModules(reactFolder, 'page').find(
            ({ name }) => name === 'admin/users'
        )!;
        moveReactModule(project, reactFolder, page, 'admin/users');
        writePendingChanges();

        expect(exists('presentation/react/pages/admin/users-page.tsx')).toBe(
            false
        );
        expect(
            read('presentation/react/pages/admin/admin-users-page.tsx')
        ).toBe('export const AdminUsersPage = () => null');
    });
});

describe('moveReactModule through barrels', () => {
    test('renames classes in files importing barrels that re-export the module', () => {
        const { project, reactFolder, read } = setup();
        const files: Record<string, string> = {
            'presentation/react/widgets/index.ts': "export * from './users'",
            'presentation/react/index.ts': "export * from './widgets'",
            'presentation/react/pages/team-page.tsx': `import { UsersWidget } from '../widgets'

export const TeamPage = () => <UsersWidget />`,
            'app/team/page.tsx': `import { UsersWidget } from '@/presentation/react'

export default () => <UsersWidget />`,
            'app/other/page.tsx': `import { Button } from '@/presentation/react/ui-kit/button'

const UsersWidgetTitle = 'local'`
        };
        for (const [file, content] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(project, file)), {
                recursive: true
            });
            fs.writeFileSync(path.join(project, file), content);
        }
        const [widget] = findReactModules(reactFolder, 'widget');
        const plan = moveReactModule(
            project,
            reactFolder,
            widget,
            'admin/users'
        );
        writePendingChanges();

        expect(read('presentation/react/widgets/index.ts')).toBe(
            "export * from './admin/users'"
        );
        expect(read('presentation/react/index.ts')).toBe(
            "export * from './widgets'"
        );
        expect(
            read('presentation/react/pages/team-page.tsx')
        ).toBe(`import { AdminUsersWidget } from '../widgets'

export const TeamPage = () => <AdminUsersWidget />`);
        expect(
            read('app/team/page.tsx')
        ).toBe(`import { AdminUsersWidget } from '@/presentation/react'

export default () => <AdminUsersWidget />`);
        expect(read('app/other/page.tsx')).toContain(
            "const UsersWidgetTitle = 'local'"
        );
        expect(
            plan.updated.map((file) => path.relative(project, file)).sort()
        ).toEqual([
            'app/team/page.tsx',
            'presentation/react/pages/team-page.tsx',
            'presentation/react/pages/users-page.tsx',
            'presentation/react/widgets/index.ts'
        ]);
    });
});

describe('validateMove', () => {
    test('rejects existing targets, moves into itself and bad names', () => {
        const { reactFolder } = setup();
        const [widget] = findReactModules(reactFolder, 'widget');
        const [page] = findReactModules(reactFolder, 'page');
        fs.mkdirSync(path.join(reactFolder, 'widgets/team'));

        expect(validateMove(reactFolder, widget, 'team')).toBe(
            'widgets/team already exists'
        );
        expect(validateMove(reactFolder, widget, 'users/list')).toBe(
            'A widget cannot be moved into itself'
        );
        expect(validateMove(reactFolder, widget, '../users')).not.toBe(true);
        expect(validateMove(reactFolder, widget, 'users')).toBe(true);
        expect(validateMove(reactFolder, widget, 'admin/users')).toBe(true);
        expect(validateMove(reactFolder, page, 'admin/users')).toBe(true);
    });
});
