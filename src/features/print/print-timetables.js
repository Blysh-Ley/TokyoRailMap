/*
 * print-timetables.js
 * 方向班次表导出 PDF（A4）
 */
import { getCachedJson } from '../../lib/fetch.js';
import { resolveTimetablePrintPalette } from '../../lib/timetable-print-palette.js';
import {
    shareOrDownloadArtifact,
    shareOrSaveImageArtifact
} from '../../services/nativeExportShareService.js';
(() => {
    'use strict';

    const PRINT_EVENT = '__TokyoRailPrintTimetableRequested';
    const PRINT_ALL_EVENT = '__TokyoRailPrintAllTimetablesRequested';
    const PRINT_LINE_IMAGE_EVENT = '__TokyoRailPrintLineTimetableImageRequested';
    const ROUTE_MAP_LINE_TIMETABLES_PRINT_EVENT = '__TokyoRailRouteMapLineTimetablesPrintRequested';
    const LOADING_CLASS = 'is-printing-timetables';
    const GRID_MIN_COLS = 10;

    const A4_PORTRAIT_ASPECT = 297 / 210;
    const A4_LANDSCAPE_ASPECT = 210 / 297;

    let libsPromise = null;
    let styleInjected = false;

    const toText = (v) => String(v ?? '').trim();
    const PRINT_SERVICE_DAY_ORDER = ['Weekday', 'SaturdayHoliday'];
    const PRINT_SERVICE_DAY_LABELS = {
        Weekday: '\u5e73\u65e5',
        SaturdayHoliday: '\u5468\u516d\u30fb\u8282\u5047\u65e5'
    };
    const getPrintServiceDayLabel = (serviceDay) => (
        PRINT_SERVICE_DAY_LABELS[toText(serviceDay)] || toText(serviceDay) || '\u672a\u77e5'
    );

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

    const savePdfArtifact = async (pdf, fileName, {
        dialogTitle = '分享时刻表 PDF'
    } = {}) => {
        if (!pdf) return;
        if (typeof pdf.output !== 'function') {
            pdf.save(fileName);
            return;
        }
        const blob = pdf.output('blob');
        await shareOrDownloadArtifact({
            blob,
            filename: fileName,
            mimeType: 'application/pdf',
            title: 'TokyoRailMap',
            dialogTitle,
            fallbackDownload: () => pdf.save(fileName)
        });
    };

    const canvasToPngBlob = (canvas) => new Promise((resolve, reject) => {
        try {
            canvas?.toBlob?.((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('toBlob returned an empty png'));
            }, 'image/png');
        } catch (error) {
            reject(error);
        }
    });

    const isIosNativeRuntime = () => {
        const capacitor = window?.Capacitor;
        try {
            if (typeof capacitor?.getPlatform === 'function') {
                return String(capacitor.getPlatform()).toLowerCase() === 'ios'
                    && (typeof capacitor.isNativePlatform !== 'function' || capacitor.isNativePlatform() === true);
            }
        } catch {
            return false;
        }
        return false;
    };

    const resolveLineImageCaptureOptions = (root) => {
        const width = Math.max(1, Math.ceil(root?.scrollWidth || root?.getBoundingClientRect?.().width || 1));
        const height = Math.max(1, Math.ceil(root?.scrollHeight || root?.getBoundingClientRect?.().height || 1));
        const baseScale = Math.max(2, window.devicePixelRatio || 1);
        const maxPixels = isIosNativeRuntime() ? 14000000 : 32000000;
        const pixelBudgetScale = Math.sqrt(maxPixels / Math.max(1, width * height));
        const scale = Math.max(1, Math.min(baseScale, pixelBudgetScale));

        return {
            scale,
            width,
            height,
            windowWidth: width,
            windowHeight: height,
            x: 0,
            y: 0
        };
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const normalizeArrayLike = (value) => {
        if (Array.isArray(value)) return value;
        return value == null ? [] : [value];
    };

    const routePrintDataCache = {
        railways: null
    };

    const loadRoutePrintRailwaysIndex = async () => {
        if (routePrintDataCache.railways) return routePrintDataCache.railways;
        routePrintDataCache.railways = (async () => {
            const list = await getCachedJson('./data/railways.json');
            const map = new Map();
            for (const item of Array.isArray(list) ? list : []) {
                const id = toText(item?.id);
                if (!id) continue;
                map.set(id, {
                    id,
                    stationIds: normalizeArrayLike(item?.stations).map((x) => toText(x)).filter(Boolean)
                });
            }
            return map;
        })();
        return routePrintDataCache.railways;
    };

    const resolveRouteMapLineStationIds = async (lineId) => {
        const id = toText(lineId);
        if (!id) return [];

        const railwaysIndex = await loadRoutePrintRailwaysIndex();
        const lineMeta = railwaysIndex.get(id) || {};
        const stationIds = Array.isArray(lineMeta.stationIds) ? lineMeta.stationIds : [];
        return stationIds.slice();
    };

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
        const printTitleTextColor = isDark ? '#f2f2f2' : '#111';

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
        companyNameEl.style.setProperty('font-size', '30px', 'important');
        companyNameEl.style.setProperty('font-weight', 'bold', 'important');
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
        lineNameMain.style.setProperty('font-size', '30px', 'important');
        lineNameMain.style.setProperty('font-weight', 'bold', 'important');
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
        dirTitle.style.color = printTitleTextColor;
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
                format: 'a4',
                compress: true
            });

            const canvas = await html2canvas(root, {
                scale: Math.max(1.5, Math.min(2, window.devicePixelRatio || 1)),
                useCORS: true,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
                logging: false
            });

            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();

            if (isGrid) {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
                const imgWmm = pageW;
                const imgHmm = (canvas.height * imgWmm) / canvas.width;
                const fitScale = Math.min(1, pageH / imgHmm);
                const drawW = imgWmm * fitScale;
                const drawH = imgHmm * fitScale;
                const offsetX = (pageW - drawW) / 2;
                const offsetY = (pageH - drawH) / 2;
                pdf.addImage(dataUrl, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'MEDIUM');
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

                    const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.86);
                    const sliceMmH = (slicePxH * pageW) / canvas.width;

                    if (pageIndex > 0) pdf.addPage();
                    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, sliceMmH, undefined, 'MEDIUM');

                    renderedPx += slicePxH;
                    pageIndex += 1;
                }
            }

            const stationName = sanitizeFilePart(detail.stationName || 'station');
            const lineName = sanitizeFilePart(detail.lineName || detail.lineId || 'line');
            const dirName = sanitizeFilePart(detail.dirLabel || detail.dirKey || 'dir');
            const fileName = `${stationName}_${lineName}_${dirName}时刻.pdf`;
            await savePdfArtifact(pdf, fileName);
        } finally {
            root.remove();
        }
    };

    const addCanvasAsSinglePage = (pdf, canvas, { appendPage = false } = {}) => {
        if (!canvas) return;
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        const imgWmm = pageW;
        const imgHmm = (canvas.height * imgWmm) / canvas.width;
        const fitScale = Math.min(1, pageH / imgHmm);
        const drawW = imgWmm * fitScale;
        const drawH = imgHmm * fitScale;
        const offsetX = (pageW - drawW) / 2;
        const offsetY = (pageH - drawH) / 2;
        if (appendPage) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'MEDIUM');
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

            const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.86);
            const sliceMmH = (slicePxH * pageW) / canvas.width;

            if ((appendPage && pageIndex === 0) || pageIndex > 0) pdf.addPage();
            pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, sliceMmH, undefined, 'MEDIUM');

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
        const printTitleTextColor = isDark ? '#f2f2f2' : '#111';

        const card = document.createElement('div');
        card.className = 'timetable-print-card';

        let dirs = Array.isArray(detail.dirs) ? detail.dirs : [];
        const triggerDir = dirs[0] || {};
        const serviceDayVariants = Array.isArray(triggerDir?.serviceDayVariants) ? triggerDir.serviceDayVariants : [];
        const shouldRenderServiceDayPair = !detail.disableServiceDayPair && dirs.length === 1 && serviceDayVariants.length >= 2;
        if (shouldRenderServiceDayPair) {
            dirs = PRINT_SERVICE_DAY_ORDER
                .map((serviceDay) => serviceDayVariants.find((item) => toText(item?.serviceDay) === serviceDay))
                .filter(Boolean)
                .map((item) => ({
                    ...triggerDir,
                    ...item,
                    dirLabel: getPrintServiceDayLabel(item?.serviceDay),
                    sourceDirLabel: toText(triggerDir?.dirLabel) || toText(triggerDir?.dirKey)
                }));
        }
        const firstDir = dirs[0] || triggerDir || {};
        
        const stationName = toText(firstDir.stationName) || '未知站点';
        const companyName = toText(firstDir.companyName) || '未知公司';
        const companyLogoSrc = toText(firstDir.companyLogoSrc);
        const lineName = toText(firstDir.lineName) || toText(detail.lineId) || '未知线路';
        const lineColor = toText(firstDir.lineColor);
        const baseDirLabel = toText(firstDir.sourceDirLabel) || toText(triggerDir?.dirLabel) || toText(firstDir.dirLabel) || toText(firstDir.dirKey);
        const serviceDay = toText(firstDir.serviceDayLabel) || (shouldRenderServiceDayPair
            ? `${baseDirLabel ? `${baseDirLabel}\u65b9\u5411 / ` : ''}\u5e73\u65e5\u30fb\u5468\u516d\u30fb\u8282\u5047\u65e5\u6642\u523b\u8868`
            : (toText(firstDir.serviceDay) === 'SaturdayHoliday' ? '周六·休息日时刻表' : '平日时刻表'));
        const lineSuffixHtml = toText(detail.lineSuffixHtml);
        const stationInfoHtml = toText(detail.stationInfoHtml);
        const lineHeaderHtml = toText(detail.lineHeaderHtml);
        const timetablePalette = resolveTimetablePrintPalette({
            lineColor,
            serviceDayColorMode: detail.serviceDayColorMode,
            isDarkTheme: isDark
        });
        const {
            serviceDayAccentColor,
            serviceDayAccentTextColor,
            serviceDayHourColor,
            serviceDayHourTextColor,
            specialTripColor,
            specialTripTextColor
        } = timetablePalette;
        

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
        head.style.backgroundColor = lineColor ? serviceDayAccentColor : 'transparent';
        head.style.color = lineColor ? serviceDayAccentTextColor : '';

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
        meta.style.lineHeight = '1.1';
        meta.style.marginLeft = '0'; 
        meta.style.flex = 'none';
        meta.style.fontSize = '30px';
        meta.style.fontWeight = '700';
        meta.style.transform = 'translate(0,0)';

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
            separator.style.width = '24%';
            separator.style.marginLeft = '38%';
            separator.style.height = '1px';
            separator.style.backgroundColor =  '#ccc'; 
            separator.style.marginTop = '10px'; // 设置上下间距
            separator.style.marginBottom = '5px';
            separator.style.flexShrink = '0'; // 防止在 flex 布局中被压缩

            // 3. 将分隔线插入到 line 中，它会自动排在 el 的后面
            line.appendChild(separator);
        }

        // 时刻表
        const useGrid = dirs.some(d => toText(d.timetableViewMode) === 'grid');
        
        const detailGridNumber = Number(detail.globalGridNumber);
        const hasGlobalGridNumber = Number.isFinite(detailGridNumber) && detailGridNumber > 0;
        let gridNumber = hasGlobalGridNumber ? detailGridNumber : 10;
        const globalGridRowsByHour = detail.globalGridRowsByHour || {};
        const globalGridHourLabels = detail.globalGridHourLabels || {};
        const globalGridHours = Array.isArray(detail.globalGridHours)
            ? detail.globalGridHours.map((h) => Number(h)).filter(Number.isFinite)
            : [];

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
            leftHeader.style.color = printTitleTextColor;
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
            centerLabel.style.color = printTitleTextColor;
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
            rightHeader.style.color = printTitleTextColor;
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
                row.style.marginBottom = '8px'; // 每行之间的微小间距

                // 构建左侧单元格
                const leftCell = document.createElement('div');
                leftCell.style.flex = '1';
                leftCell.style.textAlign = 'right';
                leftCell.style.fontSize = '18px';
                leftCell.innerHTML = leftContentHtml; // 直接塞入清洗好的纯内容

                // 构建中间标签单元格
                const centerCell = document.createElement('div');
                centerCell.style.width = '80px'; // 保持你设定的中心轴宽度
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
            
            const sortedHours = globalGridHours.length
                ? globalGridHours.slice().sort((a, b) => a - b)
                : Array.from(hoursSet).sort((a, b) => a - b);
            const halfSortedHoursCount = Math.floor(sortedHours.length / 3);

            const gridWrapper = document.createElement('div');
            gridWrapper.className = 'panel-timetable panel-timetable-view-grid is-expanded panel-bidirectional-grid-wrapper';
            gridWrapper.style.width = '100%';
            
            // Build the central axis rows
            const biGrid = document.createElement('div');
            biGrid.className = 'panel-timetable-grid panel-bi-timetable-grid';
            biGrid.style.width = '100%';
            let lcountsGreater10 = 0, rcountsGreater10 = 0;
            let lcountsGreater15 = 0, rcountsGreater15 = 0;


            if (!hasGlobalGridNumber) {
                for (const h of sortedHours) {
                    const lRow = leftByHour.get(h);
                    const rRow = rightByHour.get(h);
                    const classes = new Set(['panel-grid-row', 'panel-bi-grid-row']);
                    if (lRow) lRow.classList.forEach(c => classes.add(c));
                    if (rRow) rRow.classList.forEach(c => classes.add(c));
                    if (lRow) {
                        const lCells = Array.from(lRow.querySelectorAll('.panel-grid-cell'));
                        if (lCells.length > 10) lcountsGreater10++;
                        if (lCells.length > 15) lcountsGreater15++;
                    }
                    if (rRow) {
                        const rCells = Array.from(rRow.querySelectorAll('.panel-grid-cell'));
                        if (rCells.length > 10) rcountsGreater10++;
                        if (rCells.length > 15) rcountsGreater15++;
                    }
                }

                if (lcountsGreater10 > halfSortedHoursCount || rcountsGreater10 > halfSortedHoursCount) {
                    gridNumber = 15;
                }

                if (lcountsGreater15 > halfSortedHoursCount || rcountsGreater15 > halfSortedHoursCount) {
                    gridNumber = 20;
                }
            }

            const headerRow = document.createElement('div');
            headerRow.style.display = 'flex';
            headerRow.style.flexDirection = 'row';
            headerRow.style.alignItems = 'stretch';
            headerRow.style.width = '100%';
            headerRow.style.height = '60px';
            headerRow.style.boxSizing = 'border-box';
            headerRow.style.fontWeight = 'bold'; // 标题行加粗

            const createTitleCell = (text) => {
                const cell = document.createElement('div');
                cell.style.width = '100%';
                cell.style.display = 'flex';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';
                cell.textContent = text;
                return cell;
            };

            
            const bgColorHead = timetablePalette.gridHeaderTripsColor;
            const rightBgColorHead = shouldRenderServiceDayPair ? timetablePalette.rightGridHeaderTripsColor : bgColorHead;
            const rightPaneTextColor = shouldRenderServiceDayPair ? timetablePalette.rightPaneTextColor : serviceDayAccentTextColor;

            // 1. 左侧标题区 (分钟)
            const lHeaderTrips = document.createElement('div');
            lHeaderTrips.style.flex = '1';
            lHeaderTrips.style.display = 'flex';
            lHeaderTrips.style.alignItems = 'center';
            lHeaderTrips.style.justifyContent = 'flex-start'; 
            lHeaderTrips.style.direction = 'rtl'; // 保持和内容行一致的对齐方向
            lHeaderTrips.style.backgroundColor = bgColorHead; 
            lHeaderTrips.style.color = serviceDayAccentTextColor;
            lHeaderTrips.textContent = '分';
            lHeaderTrips.style.fontSize = '20px';
            lHeaderTrips.style.paddingRight = '20px'; 


            // 2. 中间标题区 (小时)
            const cHeaderHour = document.createElement('div');
            cHeaderHour.style.width = '60px';
            cHeaderHour.style.flexShrink = '0';
            cHeaderHour.style.display = 'flex';
            cHeaderHour.style.alignItems = 'center';
            cHeaderHour.style.justifyContent = 'center';
            cHeaderHour.textContent = '时';
            cHeaderHour.style.backgroundColor = serviceDayHourColor;
            cHeaderHour.style.color = serviceDayHourTextColor;
            cHeaderHour.style.fontSize = '20px';

            // 3. 右侧标题区 (分钟)
            const rHeaderTrips = document.createElement('div');
            rHeaderTrips.style.flex = '1';
            rHeaderTrips.style.display = 'flex';
            rHeaderTrips.style.alignItems = 'center';
            rHeaderTrips.style.justifyContent = 'flex-start';
            rHeaderTrips.style.direction = 'ltr';
            rHeaderTrips.style.backgroundColor = rightBgColorHead;
            rHeaderTrips.style.color = rightPaneTextColor;
            rHeaderTrips.textContent = '分';
            rHeaderTrips.style.fontSize = '20px';
            rHeaderTrips.style.paddingLeft = '20px'; 

            // 组装并添加到 biGrid
            headerRow.appendChild(lHeaderTrips);
            headerRow.appendChild(cHeaderHour);
            headerRow.appendChild(rHeaderTrips);
            biGrid.appendChild(headerRow);

            for (const [index, h] of sortedHours.entries()) {
                const isEven = (index + 1) % 2 === 0;
                const lRow = leftByHour.get(h);
                const rRow = rightByHour.get(h);
                const hourText = lRow
                    ? lRow.querySelector('.panel-grid-hour')?.textContent
                    : (rRow ? rRow.querySelector('.panel-grid-hour')?.textContent : globalGridHourLabels[String(h)]);
                const bgColor = timetablePalette.gridRowTripsColor;
                const rightBgColor = shouldRenderServiceDayPair ? timetablePalette.rightGridRowTripsColor : bgColor;
                const lCells = lRow ? Array.from(lRow.querySelectorAll('.panel-grid-cell')) : [];
                const rCells = rRow ? Array.from(rRow.querySelectorAll('.panel-grid-cell')) : [];
                const configuredRowSlots = Number(globalGridRowsByHour[String(h)] ?? globalGridRowsByHour[h]);
                const rowSlots = Number.isFinite(configuredRowSlots) && configuredRowSlots > 0
                    ? configuredRowSlots
                    : Math.max(1, Math.ceil(Math.max(lCells.length, rCells.length, 1) / gridNumber));
                const targetCellCount = rowSlots * gridNumber;
                const appendEmptyCells = (host, count) => {
                    for (let i = 0; i < count; i += 1) {
                        const emptyCell = document.createElement('div');
                        emptyCell.className = 'panel-grid-cell panel-grid-cell-trip is-empty';
                        emptyCell.style.visibility = 'hidden';
                        host.appendChild(emptyCell);
                    }
                };

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
                lTrips.style.flex = '1';
                lTrips.style.display = 'grid';
                lTrips.style.gridTemplateColumns = `repeat(${gridNumber}, minmax(0, 1fr))`;
                lTrips.style.overflow = 'hidden';
                lTrips.style.gridAutoRows = 'max-content';
                lTrips.style.direction = 'rtl';
                lTrips.style.backgroundColor = isEven ? bgColor : timetablePalette.gridBaseTripsColor;
                
                if (lCells.length) {
                    lCells.forEach(c => {
                        const clone = c.cloneNode(true);
                        clone.style.direction = 'ltr'; 
                        if(clone.classList.contains('has-special')) {
                            clone.style.backgroundColor = specialTripColor;
                            clone.style.color = specialTripTextColor;
                        }
                        lTrips.appendChild(clone);
                    });
                }
                appendEmptyCells(lTrips, Math.max(0, targetCellCount - lCells.length));

                // Center Hour
                const cHour = document.createElement('div');
                cHour.style.width = '60px';
                cHour.style.flexShrink = '0';
                cHour.style.display = 'flex';
                cHour.style.alignItems = 'center';
                cHour.style.justifyContent = 'center'; // Center the text in the column
                cHour.textContent = hourText || h;
                cHour.style.backgroundColor = serviceDayHourColor;
                cHour.style.color = serviceDayHourTextColor;
                cHour.style.fontSize = '22px';

                // Right trips (Dir 2) - 10 per row
                const rTrips = document.createElement('div');
                rTrips.style.flex = '1';
                rTrips.style.display = 'grid';
                rTrips.style.gridTemplateColumns = `repeat(${gridNumber}, minmax(0, 1fr))`;
                rTrips.style.overflow = 'hidden';
                rTrips.style.gridAutoRows = 'max-content';
                rTrips.style.direction = 'ltr';
                rTrips.style.backgroundColor = isEven ? rightBgColor : timetablePalette.gridBaseTripsColor;
                if (rCells.length) {
                    rCells.forEach(c => {
                        const clone = c.cloneNode(true);
                        clone.style.direction = 'ltr'; 
                        if(clone.classList.contains('has-special')) {
                            clone.style.backgroundColor = specialTripColor;
                            clone.style.color = specialTripTextColor;
                        }
                        rTrips.appendChild(clone);
                    });
                }
                appendEmptyCells(rTrips, Math.max(0, targetCellCount - rCells.length));
                
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

            .panel-company,
            .panel-company-name, 
            .panel-line-name-main {
                font-size: 25px !important; 
                font-weight: 700 !important;
            }

            .panel-grid-trips{
                background-color: var(--panel-grid-trips-bg, ${timetablePalette.gridBaseTripsColor}) !important;
            }

            .panel-grid-trip{
                font-size: 20px !important;
            }
            
            .panel-grid-trip-minute-text{
                font-size: 20px !important;
            }

            .panel-grid-trip-minute-flag{
                font-size: 12px !important;
                
            }

            .panel-grid-trip-abbr{
                font-size: 12px !important;
            }
        `;
        root.appendChild(forceExpandStyle);

        // Required to ensure it works correctly when converted to image
        root.style.width = `${gridNumber * 120}px`;
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

    const buildServiceDayLineDirs = (dirs, serviceDay) => (Array.isArray(dirs) ? dirs : [])
        .map((dir) => {
            const variants = Array.isArray(dir?.serviceDayVariants) ? dir.serviceDayVariants : [];
            const variant = variants.find((item) => toText(item?.serviceDay) === serviceDay)
                || (toText(dir?.serviceDay) === serviceDay ? dir : null);
            if (!variant) return null;
            return {
                ...dir,
                ...variant,
                lineHeaderHtml: dir?.lineHeaderHtml,
                lineSuffixHtml: dir?.lineSuffixHtml,
                stationInfoHtml: dir?.stationInfoHtml,
                stationName: toText(variant?.stationName) || toText(dir?.stationName),
                serviceDayLabel: serviceDay === 'SaturdayHoliday' ? '周六、节假日时刻表' : '平日时刻表'
            };
        })
        .filter(Boolean);

    const collectGridRowsForDirs = (dirs) => {
        const out = [];
        for (const dir of (Array.isArray(dirs) ? dirs : [])) {
            const temp = document.createElement('div');
            temp.innerHTML = toText(dir?.gridHtml);
            for (const row of Array.from(temp.querySelectorAll('.panel-grid-row'))) {
                const hour = Number(row.getAttribute('data-grid-hour'));
                if (!Number.isFinite(hour)) continue;
                out.push({
                    hour,
                    cellCount: row.querySelectorAll('.panel-grid-cell').length,
                    label: toText(row.querySelector('.panel-grid-hour')?.textContent)
                });
            }
        }
        return out;
    };

    const resolveServiceDayPairGridLayout = (dayGroups) => {
        const hoursSet = new Set();
        let maxCellCount = 0;
        const hourLabels = {};
        const maxCellCountByHour = new Map();

        for (const group of (Array.isArray(dayGroups) ? dayGroups : [])) {
            for (const item of collectGridRowsForDirs(group?.dirs)) {
                hoursSet.add(item.hour);
                if (item.label && !hourLabels[String(item.hour)]) hourLabels[String(item.hour)] = item.label;
                maxCellCount = Math.max(maxCellCount, item.cellCount);
                maxCellCountByHour.set(
                    item.hour,
                    Math.max(Number(maxCellCountByHour.get(item.hour)) || 0, item.cellCount)
                );
            }
        }

        const gridNumber = maxCellCount > 15 ? 20 : (maxCellCount > 10 ? 15 : 10);
        const rowsByHour = {};
        for (const hour of hoursSet) {
            rowsByHour[String(hour)] = Math.max(1, Math.ceil((Number(maxCellCountByHour.get(hour)) || 1) / gridNumber));
        }

        return {
            gridNumber,
            hourLabels,
            hours: Array.from(hoursSet).sort((a, b) => a - b),
            rowsByHour
        };
    };

    const createServiceDayPairLineImageExportDom = (detail = {}) => {
        const root = document.createElement('div');
        root.className = 'timetable-print-root';

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) root.classList.add('is-dark');

        root.style.display = 'flex';
        root.style.alignItems = 'flex-start';
        root.style.gap = '0';
        root.style.width = 'max-content';
        root.style.maxWidth = 'none';
        root.style.margin = '0';
        root.style.padding = '0';
        root.style.border = 'none';
        root.style.position = 'fixed';
        root.style.top = '0';
        root.style.left = '-9999px';
        root.style.zIndex = '-9999';

        const dirs = Array.isArray(detail.dirs) ? detail.dirs : [];
        const dayGroups = PRINT_SERVICE_DAY_ORDER
            .map((serviceDay) => ({
                serviceDay,
                dirs: buildServiceDayLineDirs(dirs, serviceDay)
            }))
            .filter((group) => group.dirs.length);
        const gridLayout = resolveServiceDayPairGridLayout(dayGroups);

        dayGroups.forEach((group, index) => {
            const { serviceDay, dirs: dayDirs } = group;

            const dayRoot = createLineImageExportDom({
                ...detail,
                dirs: dayDirs,
                disableServiceDayPair: true,
                globalGridHours: gridLayout.hours,
                globalGridHourLabels: gridLayout.hourLabels,
                globalGridNumber: gridLayout.gridNumber,
                globalGridRowsByHour: gridLayout.rowsByHour,
                serviceDayColorMode: serviceDay === 'SaturdayHoliday' ? 'complementary' : 'base'
            });
            dayRoot.style.position = 'static';
            dayRoot.style.top = 'auto';
            dayRoot.style.left = 'auto';
            dayRoot.style.zIndex = 'auto';
            dayRoot.style.margin = '0';
            dayRoot.style.flex = '0 0 auto';
            if (index > 0) {
                dayRoot.style.borderLeft = '6px solid rgba(0, 0, 0, 0.18)';
            }
            root.appendChild(dayRoot);
        });

        return root;
    };

    const alignServiceDayPairHeaderHeights = (root) => {
        if (!(root instanceof HTMLElement)) return;
        const dayRoots = Array.from(root.children)
            .filter((el) => el instanceof HTMLElement && el.classList.contains('timetable-print-root'));
        if (dayRoots.length < 2) return;

        for (const selector of ['.panel-bi-headers', '.panel-bi-hints-container']) {
            const targets = dayRoots
                .map((dayRoot) => dayRoot.querySelector(selector))
                .filter((el) => el instanceof HTMLElement);
            if (targets.length < 2) continue;

            for (const target of targets) {
                target.style.height = 'auto';
                target.style.minHeight = '0';
            }

            const maxHeight = Math.max(...targets.map((target) => Math.ceil(target.getBoundingClientRect().height || target.scrollHeight || 0)));
            if (!Number.isFinite(maxHeight) || maxHeight <= 0) continue;

            for (const target of targets) {
                target.style.height = `${maxHeight}px`;
                target.style.minHeight = `${maxHeight}px`;
                target.style.boxSizing = 'border-box';
            }
        }
    };

    const exportLineToImage = async (detail = {}) => {
        injectStyles();
        const { html2canvas } = await ensureLibs();

        const dirs = Array.isArray(detail.dirs) ? detail.dirs : [];
        const shouldExportServiceDayPair = !detail.disableServiceDayPair
            && dirs.some((dir) => Array.isArray(dir?.serviceDayVariants) && dir.serviceDayVariants.length >= 2);
        const root = shouldExportServiceDayPair
            ? createServiceDayPairLineImageExportDom(detail)
            : createLineImageExportDom(detail);
        document.body.appendChild(root);
        if (shouldExportServiceDayPair) alignServiceDayPairHeaderHeights(root);
        let canvas = null;
        try {
            const captureOptions = resolveLineImageCaptureOptions(root);
            canvas = await html2canvas(root, {
                scale: captureOptions.scale,
                useCORS: true,
                backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
                logging: false,
                width: captureOptions.width,
                height: captureOptions.height,
                windowWidth: captureOptions.windowWidth,
                windowHeight: captureOptions.windowHeight,
                x: captureOptions.x,
                y: captureOptions.y
            });
            const firstDir = detail.dirs?.[0] || {};
            const stationName = sanitizeFilePart(firstDir.stationName || 'station');
            const lineName = sanitizeFilePart(firstDir.lineName || detail.lineId || 'line');
            const serviceDay = shouldExportServiceDayPair
                ? '平日_节假日'
                : (toText(firstDir.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日');
            const fileName = `${stationName}_${lineName}_${serviceDay}时刻表.png`;

            const blob = await canvasToPngBlob(canvas);
            await shareOrSaveImageArtifact({
                blob,
                filename: fileName,
                mimeType: 'image/png',
                title: 'TokyoRailMap',
                dialogTitle: '分享时刻表图片',
                fallbackDownload: downloadBlob
            });
        } finally {
            if (canvas) {
                canvas.width = 1;
                canvas.height = 1;
            }
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
            format: 'a4',
            compress: true
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
                    scale: Math.max(1.5, Math.min(2, window.devicePixelRatio || 1)),
                    useCORS: true,
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
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
        await savePdfArtifact(pdf, fileName);
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
                        listHtml: dirRaw?.listHtml ?? pageDetailRaw?.listHtml,
                        serviceDayVariants: Array.isArray(dirRaw?.serviceDayVariants)
                            ? dirRaw.serviceDayVariants
                            : (Array.isArray(pageDetailRaw?.serviceDayVariants) ? pageDetailRaw.serviceDayVariants : [])
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
                    listHtml: pageDetailRaw?.listHtml,
                    serviceDayVariants: Array.isArray(pageDetailRaw?.serviceDayVariants) ? pageDetailRaw.serviceDayVariants : []
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

            const shouldExportServiceDayPair = uniqueDirs.some((dir) => (
                Array.isArray(dir?.serviceDayVariants) && dir.serviceDayVariants.length >= 2
            ));
            const root = shouldExportServiceDayPair
                ? createServiceDayPairLineImageExportDom(pageDetail)
                : createLineImageExportDom(pageDetail);
                
            document.body.appendChild(root);
            if (shouldExportServiceDayPair) alignServiceDayPairHeaderHeights(root);

            try {
                const scaleFactor = Math.max(1.5, Math.min(2, window.devicePixelRatio || 1));
                
                const canvas = await html2canvas(root, {
                    scale: scaleFactor,
                    useCORS: true,
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
                    logging: false,
                    width: root.scrollWidth,
                    height: root.scrollHeight,
                    windowWidth: root.scrollWidth,
                    windowHeight: root.scrollHeight
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.86);
                
                const pdfWidth = canvas.width / scaleFactor;
                const pdfHeight = canvas.height / scaleFactor;
                const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';

                if (pageCount === 0) {
                    pdf = new jsPDF({
                        orientation: orientation,
                        unit: 'px',
                        format: [pdfWidth, pdfHeight],
                        compress: true
                    });
                } else {
                    pdf.addPage([pdfWidth, pdfHeight], orientation);
                }

                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'MEDIUM');
                
                pageCount += 1;
            } finally {
                root.remove();
            }
        }

        if (!pageCount || !pdf) return;

        const stationName = sanitizeFilePart(detail.stationName || pages[0]?.stationName || 'station');
        const hasServiceDayPair = pages.some((page) => (
            Array.isArray(page?.serviceDayVariants) && page.serviceDayVariants.length >= 2
        ));
        const serviceDay = hasServiceDayPair
            ? '平日_周六节假日'
            : (toText(pages[0]?.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日');
        const fileName = `${stationName}_${serviceDay}总时刻表.pdf`;
        await savePdfArtifact(pdf, fileName);
    };

    const exportRouteMapLineStationsToPdf = async (detail = {}) => {
        injectStyles();
        const { html2canvas, jsPDF } = await ensureLibs();

        const lineId = toText(detail.lineId);
        const stationIds = await resolveRouteMapLineStationIds(lineId);
        if (!stationIds.length) {
            throw new Error(`no stations found for line: ${lineId || '(empty)'}`);
        }

        const builder = window?.TokyoRailPanelTimetablePrintPayloadBuilder;
        if (typeof builder?.buildLineStationPrintPayload !== 'function') {
            throw new Error('panel timetable print payload builder is unavailable');
        }

        const session = typeof builder?.createLineStationPrintPayloadSession === 'function'
            ? await builder.createLineStationPrintPayloadSession({
                lineId,
                timetableViewMode: 'grid'
            })
            : null;

        let pdf = null;
        let pageCount = 0;
        const lineNameForFile = sanitizeFilePart(detail.lineName || detail.lineId || 'line');
        const backgroundColor = getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff';

        try {
            for (const stationId of stationIds) {
                const pageDetailRaw = session
                    ? await session.build(stationId)
                    : await builder.buildLineStationPrintPayload({
                        lineId,
                        stationId,
                        timetableViewMode: 'grid'
                    });
                if (!pageDetailRaw?.dirs?.length) continue;

                const pageDetail = {
                    ...pageDetailRaw,
                    lineId,
                    lineName: toText(detail.lineName) || lineId
                };
                const shouldExportServiceDayPair = pageDetail.dirs.some((dir) => (
                    Array.isArray(dir?.serviceDayVariants) && dir.serviceDayVariants.length >= 2
                ));
                const root = shouldExportServiceDayPair
                    ? createServiceDayPairLineImageExportDom(pageDetail)
                    : createLineImageExportDom(pageDetail);

                document.body.appendChild(root);
                if (shouldExportServiceDayPair) alignServiceDayPairHeaderHeights(root);

                try {
                    const scaleFactor = Math.max(1.5, Math.min(2, window.devicePixelRatio || 1));
                    const canvas = await html2canvas(root, {
                        scale: scaleFactor,
                        useCORS: true,
                        backgroundColor,
                        logging: false,
                        width: root.scrollWidth,
                        height: root.scrollHeight,
                        windowWidth: root.scrollWidth,
                        windowHeight: root.scrollHeight
                    });

                    const imgData = canvas.toDataURL('image/jpeg', 0.86);
                    const pdfWidth = canvas.width / scaleFactor;
                    const pdfHeight = canvas.height / scaleFactor;
                    const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';

                    if (pageCount === 0) {
                        pdf = new jsPDF({
                            orientation,
                            unit: 'px',
                            format: [pdfWidth, pdfHeight],
                            compress: true
                        });
                    } else {
                        pdf.addPage([pdfWidth, pdfHeight], orientation);
                    }

                    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'MEDIUM');
                    canvas.width = 1;
                    canvas.height = 1;
                    pageCount += 1;
                } finally {
                    root.remove();
                }
            }
        } finally {
            session?.close?.();
        }

        if (!pageCount || !pdf) {
            throw new Error(`no printable timetable pages found for line: ${lineId}`);
        }

        await savePdfArtifact(
            pdf,
            `${lineNameForFile}_\u5168\u7ad9_\u5e73\u65e5_\u5468\u516d\u8282\u5047\u65e5\u65f6\u523b\u8868.pdf`
        );
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
        const triggerDirKey = toText(detail.triggerDirKey) || toText(detail.dirs?.[0]?.dirKey);
        const target = lineId && triggerDirKey
            ? document.querySelector(`.panel-dir-print-btn[data-dir-print-btn][data-line-id="${CSS.escape(lineId)}"][data-dir-key="${CSS.escape(triggerDirKey)}"]`)
            : lineId
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

    const onRouteMapLineTimetablesPrintRequest = async (evt) => {
        const detail = evt?.detail || {};
        const target = document.querySelector('.route-map-print-btn');

        try {
            if (target instanceof Element) {
                target.classList.add(LOADING_CLASS);
                target.setAttribute('aria-busy', 'true');
                if ('disabled' in target) target.disabled = true;
            }
            await exportRouteMapLineStationsToPdf(detail);
        } catch (err) {
            console.error('[print-timetables] route map line export failed', err);
            alert('\u5bfc\u51fa\u7ebf\u8def\u5168\u7ad9\u65f6\u523b\u8868 PDF \u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
        } finally {
            if (target instanceof Element) {
                target.classList.remove(LOADING_CLASS);
                target.removeAttribute('aria-busy');
                if ('disabled' in target) target.disabled = false;
            }
        }
    };

    window.addEventListener(PRINT_EVENT, onPrintRequest);
    window.addEventListener(PRINT_ALL_EVENT, onPrintAllRequest);
    window.addEventListener(PRINT_LINE_IMAGE_EVENT, onPrintLineImageRequest);
    window.addEventListener(ROUTE_MAP_LINE_TIMETABLES_PRINT_EVENT, onRouteMapLineTimetablesPrintRequest);
})();
