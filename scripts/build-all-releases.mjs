import { spawnSync } from 'node:child_process';

const failures = [];

function run(command, args, label) {
    console.log(`[buildall] ${label}`);
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        shell: false
    });
    if (result.status !== 0) {
        const status = result.status ?? 1;
        failures.push(`${label} exited with ${status}`);
        console.error(`[buildall] ${label} failed; continuing so release artifacts can still be collected.`);
        return false;
    }
    return true;
}

run('npm', ['run', 'version:sync:native'], 'sync native versions');
run('npx', ['electron-builder', '--win', '--mac', '-p', 'never'], 'build Electron installers');

if (process.env.SKIP_ANDROID_RELEASE !== '1') {
    run('npm', ['run', 'android:release'], 'build Android release');
}

if (process.env.SKIP_IOS_RELEASE !== '1') {
    run('npm', ['run', 'ios:release'], 'build iOS release');
}

run('npm', ['run', 'release:collect'], 'collect release installers');

if (failures.length) {
    console.error('[buildall] Completed with failures:');
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}
