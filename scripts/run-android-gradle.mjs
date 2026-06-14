import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAndroidBuildEnv } from './android-env.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const resolved = resolveAndroidBuildEnv(rootDir);

if (!resolved.ok) {
    console.error('[android:build] Android build environment is not ready. Run npm run android:doctor for details.');
    process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync('./gradlew', args.length ? args : ['assembleDebug'], {
    cwd: `${rootDir}/android`,
    env: resolved.env,
    stdio: 'inherit',
    shell: false
});

process.exit(result.status ?? 1);
