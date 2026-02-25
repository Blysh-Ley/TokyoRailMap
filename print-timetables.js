/*
 * print-timetables.js
 * 方向班次表导出 PDF（A4）
 */

(() => {
    'use strict';

    const PRINT_EVENT = '__TokyoRailPrintTimetableRequested';
    const PRINT_ALL_EVENT = '__TokyoRailPrintAllTimetablesRequested';
    const LOADING_CLASS = 'is-printing-timetables';
    const GRID_MIN_COLS = 10;

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

            .timetable-print-title {
                font-size: 24px;
                font-weight: 700;
                line-height: 1.25;
                margin-bottom: 6px;
            }

            .timetable-print-subtitle {
                font-size: 14px;
                color: #555;
                margin-bottom: 8px;
                line-height: 1.35;
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

            .timetable-print-content .panel-grid-row {
                min-height: 44px;
            }

            .timetable-print-content .panel-grid-trip-abbr {
                font-size: calc(13px * var(--grid-font-scale, 1));
            }

            .timetable-print-content .panel-grid-trip-minute {
                font-size: calc(20px * var(--grid-font-scale, 1));
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

            .timetable-print-root.is-dark .timetable-print-subtitle {
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
        const companyType = toText(detail.companyType);
        const lineName = toText(detail.lineName) || toText(detail.lineId) || '未知线路';
        const lineColor = toText(detail.lineColor);
        const dirLabel = toText(detail.dirLabel) || toText(detail.dirKey) || '未知方向';
        const serviceDay = toText(detail.serviceDay) === 'SaturdayHoliday' ? '休息日' : '工作日';
        const viewMode = toText(detail.timetableViewMode) === 'grid' ? '网格视图' : '列表视图';

        const title = document.createElement('div');
        title.className = 'timetable-print-title';
        title.textContent = '';
        title.appendChild(document.createTextNode(`${stationName} / `));
        const lineNameEl = document.createElement('span');
        lineNameEl.textContent = lineName;
        if (lineColor) lineNameEl.style.color = lineColor;
        title.appendChild(lineNameEl);
        title.appendChild(document.createTextNode(` / 往${dirLabel}方向`));

        const subtitle = document.createElement('div');
        subtitle.className = 'timetable-print-subtitle';
        subtitle.textContent = [
            `${companyName}`,
            `${serviceDay}`,
            `导出时间：${new Date().toLocaleString()}`
        ].join('   |   ');

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

        card.appendChild(title);
        card.appendChild(subtitle);
        card.appendChild(content);

        if (useGrid) {
            const tripRows = Array.from(content.querySelectorAll('.panel-grid-trips'));
            let maxTripsInHour = 1;
            for (const row of tripRows) {
                const count = row.querySelectorAll('.panel-grid-cell-trip').length;
                if (count > maxTripsInHour) maxTripsInHour = count;
            }

            const cols = Math.max(GRID_MIN_COLS, Math.min(60, maxTripsInHour));
            let fontScale = 1;
            if (cols > 30) fontScale = 0.58;
            else if (cols > 24) fontScale = 0.64;
            else if (cols > 18) fontScale = 0.72;
            else if (cols > 14) fontScale = 0.8;
            else if (cols > 10) fontScale = 0.9;

            root.style.setProperty('--grid-cols', String(cols));
            root.style.setProperty('--grid-font-scale', String(fontScale));
        }

        root.appendChild(card);

        return root;
    };

    const exportToPdf = async (detail = {}) => {
        injectStyles();
        const { html2canvas, jsPDF } = await ensureLibs();

        const root = createExportDom(detail);
        document.body.appendChild(root);

        try {
            const pdf = new jsPDF({
                orientation: 'landscape',
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

            const isGrid = toText(detail.timetableViewMode) === 'grid';
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

    const exportAllDirectionsToPdf = async (detail = {}) => {
        injectStyles();
        const { html2canvas, jsPDF } = await ensureLibs();

        const pages = Array.isArray(detail?.pages) ? detail.pages : [];
        if (!pages.length) return;

        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        let pageIndex = 0;
        for (const pageDetailRaw of pages) {
            const pageDetail = {
                ...pageDetailRaw,
                stationName: toText(pageDetailRaw?.stationName) || toText(detail?.stationName),
                serviceDay: toText(pageDetailRaw?.serviceDay) || toText(detail?.serviceDay),
                timetableViewMode: 'grid'
            };

            const root = createExportDom(pageDetail);
            document.body.appendChild(root);
            try {
                const canvas = await html2canvas(root, {
                    scale: Math.max(2, window.devicePixelRatio || 1),
                    useCORS: true,
                    backgroundColor: null,
                    logging: false
                });
                addCanvasAsSinglePage(pdf, canvas, { appendPage: pageIndex > 0 });
                pageIndex += 1;
            } finally {
                root.remove();
            }
        }

        if (!pageIndex) return;

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

    window.addEventListener(PRINT_EVENT, onPrintRequest);
    window.addEventListener(PRINT_ALL_EVENT, onPrintAllRequest);
})();
