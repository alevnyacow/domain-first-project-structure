import path from 'node:path';
import { File, type Folder } from '../file-system';
import { input, report } from '../interaction';
import { NestedName } from '../nested-name';
import { nextAppFolder, usesNext } from '../next-app';
import { ProjectRoot } from '../project-root';
import { relativeImport } from '../wiring';

/**
 * Content of `<file>-page.tsx`: imports go before React's, `body` is
 * what the page returns.
 */
export const reactPageContent = (
    ClassName: string,
    { imports = [], body = '<></>' }: { imports?: string[]; body?: string } = {}
) =>
    `
${[...imports, "import { type FC } from 'react'"].join('\n')}

export type ${ClassName}PageProps = {}

export const ${ClassName}Page: FC<${ClassName}PageProps> = (props) => {
    return ${body}
}
`.trim();

/** A thin App Router route that renders the page component. */
export const nextRouteContent = (ClassName: string, pageImport: string) =>
    `
import { ${ClassName}Page } from '${pageImport}'

export default function Page() {
    return <${ClassName}Page />
}
`.trim();

/**
 * With Next.js, the page also gets its App Router route at the same path,
 * e.g. `admin/users` → `app/admin/users/page.tsx`. An existing route is
 * kept: it may hold the user's code, and the returned hint says so.
 */
export const scaffoldNextRoute = (
    name: NestedName,
    pagePath: string
): string | undefined => {
    const root = new ProjectRoot().path;
    const route = path.join(
        root,
        nextAppFolder(root),
        ...name.folders,
        name.folderName,
        'page.tsx'
    );
    const relativeRoute = path.relative(root, route).split(path.sep).join('/');
    const routeFile = new File(route);
    const content = nextRouteContent(
        name.ClassName,
        relativeImport(route, pagePath.replace(/\.tsx$/, ''))
    );
    if (routeFile.exists) {
        return routeFile.data === content
            ? undefined
            : `${relativeRoute} already exists: render ${name.ClassName}Page there yourself.`;
    }
    routeFile.data = content;
};

export const scaffoldReactPage = async (presentationReactFolder: Folder) => {
    const name = await input({
        key: 'name',
        message: 'Provide name (folders split by "/"):',
        validate: NestedName.validate
    });
    const nestedName = new NestedName(name);
    const { folders, ClassName, fileName } = nestedName;

    const pageFile = presentationReactFolder
        .subitem(['pages', ...folders])
        .createFile(`${fileName}-page.tsx`, reactPageContent(ClassName));

    if (usesNext()) {
        const hint = scaffoldNextRoute(nestedName, pageFile.path);
        if (hint) report(hint);
    }
};
