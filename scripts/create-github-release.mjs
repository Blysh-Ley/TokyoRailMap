import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function run(command, args, options = {}) {
    const output = execFileSync(command, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: options.stdio ?? 'pipe'
    });

    return typeof output === 'string' ? output.trim() : '';
}

function hasCommand(command) {
    const result = spawnSync(command, ['--version'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'ignore'
    });
    return result.status === 0;
}

function extractReleaseNotes(changelog, version) {
    const heading = `## [${version}]`;
    const lines = changelog.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith(heading));

    if (start === -1) {
        return '';
    }

    const body = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index].startsWith('## [')) {
            break;
        }
        body.push(lines[index]);
    }

    return body.join('\n').trim();
}

if (!hasCommand('gh')) {
    throw new Error('GitHub CLI (gh) is required. Install it with: brew install gh');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const version = packageJson.version;
const tag = `v${version}`;
const remote = process.env.RELEASE_REMOTE || 'origin';
const branch = process.env.RELEASE_BRANCH || run('git', ['branch', '--show-current']);

if (!version) {
    throw new Error('Missing package.json version.');
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const notes = extractReleaseNotes(changelog, version) || `Release ${tag}`;
const notesFile = join(tmpdir(), `tokyorailmap-release-notes-${version}.md`);
writeFileSync(notesFile, `${notes}\n`);

console.log(`Pushing ${branch} and ${tag} to ${remote}...`);
run('git', ['push', remote, branch], { stdio: 'inherit' });
run('git', ['push', remote, tag], { stdio: 'inherit' });

const existingRelease = spawnSync('gh', ['release', 'view', tag], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'ignore'
});

if (existingRelease.status === 0) {
    console.log(`Release ${tag} already exists; skipped creation.`);
    console.log(`Upload assets manually with: gh release upload ${tag} dist/release-installers/v${version}/* --clobber`);
    process.exit(0);
}

console.log(`Creating GitHub Release ${tag} without assets...`);
run('gh', [
    'release',
    'create',
    tag,
    '--title',
    `TokyoRailMap ${tag}`,
    '--notes-file',
    notesFile
], { stdio: 'inherit' });

console.log(`Release ${tag} created. Upload installer assets manually when ready.`);
