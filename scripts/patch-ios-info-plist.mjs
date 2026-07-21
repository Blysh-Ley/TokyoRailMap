import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const infoPlistPath = join(rootDir, 'ios/App/App/Info.plist');

const PHOTO_USAGE_VALUES = {
    NSPhotoLibraryUsageDescription: '东京铁路图 needs photo library access to save exported rail maps and timetable images.',
    NSPhotoLibraryAddUsageDescription: '东京铁路图 needs permission to save exported rail maps and timetable images to Photos.'
};

const runPlistBuddy = (args) => spawnSync('/usr/libexec/PlistBuddy', args, {
    encoding: 'utf8',
    shell: false
});

const setOrAddString = (key, value) => {
    const setResult = runPlistBuddy(['-c', `Set :${key} ${value}`, infoPlistPath]);
    if (setResult.status === 0) return;

    const addResult = runPlistBuddy(['-c', `Add :${key} string ${value}`, infoPlistPath]);
    if (addResult.status !== 0) {
        const detail = addResult.stderr || setResult.stderr || `failed to patch ${key}`;
        throw new Error(detail.trim());
    }
};

if (!existsSync(infoPlistPath)) {
    console.error(`[ios:permissions] ${infoPlistPath} was not found. Run npx cap add ios or npx cap sync ios first.`);
    process.exit(1);
}

for (const [key, value] of Object.entries(PHOTO_USAGE_VALUES)) {
    setOrAddString(key, value);
}

console.log('[ios:permissions] patched Photos usage descriptions in ios/App/App/Info.plist');
