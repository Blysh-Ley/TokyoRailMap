/*
 * print-timetables.js
 * 方向班次表导出 PDF（A4）
 */
import { getMacaronColor } from '../../lib/macaron.js';
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
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }

            .timetable-print-card .panel-company-top-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                width: 100%;
                flex-wrap: wrap;
            }

            .timetable-print-card .panel-company-lines {
                margin-top: 0;
                width: 100%;
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
                flex: 0 0 auto;
                white-space: nowrap;
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
            const fileName = `${stationName}_${lineName}_${dirName}时刻.pdf`;
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
        const serviceDay = toText(firstDir.serviceDay) === 'SaturdayHoliday' ? '周六·休息日时刻表' : '平日时刻表';
        const lineSuffixHtml = toText(detail.lineSuffixHtml);
        const stationInfoHtml = toText(detail.stationInfoHtml);
        const lineHeaderHtml = toText(detail.lineHeaderHtml);
        const macaronColor = getMacaronColor(lineColor).macaron;
        

        // 站名和服务日信息部分
        const head = document.createElement('div');
        head.className = 'timetable-print-head';

        head.style.display = 'flex';         
        head.style.justifyContent = 'center';
        head.style.alignItems = 'baseline';  
        head.style.gap = '2px';
        head.style.width = '100%';
        head.style.paddingTop = '15px';
        head.style.paddingBottom = '15px';
        head.style.backgroundColor = lineColor ? `${macaronColor.hex}` : 'transparent';

        const stationTitle = document.createElement('div');
        stationTitle.className = 'panel-name';
        stationTitle.textContent = stationName;
        stationTitle.style.marginBottom = '0';
        stationTitle.style.flex = 'none';
        stationTitle.style.fontSize = '40px';

        let lineSuffix;

        if (lineSuffixHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = lineSuffixHtml;
            
            // 1. 直接定位那个带代码的 badge 元素
            const codeBadge = temp.querySelector('.rw-station-code-badge');
            
            if (codeBadge) {
                lineSuffix = codeBadge.cloneNode(true);
                lineSuffix.style.display = 'inline-flex';
                lineSuffix.style.position = 'static'; 
                lineSuffix.style.margin = '0 4px';   
                lineSuffix.style.flexShrink = '0'; 
                lineSuffix.style.verticalAlign = 'middle';
            }
        }
        
        if (!lineSuffixHtml && stationInfoHtml) {
             const temp = document.createElement('div');
            temp.innerHTML = stationInfoHtml;
            
            // 1. 直接定位那个带代码的 badge 元素
            const codeBadge = temp.querySelector('.rw-station-code-badge');
            
            if (codeBadge) {
                lineSuffix = codeBadge.cloneNode(true);
                
                lineSuffix.style.display = 'inline-flex';
                lineSuffix.style.position = 'static';
                lineSuffix.style.margin = '0 4px';  
                lineSuffix.style.flexShrink = '0';   
                lineSuffix.style.verticalAlign = 'middle';
            }
        }

        const meta = document.createElement('div');
        meta.className = 'timetable-print-meta';
        meta.textContent = serviceDay;
        meta.style.lineHeight = '1';
        meta.style.marginLeft = '0'; 
        meta.style.flex = 'none';
        meta.style.fontSize = '30px';

        head.appendChild(stationTitle);
        if (lineSuffix) head.appendChild(lineSuffix);
        head.appendChild(meta);

        // 公司信息和线路信息部分

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

        const lineHeaderHost = document.createElement('div');
        lineHeaderHost.style.display = 'flex';
        lineHeaderHost.style.alignItems = 'center';
        lineHeaderHost.style.justifyContent = 'center';
        lineHeaderHost.style.flex = '0 0 auto';

        if (lineHeaderHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = lineHeaderHtml;
            const el = temp.firstElementChild;
            if (el) {
                if (lineColor) el.style.color = lineColor;
                lineHeaderHost.appendChild(el);
            }
        } else {
            const lineHeader = document.createElement('div');
            lineHeader.className = 'panel-line-header';
            if (lineColor) lineHeader.style.color = lineColor;
            const lineNameWrap = document.createElement('span');
            lineNameWrap.className = 'panel-line-name';
            const lineNameMain = document.createElement('span');
            lineNameMain.className = 'panel-line-name-main';
            lineNameMain.textContent = lineName;
            lineNameWrap.appendChild(lineNameMain);
            lineHeader.appendChild(lineNameWrap);
            lineHeaderHost.appendChild(lineHeader);
        }

        const companyTopRow = document.createElement('div');
        companyTopRow.className = 'panel-company-top-row';
        companyTopRow.appendChild(companyHeader);
        companyTopRow.appendChild(lineHeaderHost);

        const companyLines = document.createElement('div');
        companyLines.className = 'panel-company-lines';

        const line = document.createElement('div');
        line.className = 'panel-line';
        if (lineColor) line.style.color = lineColor;

        // 停站种别
        if (stationInfoHtml) {
            const temp = document.createElement('div');
            temp.innerHTML = stationInfoHtml;
            const el = temp.querySelector('.panel-station-info-types');
            if (el) line.appendChild(el);
            el.style.display = 'flex';
            el.style.flexWrap = 'wrap';      
            el.style.justifyContent = 'center';
            el.style.alignItems = 'center'; 
            
            // 2. 创建分隔线元素
            const separator = document.createElement('div');
            separator.className = 'print-separator'; // 可以加个类名方便以后调 CSS
            
            // 设置分隔线样式
            separator.style.width = '33%';
            separator.style.marginLeft = '33%';
            separator.style.height = '1px';
            separator.style.backgroundColor =  '#ccc'; 
            separator.style.marginTop = '5px'; // 设置上下间距
            separator.style.marginBottom = '5px';
            separator.style.flexShrink = '0'; // 防止在 flex 布局中被压缩

            // 3. 将分隔线插入到 line 中，它会自动排在 el 的后面
            line.appendChild(separator);
        }

        // 时刻表
        const useGrid = dirs.some(d => toText(d.timetableViewMode) === 'grid');

        if (useGrid && dirs.length >= 1) {
            // Build bidirectional grid layout
            const dirContainer = document.createElement('div');
            dirContainer.className = 'panel-bidirectional-grid';
            
            // Add dual headers
            const headersRow = document.createElement('div');
            headersRow.className = 'panel-bi-headers';
            headersRow.style.display = 'flex';
            headersRow.style.justifyContent = 'space-between';
            headersRow.style.alignItems = 'center';
            headersRow.style.marginBottom = '8px';
            
            const leftDir = dirs[0];
            const rightDir = dirs.length > 1 ? dirs[1] : null;

            // Header for Left Direction (Dir 1)
            const leftHeader = document.createElement('div');
            leftHeader.className = 'panel-dir-header';
            leftHeader.style.flex = '1';
            leftHeader.style.textAlign = 'right';
            leftHeader.style.fontSize = '25px'
            leftHeader.innerHTML = `
                <span class="panel-dir-title">
                    <span class="panel-dir-marquee"><span class="panel-dir-marquee-inner">${toText(leftDir.dirLabel) || toText(leftDir.dirKey) || '未知方向'}</span></span>
                </span>
            `;
            headersRow.appendChild(leftHeader);
            
            // Middle spacer for hours axis
            const headerSpacer = document.createElement('div');
            headerSpacer.style.width = '60px'; // Approx width of panel-grid-hour
            headerSpacer.style.display = 'flex';
            headerSpacer.style.justifyContent = 'center'; // 水平居中
            headerSpacer.style.alignItems = 'center';     // 垂直居中
            const centerLabel = document.createElement('span');
            centerLabel.style.color = '#000'; // 可根据你界面的整体风格调整颜色，或者加粗 fontweight: 'bold'
            centerLabel.style.fontSize = '20px'; 
            centerLabel.style.paddingTop = '2px'; // 微调位置
            centerLabel.textContent = '方向';
            headerSpacer.appendChild(centerLabel);

            headersRow.appendChild(headerSpacer);

            // Header for Right Direction (Dir 2)
            const rightHeader = document.createElement('div');
            rightHeader.className = 'panel-dir-header';
            rightHeader.style.flex = '1';
            rightHeader.style.textAlign = 'left';
            rightHeader.style.fontSize = '25px'
            if (rightDir) {
                rightHeader.innerHTML = `
                    <span class="panel-dir-title">
                        <span class="panel-dir-marquee"><span class="panel-dir-marquee-inner">${toText(rightDir.dirLabel) || toText(rightDir.dirKey) || '未知方向'}</span></span>
                    </span>
                `;
            }
            headersRow.appendChild(rightHeader);
            dirContainer.appendChild(headersRow);

            // 1. 创建一个外层总容器，用于包裹所有的提示行
            const hintsContainer = document.createElement('div');
            hintsContainer.className = 'panel-bi-hints-container';
            hintsContainer.style.marginBottom = '8px';

            // 2. 编写一个辅助函数：将 HTML 字符串解析为节点列表
            function parseHintsHtml(htmlString) {
                if (!htmlString) return [];
                const tempDiv = document.createElement('div');
                // 注意：如果你的 toText 是必须的，保留它。如果原字符串本身就是标准 HTML，可直接赋值 htmlString
                tempDiv.innerHTML = toText(htmlString); 
                return Array.from(tempDiv.querySelectorAll('.panel-grid-hint-line'));
            }

            // 3. 获取左、右两侧的所有行节点
            const leftLines = parseHintsHtml(leftDir.gridHintsHtml);
            const rightLines = parseHintsHtml(rightDir ? rightDir.gridHintsHtml : '');

            // 4. 以左侧的行数为基准，按行进行遍历和拼装
            leftLines.forEach((leftLineEl, index) => {
                // 获取对应的右侧行节点（可能为空）
                const rightLineEl = rightLines[index];

                // --- 提取数据 ---
                
                // 提取标签 (例如 "种别：" -> 去除冒号变成 "种别")
                const labelEl = leftLineEl.querySelector('.panel-grid-hint-label');
                const labelText = labelEl ? labelEl.textContent.replace(/[:：]/g, '').trim() : '';

                // 提取左侧纯内容 (忽略 label 标签，只取 content 内部的 HTML)
                const leftContentEl = leftLineEl.querySelector('.panel-grid-hint-content');
                const leftContentHtml = leftContentEl ? leftContentEl.innerHTML : '';

                // 提取右侧纯内容
                let rightContentHtml = '';
                if (rightLineEl) {
                    const rightContentEl = rightLineEl.querySelector('.panel-grid-hint-content');
                    rightContentHtml = rightContentEl ? rightContentEl.innerHTML : '';
                }

                // --- 构建当前行的 UI ---

                const row = document.createElement('div');
                row.className = 'panel-bi-hint-row';
                row.style.display = 'flex';
                row.style.flexDirection = 'row';
                row.style.alignItems = 'center'; // 核心：保证左右多行时，中间标签始终垂直居中
                row.style.justifyContent = 'space-between';
                row.style.marginBottom = '4px'; // 每行之间的微小间距

                // 构建左侧单元格
                const leftCell = document.createElement('div');
                leftCell.style.flex = '1';
                leftCell.style.textAlign = 'right';
                leftCell.style.fontSize = '18px';
                leftCell.innerHTML = leftContentHtml; // 直接塞入清洗好的纯内容

                // 构建中间标签单元格
                const centerCell = document.createElement('div');
                centerCell.style.width = '60px'; // 保持你设定的中心轴宽度
                centerCell.style.flexShrink = '0';
                centerCell.style.textAlign = 'center';
                centerCell.style.color = '#888';
                centerCell.style.fontSize = '15px';
                centerCell.textContent = labelText; // 直接填入文字，不需要再写复杂的 innerHTML 样式

                // 构建右侧单元格
                const rightCell = document.createElement('div');
                rightCell.style.flex = '1';
                rightCell.style.textAlign = 'left';
                rightCell.style.fontSize = '18px';
                rightCell.innerHTML = rightContentHtml;

                // --- 组装当前行 ---
                row.appendChild(leftCell);
                row.appendChild(centerCell);
                row.appendChild(rightCell);

                // 将组装好的行加入总容器
                hintsContainer.appendChild(row);
            });

            // 5. 最后，将总容器挂载到你的面板上
            dirContainer.appendChild(hintsContainer);

            // Parse grids
            const leftTemp = document.createElement('div');
            leftTemp.innerHTML = toText(leftDir.gridHtml);
            
            const rightTemp = document.createElement('div');
            if (rightDir) {
                rightTemp.innerHTML = toText(rightDir.gridHtml);
            }

            const leftRows = Array.from(leftTemp.querySelectorAll('.panel-grid-row'));
            const rightRows = Array.from(rightTemp.querySelectorAll('.panel-grid-row'));
            
            const hoursSet = new Set();
            const leftByHour = new Map();
            const rightByHour = new Map();
            
            leftRows.forEach(r => {
                const h = r.getAttribute('data-grid-hour');
                if (h) { hoursSet.add(Number(h)); leftByHour.set(Number(h), r); }
            });
            rightRows.forEach(r => {
                const h = r.getAttribute('data-grid-hour');
                if (h) { hoursSet.add(Number(h)); rightByHour.set(Number(h), r); }
            });
            
            const sortedHours = Array.from(hoursSet).sort((a, b) => a - b);

            const gridWrapper = document.createElement('div');
            gridWrapper.className = 'panel-timetable panel-timetable-view-grid is-expanded panel-bidirectional-grid-wrapper';
            gridWrapper.style.width = '100%';
            
            // Build the central axis rows
            const biGrid = document.createElement('div');
            biGrid.className = 'panel-timetable-grid panel-bi-timetable-grid';
            biGrid.style.width = '100%';
            
            
            for (const [index, h] of sortedHours.entries()) {
                const isEven = (index + 1) % 2 === 0;
                const bgColor = ` ${macaronColor.hex}30`;
                const lRow = leftByHour.get(h);
                const rRow = rightByHour.get(h);
                const hourText = lRow ? lRow.querySelector('.panel-grid-hour')?.textContent : rRow.querySelector('.panel-grid-hour')?.textContent;
                
                const classes = new Set(['panel-grid-row', 'panel-bi-grid-row']);
                if (lRow) lRow.classList.forEach(c => classes.add(c));
                if (rRow) rRow.classList.forEach(c => classes.add(c));
                
                const biRow = document.createElement('div');
                biRow.className = Array.from(classes).join(' ');
                biRow.style.display = 'flex';
                biRow.style.flexDirection = 'row';
                biRow.style.alignItems = 'stretch';
                biRow.style.width = '100%';
                biRow.style.boxSizing = 'border-box';
                
                // Left trips (Dir 1) - aligned to right, 10 per row
                const lTrips = document.createElement('div');
                lTrips.className = 'panel-grid-trips bi-grid-trips-left';
                lTrips.style.flex = '1';
                lTrips.style.display = 'grid';
                lTrips.style.gridTemplateColumns = 'repeat(20, minmax(0, 1fr))';
                lTrips.style.overflow = 'hidden';
                lTrips.style.gridAutoRows = 'max-content';
                lTrips.style.gap = '2px';
                lTrips.style.direction = 'rtl';
                lTrips.style.backgroundColor = isEven ? '#f6f6f6' : bgColor;
                
                if (lRow) {
                    const lCells = Array.from(lRow.querySelectorAll('.panel-grid-cell'));
                    lCells.forEach(c => {
                        const clone = c.cloneNode(true);
                        clone.style.direction = 'ltr';
                        if(clone.classList.contains('has-special')) {
                            clone.style.backgroundColor = macaronColor.complementary;
                            clone.style.color = macaronColor.complementaryText;
                        }
                        lTrips.appendChild(clone);
                    });
                }

                // Center Hour
                const cHour = document.createElement('div');
                cHour.className = 'panel-grid-hour bi-grid-hour-center';
                cHour.style.width = '60px';
                cHour.style.flexShrink = '0';
                cHour.style.display = 'flex';
                cHour.style.alignItems = 'center';
                cHour.style.justifyContent = 'center'; // Center the text in the column
                cHour.textContent = hourText || h;
                cHour.style.backgroundColor = macaronColor.ink;
                cHour.style.color = macaronColor.inkText

                // Right trips (Dir 2) - 10 per row
                const rTrips = document.createElement('div');
                rTrips.className = 'panel-grid-trips bi-grid-trips-right';
                rTrips.style.flex = '1';
                rTrips.style.display = 'grid';
                rTrips.style.gridTemplateColumns = 'repeat(20,  minmax(0, 1fr))';
                rTrips.style.overflow = 'hidden';
                rTrips.style.gridAutoRows = 'max-content';
                rTrips.style.gap = '2px';
                rTrips.style.direction = 'ltr';
                rTrips.style.backgroundColor = isEven ? '#f6f6f6' : bgColor;
                if (rRow) {
                    const rCells = Array.from(rRow.querySelectorAll('.panel-grid-cell'));
                    rCells.forEach(c => {
                        const clone = c.cloneNode(true);
                        clone.style.direction = 'ltr';
                        if(clone.classList.contains('has-special')) {
                            clone.style.backgroundColor = macaronColor.complementary;
                            clone.style.color = macaronColor.complementaryText;
                        }
                        rTrips.appendChild(clone);
                    });
                }
                
                biRow.appendChild(lTrips);
                biRow.appendChild(cHour);
                biRow.appendChild(rTrips);
                biGrid.appendChild(biRow);
            }
            
            gridWrapper.appendChild(biGrid);
            dirContainer.appendChild(gridWrapper);
            line.appendChild(dirContainer);

            // Settings for the entire bidirectional grid
            root.style.setProperty('--grid-cols', '15'); // Provide enough space for both sides
            root.style.setProperty('--grid-font-scale', '1');

        }
    company.appendChild(companyTopRow);

    companyLines.appendChild(line);
    company.appendChild(companyLines);

        card.appendChild(head);
        card.appendChild(company);
        root.appendChild(card);

        const forceExpandStyle = document.createElement('style');
        forceExpandStyle.textContent = `
            .timetable-print-root,
            .timetable-print-card,
            .panel-timetable,
            .panel-timetable-view-grid,
            .panel-bidirectional-grid-wrapper,
            .panel-bi-timetable-grid {
                max-height: none !important;
                height: auto !important;
                overflow: visible !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            .timetable-print-root,
            .timetable-print-card {
                border: none !important;
            }
            .panel-bi-grid-row .panel-grid-cell-trip {
                flex: none !important;
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
                aspect-ratio: 1 / 1 !important;
                box-sizing: border-box !important;
                padding: 0 !important;
            }
        `;
        root.appendChild(forceExpandStyle);

        // Required to ensure it works correctly when converted to image
        root.style.width = '2400px'; 
        root.style.maxWidth = 'none';
        root.style.margin = '0';
        root.style.padding = '0';
        root.style.border = 'none';
        
        // Prevent truncation by removing it from the normal document flow
        root.style.position = 'fixed';
        root.style.top = '0';
        root.style.left = '-9999px';
        root.style.zIndex = '-9999';

        return root;
    };

    const exportLineToImage = async (detail = {}) => {
        injectStyles();
        const { html2canvas } = await ensureLibs();

        const root = createLineImageExportDom(detail);
        document.body.appendChild(root);
        console.log('Exporting line image with detail:', detail);
        try {
            const canvas = await html2canvas(root, {
                scale: Math.max(2, window.devicePixelRatio || 1),
                useCORS: true,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
                logging: false,
                width: 2400,
                height: root.scrollHeight,
                windowWidth: 2400,
                windowHeight: root.scrollHeight,
                x: 0,
                y: 0
            });
            const dataUrl = canvas.toDataURL('image/png');
            
            const firstDir = detail.dirs?.[0] || {};
            const stationName = sanitizeFilePart(firstDir.stationName || 'station');
            const lineName = sanitizeFilePart(firstDir.lineName || detail.lineId || 'line');
            const serviceDay = toText(firstDir.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日';
            const fileName = `${stationName}_${lineName}_${serviceDay}时刻表.png`;
            
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
        const fileName = `总时刻表_${stationName}.pdf`;
        pdf.save(fileName);
    };

    const exportAllLinesToPdf = async (detail = {}) => {
        injectStyles();
        const { html2canvas, jsPDF } = await ensureLibs();

        const pages = Array.isArray(detail?.pages) ? detail.pages : [];
        if (!pages.length) return;

        let pdf = null;
        let pageCount = 0;

        const lineGroups = new Map();
        for (const pageDetailRaw of pages) {
            const lineKey = toText(pageDetailRaw?.lineId)
                || toText(pageDetailRaw?.lineName)
                || toText(detail?.lineId)
                || toText(detail?.lineName)
                || `line_${lineGroups.size}`;

            let group = lineGroups.get(lineKey);
            if (!group) {
                group = {
                    lineId: toText(pageDetailRaw?.lineId) || toText(detail?.lineId),
                    lineHeaderHtml: pageDetailRaw?.lineHeaderHtml,
                    lineSuffixHtml: pageDetailRaw?.lineSuffixHtml,
                    stationInfoHtml: pageDetailRaw?.stationInfoHtml,
                    dirs: []
                };
                lineGroups.set(lineKey, group);
            }

            if (Array.isArray(pageDetailRaw?.dirs) && pageDetailRaw.dirs.length) {
                for (const dirRaw of pageDetailRaw.dirs) {
                    const viewMode = toText(dirRaw?.timetableViewMode)
                        || toText(pageDetailRaw?.timetableViewMode)
                        || toText(detail?.timetableViewMode);
                    group.dirs.push({
                        stationName: toText(dirRaw?.stationName) || toText(pageDetailRaw?.stationName) || toText(detail?.stationName),
                        companyName: toText(dirRaw?.companyName) || toText(pageDetailRaw?.companyName) || toText(detail?.companyName),
                        companyLogoSrc: toText(dirRaw?.companyLogoSrc) || toText(pageDetailRaw?.companyLogoSrc) || toText(detail?.companyLogoSrc),
                        lineName: toText(dirRaw?.lineName) || toText(pageDetailRaw?.lineName) || toText(detail?.lineName),
                        lineColor: toText(dirRaw?.lineColor) || toText(pageDetailRaw?.lineColor) || toText(detail?.lineColor),
                        serviceDay: toText(dirRaw?.serviceDay) || toText(pageDetailRaw?.serviceDay) || toText(detail?.serviceDay),
                        dirLabel: toText(dirRaw?.dirLabel) || toText(pageDetailRaw?.dirLabel) || toText(detail?.dirLabel),
                        dirKey: toText(dirRaw?.dirKey) || toText(pageDetailRaw?.dirKey) || toText(detail?.dirKey),
                        timetableViewMode: viewMode,
                        gridHintsHtml: dirRaw?.gridHintsHtml ?? pageDetailRaw?.gridHintsHtml,
                        gridHtml: dirRaw?.gridHtml ?? pageDetailRaw?.gridHtml,
                        listHtml: dirRaw?.listHtml ?? pageDetailRaw?.listHtml
                    });
                }
            } else {
                const viewMode = toText(pageDetailRaw?.timetableViewMode) || toText(detail?.timetableViewMode);
                group.dirs.push({
                    stationName: toText(pageDetailRaw?.stationName) || toText(detail?.stationName),
                    companyName: toText(pageDetailRaw?.companyName) || toText(detail?.companyName),
                    companyLogoSrc: toText(pageDetailRaw?.companyLogoSrc) || toText(detail?.companyLogoSrc),
                    lineName: toText(pageDetailRaw?.lineName) || toText(detail?.lineName),
                    lineColor: toText(pageDetailRaw?.lineColor) || toText(detail?.lineColor),
                    serviceDay: toText(pageDetailRaw?.serviceDay) || toText(detail?.serviceDay),
                    dirLabel: toText(pageDetailRaw?.dirLabel) || toText(detail?.dirLabel),
                    dirKey: toText(pageDetailRaw?.dirKey) || toText(detail?.dirKey),
                    timetableViewMode: viewMode,
                    gridHintsHtml: pageDetailRaw?.gridHintsHtml,
                    gridHtml: pageDetailRaw?.gridHtml,
                    listHtml: pageDetailRaw?.listHtml
                });
            }
        }

        for (const group of lineGroups.values()) {
            if (!group.dirs.length) continue;

            const uniqueDirs = [];
            const seenDirKeys = new Set();
            for (const dirPayload of group.dirs) {
                const key = `${toText(dirPayload.dirKey)}|${toText(dirPayload.dirLabel)}|${toText(dirPayload.timetableViewMode)}`;
                if (seenDirKeys.has(key)) continue;
                seenDirKeys.add(key);
                uniqueDirs.push(dirPayload);
            }

            const pageDetail = {
                lineId: group.lineId,
                lineHeaderHtml: group.lineHeaderHtml,
                lineSuffixHtml: group.lineSuffixHtml,
                stationInfoHtml: group.stationInfoHtml,
                dirs: uniqueDirs
            };

            const root = createLineImageExportDom(pageDetail);
                
            document.body.appendChild(root);

            try {
                const scaleFactor = Math.max(2, window.devicePixelRatio || 1);
                
                const canvas = await html2canvas(root, {
                    scale: scaleFactor,
                    useCORS: true,
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
                    logging: false,
                    width: 2400,
                    height: root.scrollHeight,
                    windowWidth: 2400,
                    windowHeight: root.scrollHeight
                });

                const imgData = canvas.toDataURL('image/png');
                
                const pdfWidth = canvas.width / scaleFactor;
                const pdfHeight = canvas.height / scaleFactor;
                const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';

                if (pageCount === 0) {
                    // 第一页：用第一张图的尺寸初始化 PDF
                    pdf = new jsPDF({
                        orientation: orientation,
                        unit: 'px',
                        format: [pdfWidth, pdfHeight]
                    });
                } else {
                    // 后续页：新建适应当前图片的页面
                    pdf.addPage([pdfWidth, pdfHeight], orientation);
                }

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
                
                pageCount += 1;
            } finally {
                root.remove();
            }
        }

        if (!pageCount || !pdf) return;

        const stationName = sanitizeFilePart(detail.stationName || pages[0]?.stationName || 'station');
        const serviceDay = toText(pages[0]?.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日';
        const fileName = `${stationName}_${serviceDay}总时刻表.pdf`;
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
            await exportAllLinesToPdf(detail);
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
