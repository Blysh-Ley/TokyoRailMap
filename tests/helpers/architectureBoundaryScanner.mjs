import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*)/;

export const readSourceFile = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

export const collectPatternHits = ({ file, pattern, allowComment = false }) => {
    const hits = [];
    const lines = readSourceFile(file).split(/\r?\n/);

    lines.forEach((line, index) => {
        pattern.lastIndex = 0;
        if (allowComment && COMMENT_LINE_PATTERN.test(line)) return;
        if (pattern.test(line)) {
            hits.push(`${file}:${index + 1}: ${line.trim()}`);
        }
    });

    return hits;
};

export const assertNoPattern = ({ files, pattern, message, allowComment = false }) => {
    const hits = [];

    for (const file of files) {
        hits.push(...collectPatternHits({ file, pattern, allowComment }));
    }

    assert.equal(hits.length, 0, `${message}\n${hits.join('\n')}`);
};

export const assertPatternBudget = ({
    file,
    pattern,
    max,
    message,
    allowComment = false
}) => {
    const hits = collectPatternHits({ file, pattern, allowComment });
    assert.ok(
        hits.length <= max,
        `${message}: expected <= ${max}, found ${hits.length}\n${hits.join('\n')}`
    );
};

export const assertMaxLines = ({ file, max, message }) => {
    const lineCount = readSourceFile(file).split(/\r?\n/).length;
    assert.ok(
        lineCount <= max,
        `${message}: expected <= ${max} lines, found ${lineCount}`
    );
};

export const assertBoundaryRules = (rules) => {
    for (const rule of rules) {
        assertNoPattern(rule);
    }
};
