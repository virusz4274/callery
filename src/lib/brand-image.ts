import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const logoData = await readFile(join(process.cwd(), 'public/brand/callery-logo.png'), 'base64');

// Embed the local asset so social previews render without an external image fetch.
export const brandLogoSrc = `data:image/png;base64,${logoData}`;
