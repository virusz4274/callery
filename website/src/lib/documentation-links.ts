import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentationPages } from './documentation';
import type { SatteriProcessorOptions } from '@astrojs/markdown-satteri';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const repository = 'https://github.com/virusz4274/callery';
const published = new Map(documentationPages.map(page => [`/docs/${page.slug}.md`, `/docs/${page.slug}`]));

/** Keep a single Markdown source usable both on GitHub and on the public site. */
export function rewriteDocumentationLink(href: string, sourcePath: string): string {
    if (!href || href.startsWith('#')) return href;
    const githubPrefix = `${repository}/blob/main/`;
    if (href.startsWith(githubPrefix)) {
        const url = new URL(href);
        const local = published.get(url.pathname.slice('/virusz4274/callery/blob/main'.length));
        return local ? `${local}${url.search}${url.hash}` : href;
    }
    if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(href)) return href;
    const source = path.relative(repositoryRoot, sourcePath).split(path.sep).join('/');
    if (!source.startsWith('docs/') || !source.endsWith('.md')) return href;
    const resolved = new URL(href, `https://repository.invalid/${source}`);
    const destination = published.get(resolved.pathname) ?? `${repository}/blob/main${resolved.pathname}`;
    return `${destination}${resolved.search}${resolved.hash}`;
}

export const documentationLinksPlugin = {
    name: 'callery-documentation-links',
    link(node, context) {
        if (context.fileURL) context.setField(node, 'url', rewriteDocumentationLink(node.url, fileURLToPath(context.fileURL)));
    },
    definition(node, context) {
        if (context.fileURL) context.setField(node, 'url', rewriteDocumentationLink(node.url, fileURLToPath(context.fileURL)));
    },
} satisfies NonNullable<SatteriProcessorOptions['mdastPlugins']>[number];
