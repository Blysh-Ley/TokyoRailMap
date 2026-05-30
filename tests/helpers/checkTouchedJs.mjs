import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

const printHelp = () => {
    console.log([
        'Usage:',
        '  node tests/helpers/checkTouchedJs.mjs',
        '  node tests/helpers/checkTouchedJs.mjs --staged',
        '  node tests/helpers/checkTouchedJs.mjs --base=HEAD~1',
        '  node tests/helpers/checkTouchedJs.mjs src/app.js tests/example.mjs',
        '',
        'Checks touched JS files with node --check.',
        'With no file arguments, files are collected from git diff plus untracked files.'
    ].join('\n'));
};

const runGit = (args) => {
    const result = spawnSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8'
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        throw new Error(`git ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`);
    }

    return result.stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const parseArgs = (argv) => {
    const options = {
        base: 'HEAD',
        includeUntracked: true,
        stagedOnly: false,
        files: []
    };

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--staged' || arg === '--cached') {
            options.stagedOnly = true;
        } else if (arg === '--no-untracked') {
            options.includeUntracked = false;
        } else if (arg.startsWith('--base=')) {
            options.base = arg.slice('--base='.length) || 'HEAD';
        } else if (arg === '--') {
            continue;
        } else {
            options.files.push(arg);
        }
    }

    return options;
};

const isJsFile = (file) => JS_EXTENSIONS.has(extname(file).toLowerCase());

const uniqueExistingJsFiles = (files) => {
    const seen = new Set();
    const out = [];

    for (const raw of files) {
        const file = raw.replace(/\\/g, '/');
        if (!isJsFile(file)) continue;
        if (!existsSync(file)) continue;
        if (seen.has(file)) continue;
        seen.add(file);
        out.push(file);
    }

    return out;
};

const collectGitTouchedFiles = ({ base, includeUntracked, stagedOnly }) => {
    const diffArgs = stagedOnly
        ? ['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB']
        : ['diff', '--name-only', '--diff-filter=ACMRTUXB', base];

    const files = runGit(diffArgs);

    if (includeUntracked && !stagedOnly) {
        files.push(...runGit(['ls-files', '--others', '--exclude-standard']));
    }

    return uniqueExistingJsFiles(files);
};

const checkFile = (file) => {
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: process.cwd(),
        encoding: 'utf8'
    });

    return {
        file,
        ok: result.status === 0,
        output: `${result.stdout || ''}${result.stderr || ''}`.trim()
    };
};

const main = () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const files = options.files.length
        ? uniqueExistingJsFiles(options.files)
        : collectGitTouchedFiles(options);

    if (!files.length) {
        console.log('check:touched no touched JS files');
        return;
    }

    console.log(`check:touched node --check ${files.length} file(s)`);
    const failures = [];
    for (const file of files) {
        const result = checkFile(file);
        if (result.ok) {
            console.log(`ok ${file}`);
        } else {
            failures.push(result);
            console.error(`fail ${file}`);
            if (result.output) console.error(result.output);
        }
    }

    if (failures.length) {
        process.exitCode = 1;
    }
};

main();
