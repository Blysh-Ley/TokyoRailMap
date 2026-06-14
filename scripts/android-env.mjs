import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const run = (command, args = [], options = {}) => spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    ...options
});

const javaHomeCandidates = () => [
    process.env.JAVA_HOME,
    '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home'
].filter(Boolean);

const androidSdkCandidates = () => [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library/Android/sdk')
].filter(Boolean);

const checkJavaHome = (javaHome) => {
    const javaBin = javaHome ? join(javaHome, 'bin/java') : 'java';
    if (javaHome && !existsSync(javaBin)) return null;

    const result = run(javaBin, ['-version']);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0 || /Unable to locate a Java Runtime/i.test(output)) return null;

    return {
        javaHome: javaHome || '',
        javaBin,
        detail: output.split(/\r?\n/)[0] || 'java -version ok'
    };
};

export const resolveJavaRuntime = () => {
    for (const candidate of javaHomeCandidates()) {
        const resolved = checkJavaHome(candidate);
        if (resolved) return { ok: true, ...resolved };
    }

    const pathJava = checkJavaHome('');
    if (pathJava) return { ok: true, ...pathJava };

    return {
        ok: false,
        detail: 'No usable Java runtime found. Install openjdk or set JAVA_HOME.'
    };
};

export const resolveAndroidSdk = () => {
    const sdkRoot = androidSdkCandidates().find((candidate) => existsSync(candidate));
    if (!sdkRoot) {
        return {
            ok: false,
            detail: 'ANDROID_HOME/ANDROID_SDK_ROOT is not set and ~/Library/Android/sdk was not found'
        };
    }

    const sdkmanager = join(sdkRoot, 'cmdline-tools/latest/bin/sdkmanager');
    const requiredPaths = [
        ['Command-line tools', sdkmanager],
        ['Android SDK Platform 36', join(sdkRoot, 'platforms/android-36')],
        ['Android SDK Build-Tools 36.0.0', join(sdkRoot, 'build-tools/36.0.0')],
        ['Android SDK Platform-Tools', join(sdkRoot, 'platform-tools')]
    ];
    const missing = requiredPaths
        .filter(([, path]) => !existsSync(path))
        .map(([label]) => label);

    if (missing.length) {
        return {
            ok: false,
            sdkRoot,
            sdkmanager,
            detail: `${sdkRoot}; missing ${missing.join(', ')}`
        };
    }

    return {
        ok: true,
        sdkRoot,
        sdkmanager,
        detail: sdkRoot
    };
};

export const resolveGradleWrapper = (cwd = process.cwd()) => {
    const gradlew = join(cwd, 'android/gradlew');
    return existsSync(gradlew)
        ? { ok: true, gradlew, detail: gradlew }
        : { ok: false, detail: 'android/gradlew was not found' };
};

export const resolveAndroidBuildEnv = (cwd = process.cwd()) => {
    const java = resolveJavaRuntime();
    const sdk = resolveAndroidSdk();
    const gradle = resolveGradleWrapper(cwd);

    return {
        ok: java.ok && sdk.ok && gradle.ok,
        java,
        sdk,
        gradle,
        env: {
            ...process.env,
            ...(java.javaHome ? { JAVA_HOME: java.javaHome } : {}),
            ...(sdk.sdkRoot ? { ANDROID_HOME: sdk.sdkRoot, ANDROID_SDK_ROOT: sdk.sdkRoot } : {}),
            PATH: [
                java.javaHome ? join(java.javaHome, 'bin') : '',
                sdk.sdkRoot ? join(sdk.sdkRoot, 'platform-tools') : '',
                sdk.sdkRoot ? join(sdk.sdkRoot, 'cmdline-tools/latest/bin') : '',
                process.env.PATH || ''
            ].filter(Boolean).join(':')
        }
    };
};
