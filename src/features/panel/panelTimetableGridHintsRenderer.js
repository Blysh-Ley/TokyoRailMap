const defaultToText = (value) => String(value ?? '').trim();

export const buildPanelTimetableGridHintsHtml = ({
    typeHints,
    terminalHints,
    specialHints,
    escapeHtml = defaultToText,
    isNoMarkTypeName = () => false,
    toText = defaultToText
} = {}) => {
    const typeLegendItems = (Array.isArray(typeHints) ? typeHints : [])
        .map((item) => {
            const full = toText(item?.full);
            const abbr = toText(item?.abbr);
            const color = toText(item?.color) || '#888';
            if (!full || !abbr) return '';
            if (isNoMarkTypeName(full)) {
                return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}"><i>无标</i>=${escapeHtml(full)}</span>`;
            }
            const sameLabel = full === abbr;
            const text = sameLabel ? full : `${full}=${abbr}`;
            return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}">${escapeHtml(text)}</span>`;
        })
        .filter(Boolean)
        .join('<span class="panel-grid-hint-sep"> / </span>');

    const terminalPairHtml = [];
    const seenTerminalPair = new Set();
    for (const item of (Array.isArray(terminalHints) ? terminalHints : [])) {
        const hintParts = Array.isArray(item?.hintParts)
            ? item.hintParts
                .map((part) => ({
                    full: toText(part?.full),
                    abbr: toText(part?.abbr),
                    noMarkMode: toText(part?.noMarkMode)
                }))
                .filter((part) => part.full && part.abbr)
            : [];

        if (hintParts.length) {
            for (const part of hintParts) {
                const noMarkMode = part.noMarkMode;
                if (noMarkMode === 'label' || noMarkMode === 'dual') {
                    const nmKey = `nm||${part.full}`;
                    if (!seenTerminalPair.has(nmKey)) {
                        seenTerminalPair.add(nmKey);
                        terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888"><i>无标</i>-${escapeHtml(part.full)}</span>`);
                    }
                }

                if (noMarkMode === 'label') continue;

                const abbrKey = `${part.abbr}||${part.full}`;
                if (seenTerminalPair.has(abbrKey)) continue;
                seenTerminalPair.add(abbrKey);
                terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(part.abbr)}-${escapeHtml(part.full)}</span>`);
            }
            continue;
        }

        const full = toText(item?.full);
        const abbr = toText(item?.abbr);
        if (!full || !abbr) continue;

        const fullParts = full.split(/[\/·]/).map((value) => toText(value)).filter(Boolean);
        const abbrParts = abbr.split(/[\/·]/).map((value) => toText(value)).filter(Boolean);
        const pairLen = Math.max(fullParts.length, abbrParts.length);

        if (pairLen <= 1) {
            const key = `${abbr}||${full}`;
            if (seenTerminalPair.has(key)) continue;
            seenTerminalPair.add(key);
            terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(abbr)}-${escapeHtml(full)}</span>`);
            continue;
        }

        for (let index = 0; index < pairLen; index += 1) {
            const fullPart = toText(fullParts[index] || fullParts[fullParts.length - 1]);
            const abbrPart = toText(abbrParts[index] || abbrParts[abbrParts.length - 1]);
            if (!fullPart || !abbrPart) continue;
            const key = `${abbrPart}||${fullPart}`;
            if (seenTerminalPair.has(key)) continue;
            seenTerminalPair.add(key);
            terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(abbrPart)}-${escapeHtml(fullPart)}</span>`);
        }
    }

    const terminalLegendItems = terminalPairHtml.join('<span class="panel-grid-hint-sep"> / </span>');
    const specialLegendItems = (Array.isArray(specialHints) ? specialHints : [])
        .map((item) => {
            const full = toText(item?.full);
            const abbr = toText(item?.abbr);
            const sp = full.split(' ')[0];
            if (!full || !abbr) return '';
            return `<span class="panel-grid-hint-item panel-grid-hint-item-special" style="color:#888">${escapeHtml(abbr)}-${escapeHtml(sp)}</span>`;
        })
        .filter(Boolean)
        .join('<span class="panel-grid-hint-sep"> / </span>');

    return `
            <div class="panel-grid-hints">
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">种别：</span>
                    <span class="panel-grid-hint-content">${typeLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">终点站：</span>
                    <span class="panel-grid-hint-content">${terminalLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                ${specialLegendItems ? `<div class="panel-grid-hint-line"><span class="panel-grid-hint-label">特殊班次：</span><span class="panel-grid-hint-content">${specialLegendItems}</span></div>` : ''}
            </div>
        `;
};
