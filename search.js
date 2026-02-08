/**
 * 搜索框 UI（仅 UI 构建；搜索逻辑稍后接入）
 *
 * 设计目标：风格尽量与左侧菜单一致；顶部左侧圆角半透明；结果面板为圆角矩形列表。
 */

function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null) continue;
        if (k === 'text') node.textContent = String(v);
        else node.setAttribute(k, String(v));
    }
    return node;
}

function buildResultIcon(item) {
    if (!item || !item.type) return el('span', 'search-result-icon search-result-icon--station');

    if (item.type === 'company') {
        const img = el('img', 'search-result-icon search-result-icon--company', { alt: '' });
        if (item.logoUrl) img.src = String(item.logoUrl);
        return img;
    }

    if (item.type === 'line') {
        const icon = el('span', 'search-result-icon search-result-icon--line');
        if (item.color) icon.style.background = String(item.color);
        return icon;
    }

    // station：用“换乘站圆点”风格的占位 icon（后续可按是否换乘调整）
    return el('span', 'search-result-icon search-result-icon--station');
}

export function mountSearchUI() {
    // 避免重复挂载
    if (document.querySelector('.search-ui')) {
        return window.TokyoRailSearchUI;
    }

    const root = el('div', 'search-ui');

    const bar = el('div', 'search-bar');
    const input = el('input', 'search-input', {
        type: 'search',
        placeholder: '搜索线路 / 站点 / 公司',
        autocomplete: 'off',
        spellcheck: 'false'
    });

    bar.appendChild(input);

    const results = el('div', 'search-results is-hidden');
    const list = el('ul', 'search-results-list');
    results.appendChild(list);

    root.appendChild(bar);
    root.appendChild(results);
    document.body.appendChild(root);

    const ui = {
        root,
        input,
        results,
        list,
        query: '',
        items: [],
        setQuery(q) {
            this.query = String(q ?? '');
        },
        setResults(items) {
            this.items = Array.isArray(items) ? items.slice() : [];
            this.render();
        },
        showResults(show) {
            this.results.classList.toggle('is-hidden', !show);
        },
        clear() {
            this.setQuery('');
            this.input.value = '';
            this.setResults([]);
            this.showResults(false);
        },
        render() {
            while (this.list.firstChild) this.list.removeChild(this.list.firstChild);

            const q = String(this.query || '').trim();
            if (!q) {
                this.showResults(false);
                return;
            }

            if (!this.items.length) {
                const empty = el('div', 'search-empty', { text: '暂无结果（搜索逻辑稍后接入）' });
                const li = document.createElement('li');
                li.appendChild(empty);
                this.list.appendChild(li);
                this.showResults(true);
                return;
            }

            for (const item of this.items) {
                const li = document.createElement('li');
                const row = el('div', 'search-result-item');

                const icon = buildResultIcon(item);
                const text = el('div', 'search-result-text', { text: item?.text ?? '' });

                row.appendChild(icon);
                row.appendChild(text);

                // 交互逻辑稍后实现：这里先阻止默认行为（未来可用于选择/定位）
                row.addEventListener('click', (evt) => {
                    evt.preventDefault?.();
                    evt.stopPropagation?.();
                });

                li.appendChild(row);
                this.list.appendChild(li);
            }

            this.showResults(true);
        }
    };

    // “实时展示搜索结果”：目前仅做 UI 行为（显示/隐藏 + 空状态），不做真正搜索。
    input.addEventListener('input', () => {
        ui.setQuery(input.value);
        ui.setResults([]);
    });

    // 点击搜索框以外区域：先不做收起逻辑（避免超出你“仅 UI”范围）

    window.TokyoRailSearchUI = ui;
    return ui;
}

// 自动挂载
mountSearchUI();
