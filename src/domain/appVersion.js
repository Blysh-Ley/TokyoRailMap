const splitVersion = (version) => String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => {
        const value = Number.parseInt(part, 10);
        return Number.isFinite(value) ? value : 0;
    });

export const compareAppVersions = (left, right) => {
    const leftParts = splitVersion(left);
    const rightParts = splitVersion(right);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < length; i += 1) {
        const a = leftParts[i] || 0;
        const b = rightParts[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
};

