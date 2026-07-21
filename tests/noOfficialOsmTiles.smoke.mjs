import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const scanRoots = ['src', 'tests', 'docs', 'scripts', 'index.html', 'package.json'];
const blocked = /https?:\/\/[abc]\.tile\.openstreetmap\.org|tile\.openstreetmap\.org/;

const collectFiles = (entry) => {
    const path = join(process.cwd(), entry);
    const stats = statSync(path);
    if (stats.isFile()) return [entry];
    const out = [];
    const walk = (dir) => {
        for (const name of readdirSync(join(process.cwd(), dir))) {
            const relativePath = `${dir}/${name}`.replace(/\\/g, '/');
            const nextStats = statSync(join(process.cwd(), relativePath));
            if (nextStats.isDirectory()) walk(relativePath);
            else out.push(relativePath);
        }
    };
    walk(entry);
    return out;
};

const hits = [];
for (const root of scanRoots) {
    for (const file of collectFiles(root)) {
        if (!/\.(?:js|mjs|md|html|json)$/.test(file)) continue;
        const source = readFileSync(join(process.cwd(), file), 'utf8');
        if (blocked.test(source)) hits.push(file);
    }
}

assert.deepEqual(hits, [], `official OSM tile servers are forbidden:\n${hits.join('\n')}`);

console.log('no official osm tiles smoke ok');
