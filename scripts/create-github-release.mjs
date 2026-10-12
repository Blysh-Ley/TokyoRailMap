// 保留已有发布入口，统一同步发布到 GitHub 和 AtomGit。
import { publishReleases } from './publish-releases.mjs';
await publishReleases();
