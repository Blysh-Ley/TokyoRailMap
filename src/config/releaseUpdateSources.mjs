export const GOOGLE_UPDATE_PROBE_URL = 'https://www.google.com/generate_204';
export const UPDATE_PROBE_TIMEOUT_MS = 5000;

export const RELEASE_UPDATE_SOURCES = Object.freeze({
    github: Object.freeze({
        id: 'github',
        label: 'GitHub',
        apiUrl: 'https://api.github.com/repos/Blysh-Ley/TokyoRailMap/releases/latest',
        releasesUrl: 'https://github.com/Blysh-Ley/TokyoRailMap/releases'
    }),
    atomgit: Object.freeze({
        id: 'atomgit',
        label: 'AtomGit',
        apiUrl: 'https://api.atomgit.com/api/v5/repos/blysh1210/TokyoRailMap/releases/latest',
        releasesUrl: 'https://atomgit.com/blysh1210/TokyoRailMap/releases'
    })
});
