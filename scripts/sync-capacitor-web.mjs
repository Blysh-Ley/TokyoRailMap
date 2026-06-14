import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(rootDir, 'www');

const copyEntries = [
    'index.html',
    'src',
    'data',
    'icons',
    'companyLogos',
    'vendor'
];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const entry of copyEntries) {
    await cp(join(rootDir, entry), join(webDir, entry), {
        recursive: true,
        force: true,
        filter: (source) => !source.endsWith('.DS_Store')
    });
    console.log(`copied ${entry}`);
}
