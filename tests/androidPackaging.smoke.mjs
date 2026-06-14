import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const packageJson = readJson('package.json');
const capacitorConfig = readJson('capacitor.config.json');
const indexHtml = readFileSync('index.html', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');
const androidGitignore = readFileSync('android/.gitignore', 'utf8');
const androidBuildGradle = readFileSync('android/app/build.gradle', 'utf8');

assert.equal(capacitorConfig.appId, 'com.blysh.tokyorailmap');
assert.equal(capacitorConfig.webDir, 'www');
assert.equal(capacitorConfig.server?.androidScheme, 'https');

assert.equal(packageJson.dependencies['maplibre-gl'], '3.6.2');
assert.ok(packageJson.dependencies['@capacitor/core']);
assert.ok(packageJson.dependencies['@capacitor/android']);
assert.ok(packageJson.dependencies['@capacitor/app']);
assert.ok(packageJson.devDependencies['@capacitor/cli']);

assert.match(packageJson.scripts['cap:sync:android'], /npm run cap:web && npx cap sync android/);
assert.match(packageJson.scripts['android:doctor'], /node scripts\/check-android-env\.mjs/);
assert.match(packageJson.scripts['android:sdk:licenses'], /node scripts\/run-android-sdkmanager\.mjs --licenses/);
assert.match(packageJson.scripts['android:sdk:install'], /node scripts\/run-android-sdkmanager\.mjs "platforms;android-36" "build-tools;36\.0\.0" "platform-tools"/);
assert.match(packageJson.scripts['android:build'], /npm run android:doctor && npm run cap:sync:android && node scripts\/run-android-gradle\.mjs assembleDebug/);
assert.match(packageJson.scripts['test:android'], /androidBackRuntime\.smoke\.mjs/);

assert.match(indexHtml, /\.\/vendor\/maplibre-gl\/maplibre-gl\.js/);
assert.match(indexHtml, /\.\/vendor\/maplibre-gl\/maplibre-gl\.css/);
assert.match(indexHtml, /\.\/vendor\/japanese-holidays\/japanese-holidays\.min\.js/);
assert.match(indexHtml, /\.\/vendor\/jszip\/jszip\.min\.js/);
assert.match(indexHtml, /viewport-fit=cover/);
assert.doesNotMatch(indexHtml, /https:\/\/unpkg\.com|https:\/\/cdn\.jsdelivr\.net/);

for (const path of [
    'vendor/maplibre-gl/maplibre-gl.js',
    'vendor/maplibre-gl/maplibre-gl.css',
    'vendor/japanese-holidays/japanese-holidays.min.js',
    'vendor/jszip/jszip.min.js',
    'scripts/android-env.mjs',
    'scripts/check-android-env.mjs',
    'scripts/run-android-gradle.mjs',
    'scripts/run-android-sdkmanager.mjs',
    'android/app/src/main/java/com/blysh/tokyorailmap/MainActivity.java'
]) {
    assert.equal(existsSync(path), true, `${path} must exist`);
}

assert.match(gitignore, /\/www\//);
assert.match(gitignore, /\.npm-cache\//);
assert.match(androidGitignore, /app\/src\/main\/assets\/public/);
assert.match(androidBuildGradle, /namespace = "com\.blysh\.tokyorailmap"/);
assert.match(androidBuildGradle, /applicationId "com\.blysh\.tokyorailmap"/);

console.log('android packaging smoke ok');
