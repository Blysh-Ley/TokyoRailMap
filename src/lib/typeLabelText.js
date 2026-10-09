export const TYPE_LABEL_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
export const TYPE_LABEL_FONT = `700 12px ${TYPE_LABEL_FONT_FAMILY}`;

// 连续英文、数字和连接符共同旋转，保持词语原来的拼写。
export const splitTypeHeadTextChunks = (value) => {
    const text = String(value ?? '').trim();
    return (text.match(/[A-Za-z0-9][A-Za-z0-9\s\-+&/().,']*|[^A-Za-z0-9]/gu) || [])
        .filter((part) => part.trim()).map((part) => ({ text: part, kind: /^[A-Za-z0-9]/.test(part) ? 'en' : 'other' }));
};

export const measureTypeLabel = (name, measureText = (text) => Array.from(text).length * 12) => {
    let height = 0;
    const runs = splitTypeHeadTextChunks(name).map(({ text, kind }) => {
        const length = kind === 'en' ? measureText(text) : 14;
        const run = { text, rotate: kind === 'en', offset: height + length / 2 };
        height += length;
        return run;
    });
    return { width: measureText(name), height, runs };
};
