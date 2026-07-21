import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const packageJson = readJson('package.json');
const capacitorConfig = readJson('capacitor.config.json');
const indexHtml = readFileSync('index.html', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');
const androidGitignore = readFileSync('android/.gitignore', 'utf8');
const androidBuildGradle = readFileSync('android/app/build.gradle', 'utf8');
const androidFilePaths = readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8');
const androidManifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const androidMainStrings = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
const androidMainActivity = readFileSync('android/app/src/main/java/com/blysh/tokyorailmap/MainActivity.java', 'utf8');
const androidBasemapPlugin = readFileSync('android/app/src/main/java/com/blysh/tokyorailmap/TokyoRailBasemapPlugin.java', 'utf8');
const capacitorSyncScript = readFileSync('scripts/sync-capacitor-web.mjs', 'utf8');
const releaseVariantsScript = readFileSync('scripts/release-variants.mjs', 'utf8');
const electronVariantScript = readFileSync('scripts/build-electron-variant.mjs', 'utf8');
const androidReleaseVariantsScript = readFileSync('scripts/build-android-release-variants.mjs', 'utf8');
const iosReleaseVariantsScript = readFileSync('scripts/build-ios-release-variants.mjs', 'utf8');
const iosReleaseScript = readFileSync('scripts/build-ios-release.mjs', 'utf8');
const basemapPackageVerifyScript = readFileSync('scripts/verify-basemap-package-assets.mjs', 'utf8');
const mainProcessSource = readFileSync('main.js', 'utf8');
const preloadSource = readFileSync('src/preload.js', 'utf8');
const fetchCacheSource = readFileSync('src/lib/fetch.js', 'utf8');
const androidPmtilesSource = readFileSync('src/services/androidPmtilesArchiveSource.js', 'utf8');
const packageDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
};

assert.equal(capacitorConfig.appId, 'com.blysh.tokyorailmap');
assert.equal(capacitorConfig.appName, '东京铁路图');
assert.equal(capacitorConfig.webDir, 'www');
assert.equal(capacitorConfig.server?.androidScheme, 'https');
assert.equal(capacitorConfig.plugins?.Media?.androidGalleryMode, true);

assert.equal(packageDeps['maplibre-gl'], '3.6.2');
assert.ok(packageDeps['@capacitor/core']);
assert.ok(packageDeps['@capacitor/android']);
assert.ok(packageDeps['@capacitor/app']);
assert.ok(packageDeps['@capacitor-community/media']);
assert.ok(packageDeps['@capacitor/share']);
assert.ok(packageDeps['@capacitor/filesystem']);
assert.ok(packageDeps['@capacitor/cli']);

assert.match(packageJson.scripts['basemap:package:verify'], /node scripts\/verify-basemap-package-assets\.mjs/);
assert.match(packageJson.scripts.prebuild, /npm run basemap:package:verify/);
assert.match(packageJson.scripts.prebuildall, /npm run basemap:package:verify/);
assert.match(packageJson.scripts.build, /build-electron-variant\.mjs/);
assert.equal(packageJson.scripts['build:electron:offline'], undefined);
assert.equal(packageJson.scripts['build:electron:online'], undefined);
assert.match(packageJson.scripts['web:static'], /sync-capacitor-web\.mjs --out dist\/static-site/);
assert.match(packageJson.scripts['web:static'], /basemap:package:verify/);
assert.match(packageJson.scripts['cap:web'], /basemap:package:verify/);
assert.doesNotMatch(packageJson.scripts['cap:web'], /--variant/);
assert.equal(packageJson.scripts['cap:web:offline'], undefined);
assert.equal(packageJson.scripts['cap:web:online'], undefined);
assert.match(packageJson.scripts['cap:sync:android'], /cap:web && npx cap sync android/);
assert.equal(packageJson.scripts['cap:sync:android:offline'], undefined);
assert.equal(packageJson.scripts['cap:sync:android:online'], undefined);
assert.match(packageJson.scripts['android:doctor'], /node scripts\/check-android-env\.mjs/);
assert.match(packageJson.scripts['android:sdk:licenses'], /node scripts\/run-android-sdkmanager\.mjs --licenses/);
assert.match(packageJson.scripts['android:sdk:install'], /node scripts\/run-android-sdkmanager\.mjs "platforms;android-36" "build-tools;36\.0\.0" "platform-tools"/);
assert.match(packageJson.scripts['android:build'], /npm run android:doctor && npm run cap:sync:android && node scripts\/run-android-gradle\.mjs assembleDebug/);
assert.match(packageJson.scripts['android:release'], /build-android-release-variants\.mjs/);
assert.match(packageJson.scripts['ios:release'], /build-ios-release-variants\.mjs/);
assert.match(packageJson.scripts['test:android'], /androidBackRuntime\.smoke\.mjs/);
assert.equal(packageJson.build.appId, 'com.blysh.tokyorailmap');
assert.equal(packageJson.build.productName, '东京铁路图');
assert.doesNotMatch(packageJson.build.artifactName, /offline|online/);
assert.ok(packageJson.build.files.includes('tiles/kanto.pmtiles'));
assert.equal(packageJson.build.files.includes('tiles/kanto-latest.osm.pbf'), false);
assert.equal(packageJson.build.files.includes('tiles/planetiler-sources/**'), false);
assert.deepEqual(packageJson.build.asarUnpack, ['tiles/kanto.pmtiles']);

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
    'docs/android-build.md',
    'android/app/src/main/java/com/blysh/tokyorailmap/MainActivity.java',
    'android/app/src/main/java/com/blysh/tokyorailmap/TokyoRailBasemapPlugin.java'
]) {
    assert.equal(existsSync(path), true, `${path} must exist`);
}

assert.match(gitignore, /(^|\n)\/?www\//);
assert.match(gitignore, /\.npm-cache\//);
assert.match(androidGitignore, /app\/src\/main\/assets\/public/);
assert.match(androidBuildGradle, /namespace = "com\.blysh\.tokyorailmap"/);
assert.match(androidBuildGradle, /applicationId "com\.blysh\.tokyorailmap"/);
assert.doesNotMatch(androidBuildGradle, /flavorDimensions "basemap"/);
assert.doesNotMatch(androidBuildGradle, /applicationIdSuffix "\.(offline|online)"/);
assert.match(androidBuildGradle, /noCompress 'pmtiles'/);
assert.match(androidMainStrings, /东京铁路图/);
assert.match(androidMainStrings, /com\.blysh\.tokyorailmap/);
assert.doesNotMatch(androidMainStrings, /离线版|\.offline|\.online/);
assert.match(androidFilePaths, /<cache-path\b[^>]*path="\."/);
assert.match(androidManifest, /android\.permission\.READ_EXTERNAL_STORAGE/);
assert.match(androidManifest, /android\.permission\.WRITE_EXTERNAL_STORAGE/);
assert.match(androidManifest, /android\.permission\.READ_MEDIA_IMAGES/);
assert.match(androidMainActivity, /registerPlugin\(TokyoRailBasemapPlugin\.class\)/);
assert.match(androidBasemapPlugin, /@CapacitorPlugin\(name = "TokyoRailBasemap"\)/);
assert.match(androidBasemapPlugin, /RandomAccessFile/);
assert.match(androidBasemapPlugin, /file\.seek\(offset\)/);
assert.match(androidBasemapPlugin, /assets\.openFd\(ASSET_PATH\)/);
assert.match(androidBasemapPlugin, /getNumberLong\(call, "offset"\)/);
assert.doesNotMatch(androidBasemapPlugin, /call\.getLong\("offset"\)/);
assert.match(androidBasemapPlugin, /public\/tiles\/kanto\.pmtiles/);
assert.match(capacitorSyncScript, /tiles\/kanto\.pmtiles/);
assert.doesNotMatch(capacitorSyncScript, /variant\.includePmtiles/);
assert.match(capacitorSyncScript, /runtimeVariant\.js/);
assert.match(releaseVariantsScript, /id: 'standard'/);
assert.match(releaseVariantsScript, /displayName: '东京铁路图'/);
assert.match(releaseVariantsScript, /basemapSource: 'pmtiles'/);
assert.doesNotMatch(releaseVariantsScript, /basemapSource: 'openfreemap'/);
assert.match(electronVariantScript, /tokyoRailVariant/);
assert.match(electronVariantScript, /asarUnpack: \['tiles\/kanto\.pmtiles'\]/);
assert.match(androidReleaseVariantsScript, /bundleRelease/);
assert.match(androidReleaseVariantsScript, /assembleRelease/);
assert.match(iosReleaseVariantsScript, /build-ios-release\.mjs/);
assert.doesNotMatch(iosReleaseScript, /PRODUCT_BUNDLE_IDENTIFIER=\$\{variant\.appId\}/);
assert.doesNotMatch(iosReleaseScript, /TOKYO_RAIL_DISPLAY_NAME=\$\{variant\.displayName\}/);
assert.doesNotMatch(capacitorSyncScript, /kanto-latest\.osm\.pbf|planetiler-sources/);
assert.match(basemapPackageVerifyScript, /PMTILES_MAGIC_NUMBER/);
assert.match(basemapPackageVerifyScript, /tiles', 'kanto\.pmtiles/);
assert.match(mainProcessSource, /\$\{APP_ROOT\}\.unpacked/);
assert.match(mainProcessSource, /content-range/);
assert.match(mainProcessSource, /Partial Content/);
assert.match(preloadSource, /readLocalFile: async \(urlOrPath, options = \{\}\)/);
assert.match(fetchCacheSource, /getRangeHeader/);
assert.match(fetchCacheSource, /api\.readLocalFile\(url, range \? \{ range \} : \{\}\)/);
assert.match(androidPmtilesSource, /TokyoRailBasemap/);
assert.match(androidPmtilesSource, /readRange/);
assert.match(androidPmtilesSource, /hasPmtilesMagicNumber/);

console.log('android packaging smoke ok');
