// Scaffolded next to the OpenAPI generator to fill operationId, summary and
// description from the TSDoc of the endpoint logic.
export const openapiExtractorPath =
    'scripts/extract-open-api-data-from-endpoint.ts';

// Endpoint files are resolved from the project root the script runs in.
const rootFolderSegments = (rootFolder: string) =>
    rootFolder
        .split(/[\\/]/)
        .map((segment) => segment.trim())
        .filter((segment) => !!segment && segment !== '.')
        .map((segment) => `'${segment}',\n                    `)
        .join('');

export const openapiExtractor = (
    rootFolder: string
) => `import path from 'node:path';
import {
    type DocNode,
    DocPlainText,
    TSDocConfiguration,
    TSDocParser,
    TSDocTagDefinition,
    TSDocTagSyntaxKind
} from '@microsoft/tsdoc';
import { Node, Project, type SourceFile, SyntaxKind } from 'ts-morph';

type BlockTag = \`@\${string}\`;

type OpenApiDataTags = {
    /** Omit to take the summary from the comment text before the first tag. */
    summary?: BlockTag;
    description?: BlockTag;
};

type OpenApiData = Partial<{
    summary: string;
    description: string;
    operationId: string;
}>;

const project = new Project({
    tsConfigFilePath: 'tsconfig.json'
});

const getText = (node: DocNode): string =>
    node
        .getChildNodes()
        .map((child) => {
            if (child instanceof DocPlainText) {
                return child.text;
            }

            return getText(child);
        })
        .join('');

const getRawCommentText = (comment: string): string =>
    comment
        .replace(/^\\/\\*\\*/, '')
        .replace(/\\*\\/$/, '')
        .split(/\\r?\\n/)
        .map((line) => line.replace(/^\\s*\\*\\s?/, ''))
        .join('\\n');

// TSDoc treats an unknown tag as summary content, so every block tag of the
// comment has to be registered for the summary section to end before it.
const parseSummary = (comment: string): string | undefined => {
    const configuration = new TSDocConfiguration();
    const tagNames = getRawCommentText(comment).matchAll(/(?:^|\\n)\\s*(@\\w+)/g);

    for (const [, tagName] of tagNames) {
        if (!configuration.tryGetTagDefinition(tagName)) {
            configuration.addTagDefinition(
                new TSDocTagDefinition({
                    tagName,
                    syntaxKind: TSDocTagSyntaxKind.BlockTag
                })
            );
        }
    }

    const { docComment } = new TSDocParser(configuration).parseString(comment);

    return getText(docComment.summarySection).trim() || undefined;
};

// Parsed by hand rather than through TSDoc, which drops the line breaks.
const getTagText = (comment: string, tag: BlockTag): string | undefined => {
    const tagMatch = getRawCommentText(comment).match(
        new RegExp(
            \`(?:^|\\\\n)\\\\s*\${tag}(?:[ \\\\t]*\\\\n|[ \\\\t]+)([\\\\s\\\\S]*?)(?=\\\\n\\\\s*@\\\\w+|\\\\s*$)\`
        )
    );

    return tagMatch?.[1].trim() || undefined;
};

// Endpoints pass their logic as the generator's first argument
// (\`this.endpointGenerator(this.handler.handle, ...)\`), while other injected
// queries only serve as helpers, e.g. guest checks.
const findHandlerClass = (endpointFile: SourceFile) =>
    endpointFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .map((call) => call.getArguments()[0])
        .filter(Node.isPropertyAccessExpression)
        .find((argument) => argument.getName() === 'handle')
        ?.getExpression()
        .getType()
        .getSymbol()
        ?.getDeclarations()
        .find(Node.isClassDeclaration);

export const createOpenApiDataFromEndpointLogicExtractor = ({
    summary: summaryTag,
    description: descriptionTag = '@description'
}: OpenApiDataTags = {}) => {
    return (routeMetadata: {
        method: string;
        path: string[];
    }): OpenApiData | undefined => {
        try {
            const [currentBoundedContext, controller, ...relativePath] =
                routeMetadata.path;

            if (!currentBoundedContext || !controller) {
                return undefined;
            }

            const endpointFile = project.getSourceFile(
                path.join(
                    ${rootFolderSegments(rootFolder)}'bounded-contexts',
                    currentBoundedContext,
                    'presentation',
                    'rest',
                    controller,
                    ...relativePath,
                    \`\${routeMetadata.method.toUpperCase()}.ts\`
                )
            );

            if (!endpointFile) {
                return undefined;
            }

            const declaration = findHandlerClass(endpointFile);
            const operationId = declaration?.getName();
            const comment = declaration?.getJsDocs().at(-1)?.getText();

            if (!comment) {
                return { operationId };
            }

            return {
                summary: summaryTag
                    ? getTagText(comment, summaryTag)
                    : parseSummary(comment),
                description: getTagText(comment, descriptionTag),
                operationId
            };
        } catch (e: unknown) {
            console.error(e);
            return undefined;
        }
    };
};
`;
