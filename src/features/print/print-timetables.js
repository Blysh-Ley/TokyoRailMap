/*
 * print-timetables.js
 * 方向班次表导出 PDF（A4）
 */

(() => {
    'use strict';

    const PRINT_EVENT = '__TokyoRailPrintTimetableRequested';
    const PRINT_ALL_EVENT = '__TokyoRailPrintAllTimetablesRequested';
    const PRINT_LINE_IMAGE_EVENT = '__TokyoRailPrintLineTimetableImageRequested';
    const LOADING_CLASS = 'is-printing-timetables';
    const GRID_MIN_COLS = 10;

    const A4_PORTRAIT_ASPECT = 297 / 210;
    const A4_LANDSCAPE_ASPECT = 210 / 297;

    let libsPromise = null;
    let styleInjected = false;

    const toText = (v) => String(v ?? '').trim();

    const nowIsoCompact = () => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return [
            d.getFullYear(),
            pad(d.getMonth() + 1),
            pad(d.getDate()),
            '-',
            pad(d.getHours()),
            pad(d.getMinutes()),
            pad(d.getSeconds())
        ].join('');
    };

    const sanitizeFilePart = (s) => String(s || '')
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_.\-\u4e00-\u9fa5]/g, '_')
        .slice(0, 120);

    const loadScript = (src) => new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-print-lib="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === '1') return resolve();
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
            return;
        }

        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.dataset.printLib = src;
        s.addEventListener('load', () => {
            s.dataset.loaded = '1';
            resolve();
        }, { once: true });
        s.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
        document.head.appendChild(s);
    });

    const ensureLibs = async () => {
        if (libsPromise) return libsPromise;
        libsPromise = (async () => {
            await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
            await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');

            if (!window.html2canvas) throw new Error('html2canvas 未加载');
            if (!window.jspdf?.jsPDF) throw new Error('jsPDF 未加载');

            return {
                html2canvas: window.html2canvas,
                jsPDF: window.jspdf.jsPDF
            };
        })();
        return libsPromise;
    };

    const injectStyles = () => {
        if (styleInjected) return;
        styleInjected = true;

        const style = document.createElement('style');
        style.setAttribute('data-print-timetables-style', '1');
        style.textContent = `
            .timetable-print-root {
                position: fixed;
                left: -100000px;
                top: 0;
                width: 1120px;
                background: transparent;
                z-index: -1;
                pointer-events: none;
            }

            .timetable-print-card {
                background: rgba(255, 255, 255, 0.96);
                border: none;
                border-radius: 0;
                box-shadow: none;
                padding: 12px 14px;
                color: #111;
            }

            .timetable-print-head {
                margin-bottom: 6px;
            }

            .timetable-print-card .panel-name {
                font-size: 24px;
                line-height: 1.25;
                margin-bottom: 4px;
            }

            .timetable-print-meta {
                font-size: 13px;
                color: #555;
                line-height: 1.35;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .timetable-print-card .panel-company {
                margin-top: 6px;
            }

            .timetable-print-card .panel-company-lines {
                margin-top: 2px;
            }

            .timetable-print-card .panel-company-logo {
                pointer-events: none;
            }

            .timetable-print-card .panel-line {
                padding-top: 6px;
                padding-bottom: 4px;
            }

            .timetable-print-card .panel-line-header {
                pointer-events: none;
            }

            .timetable-print-card .panel-line-name {
                pointer-events: none;
                cursor: default;
            }

            .timetable-print-card .panel-dir-header {
                cursor: default;
                user-select: none;
                margin: 4px 0 2px;
            }

            .timetable-print-card .panel-dir-title {
                width: 100%;
            }

            .timetable-print-card .panel-dir-marquee {
                overflow: visible;
            }

            .timetable-print-card .panel-dir-marquee-inner {
                white-space: normal;
            }

            .timetable-print-card .panel-dir-actions,
            .timetable-print-card .panel-dir-print-btn,
            .timetable-print-card .panel-dir-filter-btn,
            .timetable-print-card .panel-dir-triangle {
                display: none !important;
            }

            .timetable-print-content .panel-timetable {
                margin: 0;
                padding-left: 0;
                max-height: none !important;
                overflow: visible !important;
                color: inherit;
            }

            .timetable-print-content .panel-timetable-row,
            .timetable-print-content .panel-grid-cell-trip,
            .timetable-print-content .panel-grid-trip,
            .timetable-print-content .panel-time-label,
            .timetable-print-content .panel-time-arrive,
            .timetable-print-content .panel-time-depart {
                color: inherit;
            }

            .timetable-print-content .panel-timetable-row.is-past,
            .timetable-print-content .panel-grid-cell-trip.is-past,
            .timetable-print-content .panel-grid-trip.is-past,
            .timetable-print-content .panel-time-label.is-past,
            .timetable-print-content .panel-timetable-row.is-past .panel-time-arrive,
            .timetable-print-content .panel-timetable-row.is-past .panel-time-depart {
                color: inherit !important;
                opacity: 1 !important;
                filter: none !important;
            }

            .timetable-print-content .panel-grid-cell-trip {
                flex: 0 0 calc(100% / var(--grid-cols, 10));
                width: calc(100% / var(--grid-cols, 10));
                max-width: calc(100% / var(--grid-cols, 10));
                justify-content: center;
                align-items: center;
                padding-left: 0;
                box-sizing: border-box;
                text-align: center;
            }

            .timetable-print-content .panel-grid-cell {
                justify-content: center;
            }

            .timetable-print-content .panel-grid-trips {
                flex-wrap: wrap !important;
                align-content: flex-start !important;
            }

            .timetable-print-content .panel-grid-row {
                min-height: 44px;
            }

            .timetable-print-content .panel-grid-trip-abbr {
                font-size: calc(13px * var(--grid-font-scale, 1));
            }

            .timetable-print-content .panel-grid-trip-minute {
                font-size: calc(20px * var(--grid-font-scale, 1));
            }

            .timetable-print-content .panel-grid-cell-trip.is-past .panel-grid-trip-minute-flag,
            .timetable-print-content .panel-grid-trip.is-past .panel-grid-trip-minute-flag {
                color: red !important;
            }

            .timetable-print-content .panel-grid-hour {
                font-size: calc(20px * var(--grid-font-scale, 1));
            }

            .timetable-print-content .panel-grid-trip {
                align-items: center;
                justify-content: center;
                text-align: center;
            }

            .timetable-print-root.is-dark .timetable-print-card {
                background: rgba(24, 26, 31, 0.94);
                color: #f2f2f2;
                box-shadow: none;
            }

            .timetable-print-root.is-dark .timetable-print-meta {
                color: #b8bcc3;
            }
        `;
        document.head.appendChild(style);
    };

    const createExportDom = (detail = {}) => {
        const root = document.createElement('div');
        root.className = 'timetable-print-root';

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) root.classList.add('is-dark');

        const card = document.createElement('div');
        card.className = 'timetable-print-card';

        const stationName = toText(detail.stationName) || '未知站点';
        const companyName = toText(detail.companyName) || '未知公司';
        const companyLogoSrc = toText(detail.companyLogoSrc);
        const lineName = toText(detail.lineName) || toText(detail.lineId) || '未知线路';
        const lineColor = toText(detail.lineColor);
        const dirLabel = toText(detail.dirLabel) || toText(detail.dirKey) || '未知方向';
        const serviceDay = toText(detail.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日';
        const lineSuffixHtml = toText(detail.lineSuffixHtml);
        const stationInfoHtml = toText(detail.stationInfoHtml);

        const head = document.createElement('div');
        head.className = 'timetable-print-head';

        const stationTitle = document.createElement('div');
        stationTitle.className = 'panel-name';
        stationTitle.textContent = stationName;

        const meta = document.createElement('div');
        meta.className = 'timetable-print-meta';
        meta.textContent = serviceDay;

        head.appendChild(stationTitle);
        head.appendChild(meta);

        const company = document.createElement('div');
        company.className = 'panel-company';

        const companyHeader = document.createElement('div');
        companyHeader.className = 'panel-company-header';
        if (companyLogoSrc) {
            const logo = document.createElement('img');
            logo.className = 'panel-company-logo';
            logo.alt = '';
            logo.src = companyLogoSrc;
            companyHeader.appendChild(logo);
        }
        const companyNameEl = document.createElement('span');
        companyNameEl.className = 'panel-company-name';
        companyNameEl.textContent = companyName;
        companyHeader.appendChild(companyNameEl);

        const companyLines = document.createElement('div');
        companyLines.className = 'panel-company-lines';

        const line = document.createElement('div');
        line.className = 'panel-line';
        if (lineColor) line.style.color = lineColor;

        const lineHeader = document.createElement('div');
        lineHeader.className = 'panel-line-header';
        const lineNameWrap = document.createElement('span');
        lineNameWrap.className = 'panel-line-name';
        const lineNameMain = document.createElement('span');
        lineNameMain.className = 'panel-line-name-main';
        lineNameMain.textContent = lineName;
        lineNameWrap.appendChild(lineNameMain);
        lineHeader.appendChild(lineNameWrap);

        if (lineSuffixHtml) {
            const suffixHost = document.createElement('div');
            suffixHost.innerHTML = lineSuffixHtml;
            const suffixEl = suffixHost.firstElementChild;
            if (suffixEl) line.appendChild(suffixEl);
        }

        if (stationInfoHtml) {
            const stationInfoHost = document.createElement('div');
            stationInfoHost.innerHTML = stationInfoHtml;
            const stationInfoEl = stationInfoHost.firstElementChild;
            if (stationInfoEl) line.appendChild(stationInfoEl);
        }

        const dir = document.createElement('div');
        dir.className = 'panel-dir';
        const dirHeader = document.createElement('div');
        dirHeader.className = 'panel-dir-header';
        const dirTitle = document.createElement('span');
        dirTitle.className = 'panel-dir-title';
        const dirPrefix = document.createElement('span');
        dirPrefix.className = 'panel-dir-prefix';
        dirPrefix.setAttribute('aria-hidden', 'true');
        dirPrefix.textContent = '往';

        const dirMarquee = document.createElement('span');
        dirMarquee.className = 'panel-dir-marquee';
        dirMarquee.setAttribute('aria-label', `往 ${dirLabel} 方向`);
        const dirMarqueeInner = document.createElement('span');
        dirMarqueeInner.className = 'panel-dir-marquee-inner';
        dirMarqueeInner.textContent = dirLabel;
        dirMarquee.appendChild(dirMarqueeInner);

        const dirSuffix = document.createElement('span');
        dirSuffix.className = 'panel-dir-suffix';
        dirSuffix.setAttribute('aria-hidden', 'true');
        dirSuffix.textContent = '方向';

        dirTitle.appendChild(dirPrefix);
        dirTitle.appendChild(dirMarquee);
        dirTitle.appendChild(dirSuffix);
        dirHeader.appendChild(dirTitle);
        dir.appendChild(dirHeader);

        const content = document.createElement('div');
        content.className = 'timetable-print-content';

        const useGrid = toText(detail.timetableViewMode) === 'grid';
        const hintsHtml = useGrid ? toText(detail.gridHintsHtml) : '';
        const timetableHtml = useGrid ? toText(detail.gridHtml) : toText(detail.listHtml);

        content.innerHTML = `
            ${hintsHtml}
            <div class="panel-timetable ${useGrid ? 'panel-timetable-view-grid' : 'panel-timetable-view-list'} is-expanded">
                ${timetableHtml || '<div class="panel-timetable-empty">当前无班次</div>'}
            </div>
        `;

        dir.appendChild(content);
        line.appendChild(lineHeader);
        line.appendChild(dir);
        companyLines.appendChild(line);
        company.appendChild(companyHeader);
        company.appendChild(companyLines);

        card.appendChild(head);
        card.appendChild(company);

        if (useGrid) {
            // Default: allow wrapping within hour; actual fitting happens after DOM is attached.
            root.style.setProperty('--grid-cols', String(GRID_MIN_COLS));
            root.style.setProperty('--grid-font-scale', '1');
        }

        root.appendChild(card);

        return root;
    };

    const getMaxTripsInHour = (root) => {
        const tripRows = Array.from(root.querySelectorAll('.panel-grid-trips'));
        let maxTripsInHour = 1;
        for (const row of tripRows) {
            const count = row.querySelectorAll('.panel-grid-cell-trip').length;
            if (count > maxTripsInHour) maxTripsInHour = count;
        }
        return maxTripsInHour;
    };

    const fitGridToSinglePage = (root, { pageAspect } = {}) => {
        if (!(root instanceof Element)) return;
        const hasGrid = !!root.querySelector('.panel-timetable-view-grid');
        if (!hasGrid) return;

        const maxTripsInHour = getMaxTripsInHour(root);
        const maxCols = Math.max(GRID_MIN_COLS, Math.min(60, maxTripsInHour));

        const colsCandidates = [];
        for (let c = GRID_MIN_COLS; c <= Math.min(maxCols, 30); c += 1) colsCandidates.push(c);
        for (const c of [36, 42, 48, 54, 60]) {
            if (c <= maxCols && !colsCandidates.includes(c)) colsCandidates.push(c);
        }

        const fontScaleCandidates = [
            1,
            0.95,
            0.9,
            0.85,
            0.8,
            0.75,
            0.72,
            0.7,
            0.66,
            0.64,
            0.6,
            0.58
        ];

        const targetAspect = Number.isFinite(pageAspect) ? pageAspect * 0.98 : A4_PORTRAIT_ASPECT * 0.98;

        const measureAspect = () => {
            const rect = root.getBoundingClientRect();
            const w = Math.max(1, rect.width);
            const h = Math.max(1, rect.height);
            return h / w;
        };

        let best = null;
        for (const fontScale of fontScaleCandidates) {
            for (const cols of colsCandidates) {
                root.style.setProperty('--grid-cols', String(cols));
                root.style.setProperty('--grid-font-scale', String(fontScale));
                // Force layout.
                void root.offsetHeight;
                if (measureAspect() <= targetAspect) {
                    best = { cols, fontScale };
                    break;
                }
            }
            if (best) break;
        }

        if (!best) {
            best = {
                cols: Math.min(maxCols, 60),
                fontScale: fontScaleCandidates[fontScaleCandidates.length - 1]
            };
        }

        root.style.setProperty('--grid-cols', String(best.cols));
        root.style.setProperty('--grid-font-scale', String(best.fontScale));
    };

    const exportToPdf = async (detail = {}) => {
        injectStyles();
        const { html2canvas, jsPDF } = await ensureLibs();

        const root = createExportDom(detail);
        document.body.appendChild(root);

        const isGrid = toText(detail.timetableViewMode) === 'grid';
        if (isGrid) fitGridToSinglePage(root, { pageAspect: A4_PORTRAIT_ASPECT });

        try {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const canvas = await html2canvas(root, {
                scale: Math.max(2, window.devicePixelRatio || 1),
                useCORS: true,
                backgroundColor: null,
                logging: false
            });

            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();

            if (isGrid) {
                const dataUrl = canvas.toDataURL('image/png');
                const imgWmm = pageW;
                const imgHmm = (canvas.height * imgWmm) / canvas.width;
                const fitScale = Math.min(1, pageH / imgHmm);
                const drawW = imgWmm * fitScale;
                const drawH = imgHmm * fitScale;
                const offsetX = (pageW - drawW) / 2;
                const offsetY = (pageH - drawH) / 2;
                pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
            } else {
                const pagePxH = (canvas.width * pageH) / pageW;
                let renderedPx = 0;
                let pageIndex = 0;

                while (renderedPx < canvas.height - 1) {
                    const slicePxH = Math.min(pagePxH, canvas.height - renderedPx);
                    const pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = Math.max(1, Math.floor(slicePxH));
                    const ctx = pageCanvas.getContext('2d');
                    if (!ctx) break;

                    ctx.drawImage(
                        canvas,
                        0,
                        renderedPx,
                        canvas.width,
                        slicePxH,
                        0,
                        0,
                        canvas.width,
                        slicePxH
                    );

                    const dataUrl = pageCanvas.toDataURL('image/png');
                    const sliceMmH = (slicePxH * pageW) / canvas.width;

                    if (pageIndex > 0) pdf.addPage();
                    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, sliceMmH, undefined, 'FAST');

                    renderedPx += slicePxH;
                    pageIndex += 1;
                }
            }

            const stationName = sanitizeFilePart(detail.stationName || 'station');
            const lineName = sanitizeFilePart(detail.lineName || detail.lineId || 'line');
            const dirName = sanitizeFilePart(detail.dirLabel || detail.dirKey || 'dir');
            const fileName = `timetable_${stationName}_${lineName}_${dirName}_${nowIsoCompact()}.pdf`;
            pdf.save(fileName);
        } finally {
            root.remove();
        }
    };

    const addCanvasAsSinglePage = (pdf, canvas, { appendPage = false } = {}) => {
        if (!canvas) return;
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const dataUrl = canvas.toDataURL('image/png');
        const imgWmm = pageW;
        const imgHmm = (canvas.height * imgWmm) / canvas.width;
        const fitScale = Math.min(1, pageH / imgHmm);
        const drawW = imgWmm * fitScale;
        const drawH = imgHmm * fitScale;
        const offsetX = (pageW - drawW) / 2;
        const offsetY = (pageH - drawH) / 2;
        if (appendPage) pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
    };

    const addCanvasAsPagedSlices = (pdf, canvas, { appendPage = false } = {}) => {
        if (!canvas) return 0;

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const pagePxH = (canvas.width * pageH) / pageW;

        let renderedPx = 0;
        let pageIndex = 0;

        while (renderedPx < canvas.height - 1) {
            const slicePxH = Math.min(pagePxH, canvas.height - renderedPx);
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = Math.max(1, Math.floor(slicePxH));
            const ctx = pageCanvas.getContext('2d');
            if (!ctx) break;

            ctx.drawImage(
                canvas,
                0,
                renderedPx,
                canvas.width,
                slicePxH,
                0,
                0,
                canvas.width,
                slicePxH
            );

            const dataUrl = pageCanvas.toDataURL('image/png');
            const sliceMmH = (slicePxH * pageW) / canvas.width;

            if ((appendPage && pageIndex === 0) || pageIndex > 0) pdf.addPage();
            pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, sliceMmH, undefined, 'FAST');

            renderedPx += slicePxH;
            pageIndex += 1;
        }

        return pageIndex;
    };

    const createLineImageExportDom = (detail = {}) => {
        const root = document.createElement('div');
        root.className = 'timetable-print-root';

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) root.classList.add('is-dark');

        const card = document.createElement('div');
        card.className = 'timetable-print-card';

        const dirs = Array.isArray(detail.dirs) ? detail.dirs : [];
        const firstDir = dirs[0] || {};
        
        const stationName = toText(firstDir.stationName) || '未知站点';
        const companyName = toText(firstDir.companyName) || '未知公司';
        const companyLogoSrc = toText(firstDir.companyLogoSrc);
        const lineName = toText(firstDir.lineName) || toText(detail.lineId) || '未知线路';
        const lineColor = toText(firstDir.lineColor);
        const serviceDay = toText(firstDir.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日';

        const head = document.createElement('div');
        head.className = 'timetable-print-head';

        const stationTitle = document.createElement('div');
        stationTitle.className = 'panel-name';
        stationTitle.textContent = stationName;

        const meta = document.createElement('div');
        meta.className = 'timetable-print-meta';
        meta.textContent = serviceDay;

        head.appendChild(stationTitle);
        head.appendChild(meta);

        const company = document.createElement('div');
        company.className = 'panel-company';

        const companyHeader = document.createElement('div');
        companyHeader.className = 'panel-company-header';
        if (companyLogoSrc) {
            const logo = document.createElement('img');
            logo.className = 'panel-company-logo';
            logo.alt = '';
            logo.src = companyLogoSrc;
            companyHeader.appendChild(logo);
        }
        const companyNameEl = document.createElement('span');
        companyNameEl.className = 'panel-company-name';
        companyNameEl.textContent = companyName;
        companyHeader.appendChild(companyNameEl);

        const companyLines = document.createElement('div');
        companyLines.className = 'panel-company-lines';

        const line = document.createElement('div');
        line.className = 'panel-line';
        if (lineColor) line.style.color = lineColor;

        const lineHeaderHtml = toText(detail.lineHeaderHtml);
        const lineSuffixHtml = toText(detail.lineSuffixHtml);
        const stationInfoHtml = toText(detail.stationInfoHtml);

        if (lineHeaderHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = lineHeaderHtml;
            const el = temp.firstElementChild;
            if (el) line.appendChild(el);
        } else {
            const lineHeader = document.createElement('div');
            lineHeader.className = 'panel-line-header';
            const lineNameWrap = document.createElement('span');
            lineNameWrap.className = 'panel-line-name';
            const lineNameMain = document.createElement('span');
            lineNameMain.className = 'panel-line-name-main';
            lineNameMain.textContent = lineName;
            lineNameWrap.appendChild(lineNameMain);
            lineHeader.appendChild(lineNameWrap);
            line.appendChild(lineHeader);
        }

        if (lineSuffixHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = lineSuffixHtml;
            const el = temp.firstElementChild;
            if (el) line.appendChild(el);
        }

        if (stationInfoHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = stationInfoHtml;
            const el = temp.firstElementChild;
            if (el) line.appendChild(el);
        }

        for (const dirPayload of dirs) {
            const dir = document.createElement('div');
            dir.className = 'panel-dir';
            
            const dirLabel = toText(dirPayload.dirLabel) || toText(dirPayload.dirKey) || '未知方向';
            const dirHeader = document.createElement('div');
            dirHeader.className = 'panel-dir-header';
            const dirTitle = document.createElement('span');
            dirTitle.className = 'panel-dir-title';
            const dirPrefix = document.createElement('span');
            dirPrefix.className = 'panel-dir-prefix';
            dirPrefix.setAttribute('aria-hidden', 'true');
            dirPrefix.textContent = '往';

            const dirMarquee = document.createElement('span');
            dirMarquee.className = 'panel-dir-marquee';
            dirMarquee.setAttribute('aria-label', `往 ${dirLabel} 方向`);
            const dirMarqueeInner = document.createElement('span');
            dirMarqueeInner.className = 'panel-dir-marquee-inner';
            dirMarqueeInner.textContent = dirLabel;
            dirMarquee.appendChild(dirMarqueeInner);

            const dirSuffix = document.createElement('span');
            dirSuffix.className = 'panel-dir-suffix';
            dirSuffix.setAttribute('aria-hidden', 'true');
            dirSuffix.textContent = '方向';

            dirTitle.appendChild(dirPrefix);
            dirTitle.appendChild(dirMarquee);
            dirTitle.appendChild(dirSuffix);
            dirHeader.appendChild(dirTitle);
            dir.appendChild(dirHeader);

            const content = document.createElement('div');
            content.className = 'timetable-print-content';

            const useGrid = toText(dirPayload.timetableViewMode) === 'grid';
            const hintsHtml = useGrid ? toText(dirPayload.gridHintsHtml) : '';
            const timetableHtml = useGrid ? toText(dirPayload.gridHtml) : toText(dirPayload.listHtml);

            content.innerHTML = `
                ${hintsHtml}
                <div class="panel-timetable ${useGrid ? 'panel-timetable-view-grid' : 'panel-timetable-view-list'} is-expanded">
                    ${timetableHtml || '<div class="panel-timetable-empty">当前无班次</div>'}
                </div>
            `;

            dir.appendChild(content);
            line.appendChild(dir);
            
            if (useGrid) {
                // Fixed to 10 trips per row as requested
                root.style.setProperty('--grid-cols', '10');
                root.style.setProperty('--grid-font-scale', '1');
            }
        }

        companyLines.appendChild(line);
        company.appendChild(companyHeader);
        company.appendChild(companyLines);

        card.appendChild(head);
        card.appendChild(company);
        root.appendChild(card);

        // Required to ensure it works correctly when converted to image
        root.style.width = '1000px'; 
        root.style.maxWidth = 'none';

        return root;
    };

    const exportLineToImage = async (detail = {}) => {
        injectStyles();
        const { html2canvas } = await ensureLibs();

        const root = createLineImageExportDom(detail);
        document.body.appendChild(root);

        try {
            const canvas = await html2canvas(root, {
                scale: Math.max(2, window.devicePixelRatio || 1),
                useCORS: true,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
                logging: false
            });
            const dataUrl = canvas.toDataURL('image/png');
            
            const firstDir = detail.dirs?.[0] || {};
            const stationName = sanitizeFilePart(firstDir.stationName || 'station');
            const lineName = sanitizeFilePart(firstDir.lineName || detail.lineId || 'line');
            const fileName = `timetable_${stationName}_${lineName}_${nowIsoCompact()}.png`;
            
            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
        } finally {
            root.remove();
        }
    };

    const exportAllDirectionsToPdf = async (detail = {}) => {
        injectStyles();
        const { html2canvas, jsPDF } = await ensureLibs();

        const pages = Array.isArray(detail?.pages) ? detail.pages : [];
        if (!pages.length) return;

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        let pageCount = 0;
        for (const pageDetailRaw of pages) {
            const viewMode = toText(pageDetailRaw?.timetableViewMode) || toText(detail?.timetableViewMode);
            const pageDetail = {
                ...pageDetailRaw,
                stationName: toText(pageDetailRaw?.stationName) || toText(detail?.stationName),
                serviceDay: toText(pageDetailRaw?.serviceDay) || toText(detail?.serviceDay),
                timetableViewMode: viewMode
            };

            const root = createExportDom(pageDetail);
            document.body.appendChild(root);
            try {
                const isGrid = toText(pageDetail.timetableViewMode) === 'grid';
                if (isGrid) fitGridToSinglePage(root, { pageAspect: A4_PORTRAIT_ASPECT });
                const canvas = await html2canvas(root, {
                    scale: Math.max(2, window.devicePixelRatio || 1),
                    useCORS: true,
                    backgroundColor: null,
                    logging: false
                });

                if (isGrid) {
                    addCanvasAsSinglePage(pdf, canvas, { appendPage: pageCount > 0 });
                    pageCount += 1;
                } else {
                    pageCount += addCanvasAsPagedSlices(pdf, canvas, { appendPage: pageCount > 0 });
                }
            } finally {
                root.remove();
            }
        }

        if (!pageCount) return;

        const stationName = sanitizeFilePart(detail.stationName || pages[0]?.stationName || 'station');
        const fileName = `timetable_all_${stationName}_${nowIsoCompact()}.pdf`;
        pdf.save(fileName);
    };

    const onPrintRequest = async (evt) => {
        const detail = evt?.detail || {};
        const lineId = toText(detail.lineId);
        const dirKey = toText(detail.dirKey);
        const target = (lineId && dirKey)
            ? document.querySelector(`.panel-dir-print-btn[data-dir-print-btn][data-line-id="${CSS.escape(lineId)}"][data-dir-key="${CSS.escape(dirKey)}"]`)
            : document.querySelector('.panel-dir-print-btn[data-dir-print-btn]');

        try {
            if (target instanceof Element) {
                target.classList.add(LOADING_CLASS);
                target.setAttribute('aria-busy', 'true');
            }
            await exportToPdf(detail);
        } catch (err) {
            console.error('[print-timetables] 导出失败', err);
            alert('导出 PDF 失败，请稍后重试。');
        } finally {
            if (target instanceof Element) {
                target.classList.remove(LOADING_CLASS);
                target.removeAttribute('aria-busy');
            }
        }
    };

    const onPrintAllRequest = async (evt) => {
        const detail = evt?.detail || {};
        const target = document.querySelector('.panel-day-print-btn[data-day-print-btn]');

        try {
            if (target instanceof Element) {
                target.classList.add(LOADING_CLASS);
                target.setAttribute('aria-busy', 'true');
            }
            await exportAllDirectionsToPdf(detail);
        } catch (err) {
            console.error('[print-timetables] 全量导出失败', err);
            alert('导出全部方向 PDF 失败，请稍后重试。');
        } finally {
            if (target instanceof Element) {
                target.classList.remove(LOADING_CLASS);
                target.removeAttribute('aria-busy');
            }
        }
    };

    const onPrintLineImageRequest = async (evt) => {
        const detail = evt?.detail || {};
        const lineId = toText(detail.lineId);
        const target = lineId
            ? document.querySelector(`.panel-dir-print-btn[data-dir-print-btn][data-line-id="${CSS.escape(lineId)}"]`)
            : document.querySelector('.panel-dir-print-btn[data-dir-print-btn]');

        try {
            if (target instanceof Element) {
                target.classList.add(LOADING_CLASS);
                target.setAttribute('aria-busy', 'true');
            }
            await exportLineToImage(detail);
        } catch (err) {
            console.error('[print-timetables] 导出图片失败', err);
            alert('导出图片失败，请稍后重试。');
        } finally {
            if (target instanceof Element) {
                target.classList.remove(LOADING_CLASS);
                target.removeAttribute('aria-busy');
            }
        }
    };

    window.addEventListener(PRINT_EVENT, onPrintRequest);
    window.addEventListener(PRINT_ALL_EVENT, onPrintAllRequest);
    window.addEventListener(PRINT_LINE_IMAGE_EVENT, onPrintLineImageRequest);
})();
