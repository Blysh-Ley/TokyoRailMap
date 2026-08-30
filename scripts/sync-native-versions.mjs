import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packagePath = join(rootDir, 'package.json');
const androidBuildPath = join(rootDir, 'android/app/build.gradle');
const iosProjectPath = join(rootDir, 'ios/App/App.xcodeproj/project.pbxproj');
const webVersionPath = join(rootDir, 'src/config/appVersion.js');

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const version = packageJson.version;

const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) {
    console.error(`[version:sync:native] package.json version must be MAJOR.MINOR.PATCH for native store builds. Received: ${version}`);
    process.exit(1);
}

const [, majorRaw, minorRaw, patchRaw] = match;
const versionCode = Number(majorRaw) * 10000 + Number(minorRaw) * 100 + Number(patchRaw);

function replaceRequired(source, pattern, replacement, label) {
    if (!pattern.test(source)) {
        throw new Error(`Could not find ${label}`);
    }
    return source.replace(pattern, replacement);
}

let androidBuild = readFileSync(androidBuildPath, 'utf8');
androidBuild = replaceRequired(androidBuild, /versionCode\s+\d+/, `versionCode ${versionCode}`, 'Android versionCode');
androidBuild = replaceRequired(androidBuild, /versionName\s+"[^"]+"/, `versionName "${version}"`, 'Android versionName');
writeFileSync(androidBuildPath, androidBuild);

let iosProject = readFileSync(iosProjectPath, 'utf8');
iosProject = replaceRequired(iosProject, /MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`, 'iOS MARKETING_VERSION');
iosProject = replaceRequired(iosProject, /CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`, 'iOS CURRENT_PROJECT_VERSION');
writeFileSync(iosProjectPath, iosProject);

let webVersion = readFileSync(webVersionPath, 'utf8');
webVersion = replaceRequired(
    webVersion,
    /export const CURRENT_APP_VERSION = '[^']*';/,
    `export const CURRENT_APP_VERSION = '${version}';`,
    'Web CURRENT_APP_VERSION'
);
writeFileSync(webVersionPath, webVersion);

console.log(`[version:sync:native] Web/Android/iOS versions synced to ${version} (${versionCode}).`);
