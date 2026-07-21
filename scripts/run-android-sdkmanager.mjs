import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAndroidBuildEnv } from './android-env.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const resolved = resolveAndroidBuildEnv(rootDir);
const sdkmanager = resolved.sdk?.sdkmanager;

if (!sdkmanager) {
    console.error('[android:sdk] Android command-line tools are not installed. Run npm run android:doctor for details.');
    process.exit(1);
}

if (!resolved.java?.ok) {
    console.error('[android:sdk] Java runtime is not ready. Run npm run android:doctor for details.');
    process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) {
    console.error('[android:sdk] Missing sdkmanager arguments.');
    process.exit(1);
}

const result = spawnSync(sdkmanager, args, {
    cwd: rootDir,
    env: resolved.env,
    stdio: 'inherit',
    shell: false
});

process.exit(result.status ?? 1);
