import { resolveAndroidBuildEnv } from './android-env.mjs';

const resolved = resolveAndroidBuildEnv();
const checks = [
    ['Java Runtime', resolved.java],
    ['Android SDK', resolved.sdk],
    ['Gradle wrapper', resolved.gradle]
];

let ok = true;
for (const [label, result] of checks) {
    const prefix = result.ok ? 'ok' : 'missing';
    console.log(`[android:doctor] ${prefix}: ${label} - ${result.detail}`);
    ok = ok && result.ok;
}

if (!ok) {
    console.error('[android:doctor] Install missing SDK components before running npm run android:build.');
    if (resolved.sdk?.sdkmanager) {
        console.error(`[android:doctor] Suggested command: JAVA_HOME="${resolved.java?.javaHome || '$JAVA_HOME'}" "${resolved.sdk.sdkmanager}" "platforms;android-36" "build-tools;36.0.0" "platform-tools"`);
    }
    process.exit(1);
}
