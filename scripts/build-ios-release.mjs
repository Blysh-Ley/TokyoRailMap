import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;
const iosOutputDir = join(rootDir, 'dist', 'ios-release');
const archivePath = join(iosOutputDir, `TokyoRailMap-${version}.xcarchive`);
const exportPath = join(iosOutputDir, 'export');
const exportOptionsPath = join(iosOutputDir, 'ExportOptions.plist');
const exportMethod = process.env.IOS_EXPORT_METHOD || 'app-store-connect';
const signingStyle = process.env.IOS_SIGNING_STYLE || 'automatic';

mkdirSync(exportPath, { recursive: true });

const teamIdEntry = process.env.IOS_TEAM_ID
    ? `\n    <key>teamID</key>\n    <string>${process.env.IOS_TEAM_ID}</string>`
    : '';

writeFileSync(exportOptionsPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>destination</key>
    <string>export</string>
    <key>method</key>
    <string>${exportMethod}</string>
    <key>signingStyle</key>
    <string>${signingStyle}</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>uploadSymbols</key>
    <true/>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>${teamIdEntry}
</dict>
</plist>
`);

function runXcodebuild(args, label) {
    console.log(`[ios:release] ${label}`);
    const result = spawnSync('xcodebuild', args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false
    });
    if (result.status !== 0) {
        const error = new Error(`[ios:release] ${label} failed`);
        error.status = result.status ?? 1;
        throw error;
    }
}

const provisioningArgs = process.env.IOS_ALLOW_PROVISIONING_UPDATES === '0'
    ? []
    : ['-allowProvisioningUpdates'];

let exitCode = 0;

try {
    runXcodebuild([
        '-workspace', 'ios/App/App.xcworkspace',
        '-scheme', 'App',
        '-configuration', 'Release',
        '-archivePath', archivePath,
        ...provisioningArgs,
        'archive'
    ], `archive ${archivePath}`);

    runXcodebuild([
        '-exportArchive',
        '-archivePath', archivePath,
        '-exportPath', exportPath,
        '-exportOptionsPlist', exportOptionsPath,
        ...provisioningArgs
    ], `export ${exportPath}`);
} catch (error) {
    console.error(error.message);
    exitCode = error.status ?? 1;
}

if (exitCode !== 0) {
    process.exit(exitCode);
}
