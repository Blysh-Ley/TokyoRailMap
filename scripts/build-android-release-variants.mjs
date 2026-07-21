import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const run = (command, args, label, options = {}) => {
    console.log(`[android:release] ${label}`);
    const result = spawnSync(command, args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
        env: {
            ...process.env,
            ...(options.env || {})
        }
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

run('npm', ['run', 'android:doctor'], 'doctor');
run('npm', ['run', 'icons:generate'], 'generate icons');
run('npm', ['run', 'web:vendor'], 'sync web vendor');
run('npm', ['run', 'version:sync:native'], 'sync native versions');
run('npm', ['run', 'basemap:package:verify'], 'basemap package verify');
run('node', ['scripts/sync-capacitor-web.mjs'], 'web assets');
run('npx', ['cap', 'sync', 'android'], 'capacitor sync');
run(
    'node',
    [
        'scripts/run-android-gradle.mjs',
        'bundleRelease',
        'assembleRelease'
    ],
    'Gradle release'
);
