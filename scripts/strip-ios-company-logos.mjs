import { rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const iosPublicDir = join(rootDir, 'ios', 'App', 'App', 'public');

const companyLogoTargets = [
    'assets/company-logos',
    'assets/icons/Seibu.svg',
    'assets/icons/odakyu.svg',
    'assets/icons/nex.svg'
];

const exists = async (path) => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

if (!(await exists(iosPublicDir))) {
    console.log('[ios:strip-company-logos] ios/App/App/public not found; run npx cap sync ios first.');
    process.exit(0);
}

let removedCount = 0;
for (const target of companyLogoTargets) {
    const targetPath = join(iosPublicDir, target);
    if (!(await exists(targetPath))) continue;
    await rm(targetPath, { recursive: true, force: true });
    removedCount += 1;
    console.log(`[ios:strip-company-logos] removed ${target}`);
}

if (!removedCount) {
    console.log('[ios:strip-company-logos] no company logo assets found in iOS public bundle.');
}
