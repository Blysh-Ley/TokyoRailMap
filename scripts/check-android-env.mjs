import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const run = (command, args = []) => spawnSync(command, args, {
    encoding: 'utf8',
    shell: false
});

const hasUsableJava = () => {
    const result = run('java', ['-version']);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0) {
        return { ok: false, detail: output.trim() || 'java -version failed' };
    }
    if (/Unable to locate a Java Runtime/i.test(output)) {
        return { ok: false, detail: output.trim() };
    }
    return { ok: true, detail: output.split(/\r?\n/)[0] || 'java -version ok' };
};

const hasAndroidSdk = () => {
    const candidates = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        join(homedir(), 'Library/Android/sdk')
    ].filter(Boolean);

    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
        return {
            ok: false,
            detail: 'ANDROID_HOME/ANDROID_SDK_ROOT is not set and ~/Library/Android/sdk was not found'
        };
    }
    return { ok: true, detail: found };
};

const hasGradleWrapper = () => {
    const path = join(process.cwd(), 'android/gradlew');
    return existsSync(path)
        ? { ok: true, detail: path }
        : { ok: false, detail: 'android/gradlew was not found' };
};

const checks = [
    ['Java Runtime', hasUsableJava()],
    ['Android SDK', hasAndroidSdk()],
    ['Gradle wrapper', hasGradleWrapper()]
];

let ok = true;
for (const [label, result] of checks) {
    const prefix = result.ok ? 'ok' : 'missing';
    console.log(`[android:doctor] ${prefix}: ${label} - ${result.detail}`);
    ok = ok && result.ok;
}

if (!ok) {
    console.error('[android:doctor] Install a JDK and Android SDK before running npm run android:build.');
    process.exit(1);
}
