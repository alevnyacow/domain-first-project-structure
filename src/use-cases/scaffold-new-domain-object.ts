import { input, select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

const noAggregate = 'No aggregate';

export const scaffoldNewDomainObject = async (
    boundedContextFolder: Folder,
    kind: 'entity' | 'value-object'
) => {
    const name = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    const aggregatesFolder = boundedContextFolder.subitem([
        'domain',
        'aggregates'
    ]);

    const aggregateNames = aggregatesFolder.content.subfolderNames;

    /**
     * Without aggregates (e.g. in the Shared Layer) there is nothing to pick.
     */
    const aggregate = aggregateNames.length
        ? await select({
              message: 'Aggregate:',
              choices: [...aggregateNames, noAggregate]
          })
        : noAggregate;

    const kindFolderName = kind === 'entity' ? 'entities' : 'value-objects';

    const folder =
        aggregate === noAggregate
            ? boundedContextFolder.subitem(['domain', kindFolderName])
            : aggregatesFolder.subitem([aggregate, kindFolderName]);

    const fileName = `${naming.fileName}.${kind}`;

    folder.createFile(
        `${fileName}.ts`,
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/types'
        )
            ? /**
               * Content with domain-first types integration
               */
              `
import { domainType } from '@domain-first/types'

export class ${naming.ClassName} extends domainType() {

}`.trim()
            : /**
               * Content without domain-first types integration
               */
              `export class ${naming.ClassName} {}`
    );

    if (aggregate !== noAggregate) {
        aggregatesFolder
            .subitem([aggregate])
            .file('index.ts')
            .addLineIfMissing(
                `export * from './${kindFolderName}/${fileName}'`
            );
    }

    const { testingLibrary } = ConfigFile.Instance.data;

    if (testingLibrary) {
        folder.createFile(
            `${fileName}.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${testingLibrary}'
import { ${naming.ClassName} } from './${fileName}'

let ${naming.variableName}: ${naming.ClassName}

beforeEach(() => {
    ${naming.variableName} = new ${naming.ClassName}()
})

describe('${naming.withSpaces}', () => {
    test('can be instantiated via constructor', () => {
        expect(${naming.variableName}).toBeDefined()
    })
})
            `.trim()
        );
    }
};
