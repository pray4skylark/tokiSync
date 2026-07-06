/**
 * DomInspector Module for TokiSync (Prototype v2)
 * Chrome DevTools-style DOM tree visualizer.
 * Click an element in the tree → highlights on real page + generates CSS selector.
 * No z-index / overlay issues — works entirely in a dedicated panel.
 */

export class DomInspector {
    constructor(options = {}) {
        this.root = document.body;
        this.treeData = null;
        this.nodeMap = [];
        this.elementToNode = new Map();
        this.filterText = '';
        this.onApply = null;
        this.lastSelector = '';
        this.selectedNode = null;
        this.options = {
            enablePseudo: true,
            enableShadow: true,
            maxDepth: 999,
            ...options
        };
    }

    /**
     * Walk the DOM and build a simplified tree.
     */
    simplify(element, depth = 0) {
        if (depth > this.options.maxDepth) return null;

        if (element.nodeType === Node.TEXT_NODE) {
            const text = element.textContent.replace(/\s+/g, ' ').trim();
            if (!text || text.length < 2) return null;
            return { type: 'text', value: text };
        }

        if (element.nodeType !== Node.ELEMENT_NODE) return null;

        const tag = element.tagName.toLowerCase();
        const skip = ['script', 'style'];
        if (skip.includes(tag)) return null;

        const node = {
            type: 'element',
            tag,
            id: element.id || null,
            classes: [],
            attrs: {},
            text: null,
            hidden: null,
            children: [],
            elementRef: element,
            matched: false,
            shadow: false
        };

        for (const c of element.classList) {
            if (!c.startsWith('toki-') && !c.startsWith('sc-')) {
                node.classes.push(c);
            }
        }

        // CSS evasion detection
        const style = window.getComputedStyle(element);
        node.hidden = this._detectHidden(style, element);

        // Collect attributes
        this._collectAttrs(element, node);

        // Process child nodes
        for (const child of element.childNodes) {
            const s = this.simplify(child, depth + 1);
            if (s) node.children.push(s);
        }

        // Pseudo-elements
        if (this.options.enablePseudo) {
            this._addPseudoElements(element, node);
        }

        // Shadow DOM
        if (this.options.enableShadow && element.shadowRoot) {
            for (const child of element.shadowRoot.childNodes) {
                const s = this.simplify(child, depth + 1);
                if (s) {
                    s.shadow = true;
                    node.children.push(s);
                }
            }
        }

        // Collapse single text child
        if (node.children.length === 1 && node.children[0].type === 'text' && !node.text) {
            node.text = node.children[0].value;
            node.children = [];
        }

        // Build reverse index
        this.elementToNode.set(element, node);

        return node;
    }

    /**
     * Detect CSS-based hiding/evasion strategies.
     * Returns a string flag or null.
     */
    _detectHidden(style, element) {
        if (style.display === 'none') return 'display-none';
        if (style.visibility === 'hidden') return 'visibility-hidden';

        const opacity = parseFloat(style.opacity);
        if (!isNaN(opacity) && opacity < 0.5) return 'faded';

        const pos = style.position;
        if (pos === 'absolute' || pos === 'fixed') {
            const left = parseFloat(style.left);
            const top = parseFloat(style.top);
            if (left <= -9999 || top <= -9999) return 'offscreen';
        }

        const clipPath = style.clipPath || '';
        if (clipPath.startsWith('inset(50%)')) return 'clipped';

        const fontSize = parseFloat(style.fontSize);
        if (!isNaN(fontSize) && fontSize === 0) return 'zero-font';

        if (style.pointerEvents === 'none') return 'no-pointer';

        return null;
    }

    /**
     * Collect attributes from an element.
     */
    _collectAttrs(element, node) {
        const important = ['href', 'src', 'data-num', 'data-lazy', 'data-original', 'alt', 'title', 'value', 'type', 'name', 'data-id'];
        for (const a of important) {
            const v = element.getAttribute(a);
            if (v) node.attrs[a] = v.length > 80 ? v.substring(0, 80) + '\u2026' : v;
        }

        // Collect ALL data-* attributes
        for (const attr of element.attributes) {
            const name = attr.name;
            if (name.startsWith('data-') && !node.attrs[name]) {
                const v = attr.value;
                node.attrs[name] = v.length > 80 ? v.substring(0, 80) + '\u2026' : v;
            }
        }

        // aria-* attributes
        for (const attr of element.attributes) {
            if (attr.name.startsWith('aria-')) {
                const v = attr.value;
                node.attrs[attr.name] = v.length > 80 ? v.substring(0, 80) + '\u2026' : v;
            }
        }

        // Additional single attributes
        const singles = ['role', 'style', 'loading'];
        for (const a of singles) {
            const v = element.getAttribute(a);
            if (v && !node.attrs[a]) {
                node.attrs[a] = v.length > 80 ? v.substring(0, 80) + '\u2026' : v;
            }
        }
    }

    /**
     * Add pseudo-element nodes (::before / ::after).
     */
    _addPseudoElements(element, node) {
        const computed = window.getComputedStyle(element);
        for (const pseudo of ['::before', '::after']) {
            const ps = window.getComputedStyle(element, pseudo);
            if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
                node.children.push({
                    type: 'pseudo',
                    name: pseudo,
                    content: ps.content,
                    hidden: null,
                    children: []
                });
            }
        }
    }

    build() {
        this.nodeMap = [];
        this.elementToNode = new Map();
        this.treeData = this.simplify(this.root);
    }

    /**
     * Render the tree as DevTools-style HTML.
     * Uses chunked rendering for large trees (>200 nodes).
     */
    renderTree(container) {
        this.nodeMap = [];
        const totalNodes = this._countElementNodes(this.treeData);

        if (totalNodes <= 200) {
            // Sync render for small trees
            const html = this._renderTreeSync(this.treeData);
            container.innerHTML = html;
            return;
        }

        // Chunked render for large trees
        this._renderTreeChunked(container);
    }

    _countElementNodes(node) {
        if (!node || node.type === 'text') return 0;
        let count = 1;
        for (const child of node.children) {
            count += this._countElementNodes(child);
        }
        return count;
    }

    _renderTreeSync(node, depth = 0) {
        if (!node || node.type === 'text') return '';
        if (node.type === 'pseudo') return this._renderPseudoNode(node, depth);

        const idx = this.nodeMap.length;
        this.nodeMap.push(node);
        node._idx = idx;

        const hasChildren = node.children.some(c => c.type === 'element' || c.type === 'pseudo');
        const expandByDefault = depth < 3;
        const arrow = hasChildren ? (expandByDefault ? '\u25BC' : '\u25B6') : '  ';

        const tagHtml = `<span class="di-tag">${node.tag}</span>`;
        const idHtml = node.id ? `<span class="di-id">#${node.id}</span>` : '';
        const clsHtml = node.classes.length > 0
            ? node.classes.map(c => `<span class="di-class">.${c}</span>`).join('')
            : '';
        const attrHtml = Object.entries(node.attrs).map(([k, v]) =>
            ` <span class="di-attr">${k}</span>="${v}"`
        ).join('');
        const textHtml = node.text
            ? ` <span class="di-text">"${node.text}"</span>`
            : '';
        const hiddenClass = node.hidden ? ' di-dimmed' : '';
        const shadowBadge = node.shadow ? '<span class="di-shadow-badge">\u{1F4A0}</span>' : '';

        let html = `<div class="di-line${hiddenClass}" data-idx="${idx}" style="padding-left:${depth * 20}px">
            <span class="di-arrow">${arrow}</span>
            ${shadowBadge}${tagHtml}${idHtml}${clsHtml}${attrHtml}${textHtml}
        </div>`;

        if (hasChildren && expandByDefault) {
            const childrenHtml = node.children
                .filter(c => c.type === 'element' || c.type === 'pseudo')
                .map(c => this._renderTreeSync(c, depth + 1))
                .join('');
            html += `<div class="di-children" data-parent="${idx}">${childrenHtml}</div>`;
        } else if (hasChildren) {
            const childrenHtml = node.children
                .filter(c => c.type === 'element' || c.type === 'pseudo')
                .map(c => this._renderTreeSync(c, depth + 1))
                .join('');
            html += `<div class="di-children di-collapsed" data-parent="${idx}">${childrenHtml}</div>`;
        }

        return html;
    }

    _renderTreeChunked(container) {
        this.nodeMap = [];
        const batchSize = 100;
        const pending = [];
        this._collectRenderQueue(this.treeData, pending, 0);

        let offset = 0;
        const renderBatch = () => {
            const batch = pending.slice(offset, offset + batchSize);
            offset += batch.length;

            for (const { node, depth } of batch) {
                this.nodeMap.push(node);
                node._idx = node._idx !== undefined ? node._idx : this.nodeMap.length - 1;
            }

            if (offset < pending.length) {
                requestAnimationFrame(renderBatch);
            } else {
                // All queued — now build full HTML
                container.innerHTML = this._renderTreeSync(this.treeData);
            }
        };

        requestAnimationFrame(renderBatch);
    }

    _collectRenderQueue(node, queue, depth) {
        if (!node || node.type === 'text') return;
        queue.push({ node, depth });
        node._idx = queue.length - 1;
        for (const child of node.children) {
            if (child.type === 'element' || child.type === 'pseudo') {
                this._collectRenderQueue(child, queue, depth + 1);
            }
        }
    }

    _renderPseudoNode(node, depth) {
        const idx = this.nodeMap.length;
        this.nodeMap.push(node);
        node._idx = idx;

        const hiddenClass = node.hidden ? ' di-dimmed' : '';
        let html = `<div class="di-line di-pseudo${hiddenClass}" data-idx="${idx}" style="padding-left:${depth * 20}px">
            <span class="di-arrow">  </span>
            <span class="di-pseudo-name">${node.name}</span>
            <span class="di-text">"${node.content}"</span>
        </div>`;
        return html;
    }

    filterNodes(node, text) {
        if (!node || node.type === 'text') return false;
        const lower = text.toLowerCase();
        let match = node.tag.includes(lower) ||
            node.classes.some(c => c.includes(lower)) ||
            Object.values(node.attrs).some(v => v.toLowerCase().includes(lower));
        for (const child of node.children) {
            if (this.filterNodes(child, text)) match = true;
        }
        node.matched = match;
        return match;
    }

    renderTreeFiltered(node, depth = 0) {
        if (!node || node.type === 'text') return '';
        if (node.type === 'pseudo') {
            return this._renderPseudoNode(node, depth);
        }
        if (!node.matched) {
            for (const child of node.children) {
                if ((child.type === 'element' || child.type === 'pseudo') && child.matched) {
                    return this.renderTreeFiltered(child, depth);
                }
            }
            return '';
        }

        const idx = this.nodeMap.length;
        this.nodeMap.push(node);
        node._idx = idx;

        const hasVisibleChildren = node.children.some(c => (c.type === 'element' || c.type === 'pseudo') && c.matched);
        const arrow = hasVisibleChildren ? '\u25BC' : '  ';

        const tagHtml = `<span class="di-tag">${node.tag}</span>`;
        const idHtml = node.id ? `<span class="di-id">#${node.id}</span>` : '';
        const clsHtml = node.classes.length > 0
            ? node.classes.map(c => `<span class="di-class">.${c}</span>`).join('')
            : '';
        const attrHtml = Object.entries(node.attrs).map(([k, v]) =>
            ` <span class="di-attr">${k}</span>="${v}"`
        ).join('');
        const textHtml = node.text
            ? ` <span class="di-text">"${node.text}"</span>`
            : '';
        const hiddenClass = node.hidden ? ' di-dimmed' : '';
        const matchedAttr = node.matched ? ' di-highlight' : '';

        let html = `<div class="di-line${hiddenClass}${matchedAttr}" data-idx="${idx}" style="padding-left:${depth * 20}px">
            <span class="di-arrow">${arrow}</span>
            ${tagHtml}${idHtml}${clsHtml}${attrHtml}${textHtml}
        </div>`;

        const childrenHtml = node.children
            .filter(c => (c.type === 'element' || c.type === 'pseudo') && c.matched)
            .map(c => this.renderTreeFiltered(c, depth + 1))
            .join('');

        if (childrenHtml) {
            html += `<div class="di-children" data-parent="${idx}">${childrenHtml}</div>`;
        }

        return html;
    }

    /**
     * Generate a robust CSS selector from a node.
     */
    toSelector(node) {
        if (!node || node.type !== 'element') return '';

        // 1. id unique
        if (node.id) {
            const s = `#${CSS.escape(node.id)}`;
            if (document.querySelectorAll(s).length === 1) return s;
        }

        // 2. class unique
        if (node.classes.length > 0) {
            const s = `${node.tag}.${node.classes.join('.')}`;
            if (document.querySelectorAll(s).length === 1) return s;
        }

        // 3. data attribute unique
        const dataAttrs = Object.keys(node.attrs).filter(k => k.startsWith('data-'));
        for (const key of dataAttrs) {
            const val = node.attrs[key];
            const s = `${node.tag}[${key}="${val}"]`;
            if (document.querySelectorAll(s).length === 1) return s;
        }

        // 4/5. Build path with nth-of-type
        const path = [];
        let el = node.elementRef;
        while (el && el !== document.body && el !== document.documentElement) {
            const tag = el.tagName.toLowerCase();
            const id = el.id;
            const classes = Array.from(el.classList).filter(c => !c.startsWith('toki-') && !c.startsWith('sc-'));

            let seg = tag;
            if (id) { path.unshift(`#${CSS.escape(id)}`); break; }
            if (classes.length > 0) seg += `.${classes.join('.')}`;

            const parent = el.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                if (sameTag.length > 1) {
                    const nth = sameTag.indexOf(el) + 1;
                    seg += `:nth-of-type(${nth})`;
                }
            }

            path.unshift(seg);
            el = el.parentElement;
        }

        return path.join(' > ');
    }

    /**
     * Show inspector panel.
     */
    show(container, onApply) {
        this.onApply = onApply;
        this.build();
        this._render(container);
    }

    _render(container) {
        container.innerHTML = `
            <div class="di-panel">
                <div class="di-toolbar">
                    <div class="di-title">\u{1F9EC} DOM \uAC80\uC0AC\uAE30</div>
                    <div class="di-toolbar-right">
                        <span class="di-count">0 elements</span>
                        <button class="di-refresh" title="DOM \uC0C8\uB85C\uACE0\uCE68">\u21BB</button>
                    </div>
                </div>
                <div class="di-filter-bar">
                    <input type="text" class="di-filter" placeholder="\u{1F50D} \uD0DC\uADF8 / \uD074\uB798\uC2A4 / \uD14D\uC2A4\uD2B8 \uAC80\uC0C9..." />
                </div>
                <div class="di-tree-wrap">
                    <div class="di-tree"></div>
                </div>
                <div class="di-detail" id="di-detail">
                    <div class="di-detail-header">\u{1F4CB} \uC694\uC18C \uC815\uBCF4</div>
                    <div class="di-detail-body" id="di-detail-body">
                        <span class="di-detail-placeholder">\uD2B8\uB9AC\uC5D0\uC11C \uC694\uC18C\uB97C \uD074\uB9AD\uD558\uC138\uC694</span>
                    </div>
                </div>
            </div>
        `;

        const tree = container.querySelector('.di-tree');
        this.renderTree(tree);

        // Update count after render
        const countEl = container.querySelector('.di-count');
        if (countEl) {
            const updateCount = () => { countEl.textContent = `${this.nodeMap.length} elements`; };
            // For chunked rendering, poll until stable
            if (this.nodeMap.length === 0) {
                const poll = setInterval(() => {
                    updateCount();
                    if (this.nodeMap.length > 0 && tree.innerHTML.length > 0) {
                        clearInterval(poll);
                        updateCount();
                    }
                }, 50);
                setTimeout(() => clearInterval(poll), 3000);
            } else {
                updateCount();
            }
        }

        this._bindEvents(container);
    }

    _bindEvents(container) {
        const tree = container.querySelector('.di-tree');
        const filter = container.querySelector('.di-filter');
        const refresh = container.querySelector('.di-refresh');
        const detailBody = container.querySelector('#di-detail-body');

        // Arrow click → toggle expand/collapse only
        tree.addEventListener('click', (e) => {
            const arrow = e.target.closest('.di-arrow');
            if (!arrow) return;
            const line = arrow.closest('.di-line');
            if (!line) return;
            const parent = line.dataset.idx;
            const children = tree.querySelector(`.di-children[data-parent="${parent}"]`);
            if (!children) return;
            const isOpen = !children.classList.contains('di-collapsed');
            children.classList.toggle('di-collapsed');
            arrow.textContent = isOpen ? '\u25B6' : '\u25BC';
        });

        // Line click (not on arrow) → select element
        tree.addEventListener('click', (e) => {
            if (e.target.closest('.di-arrow')) return;
            const line = e.target.closest('.di-line');
            if (!line) return;

            const idx = parseInt(line.dataset.idx);
            const node = this.nodeMap[idx];
            if (!node) return;

            this.selectedNode = node;

            tree.querySelectorAll('.di-line').forEach(l => l.classList.remove('di-selected'));
            line.classList.add('di-selected');

            this._highlightOnPage(node, detailBody);
        });

        // Filter
        let filterTimer;
        filter.oninput = () => {
            clearTimeout(filterTimer);
            filterTimer = setTimeout(() => {
                this._applyFilter(filter.value, tree);
            }, 150);
        };

        // Refresh
        refresh.onclick = () => {
            this._render(container);
        };
    }

    _highlightOnPage(node, detailBody) {
        const el = node.elementRef;
        const selector = this.toSelector(node);
        this.lastSelector = selector;

        // Scroll + glow on page
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '3px solid #6a5acd';
            el.style.outlineOffset = '2px';
            el.style.transition = 'outline 0.2s';
            setTimeout(() => { el.style.outline = ''; }, 2500);
        } catch (e) {}

        // Build detail panel
        const tagStr = node.tag;
        const idStr = node.id ? `#${node.id}` : '-';
        const clsStr = node.classes.length > 0 ? node.classes.join(' ') : '-';
        const textStr = node.text ? node.text.substring(0, 100) : '-';
        const hiddenStr = node.hidden ? node.hidden : '-';
        const selectorStr = selector;

        // Encode selector safely for the code element
        const encodedSelector = selectorStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        detailBody.innerHTML = `
            <div class="di-detail-grid">
                <div class="di-detail-label">\uD0DC\uADF8</div>
                <div class="di-detail-val"><span class="di-tag">${tagStr}</span></div>
                <div class="di-detail-label">ID</div>
                <div class="di-detail-val"><span class="di-id">${idStr}</span></div>
                <div class="di-detail-label">\uD074\uB798\uC2A4</div>
                <div class="di-detail-val"><span class="di-class">${clsStr}</span></div>
                <div class="di-detail-label">\uD14D\uC2A4\uD2B8</div>
                <div class="di-detail-val di-detail-text">${textStr}</div>
                <div class="di-detail-label">\uC228\uAE68\uAE40</div>
                <div class="di-detail-val"><span class="di-class">${hiddenStr}</span></div>
            </div>
            <div class="di-detail-selector">
                <div class="di-detail-label">\uC0DD\uC131\uB41C \uC140\uB809\uD130</div>
                <div class="di-selector-row">
                    <code class="di-selector-code">${encodedSelector}</code>
                    <div class="di-selector-actions">
                        <button class="di-btn-copy">\u{1F4CB}</button>
                        <button class="di-btn-apply" title="\uD604\uC7AC \uC785\uB825 \uD544\uB4DC\uC5D0 \uC140\uB809\uD130 \uC801\uC6A9">\u{1F4DD} \uC801\uC6A9</button>
                    </div>
                </div>
            </div>
        `;

        // Copy button — closure over selectorStr
        const copyBtn = detailBody.querySelector('.di-btn-copy');
        if (copyBtn) {
            copyBtn.onclick = () => {
                this._copyToClipboard(selectorStr);
                copyBtn.textContent = '\u2705';
                setTimeout(() => { copyBtn.textContent = '\u{1F4CB}'; }, 1500);
            };
        }

        // Apply button → triggers parent callback
        const applyBtn = detailBody.querySelector('.di-btn-apply');
        if (applyBtn) {
            applyBtn.onclick = () => {
                if (this.onApply && selector) {
                    this.onApply(selector);
                    applyBtn.textContent = '\u2705 \uC801\uC6A9\uB428';
                    setTimeout(() => { applyBtn.textContent = '\u{1F4DD} \uC801\uC6A9'; }, 1500);
                }
            };
        }
    }

    _applyFilter(text, tree) {
        this.filterText = text;

        if (!text.trim()) {
            this.build();
            this.renderTree(tree);
            return;
        }

        const keyword = text.toLowerCase();

        // TreeWalker full-text search
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let textNode;
        while (textNode = walker.nextNode()) {
            const content = textNode.textContent.toLowerCase();
            if (content.includes(keyword)) {
                let parent = textNode.parentElement;
                while (parent && parent !== document.body) {
                    const treeNode = this.elementToNode.get(parent);
                    if (treeNode && !treeNode.matched) {
                        treeNode.matched = true;
                    }
                    parent = parent.parentElement;
                }
            }
        }

        // Also filter by tag/class/attr
        this.filterNodes(this.treeData, text);

        tree.innerHTML = this.renderTreeFiltered(this.treeData);
    }

    _copyToClipboard(text) {
        // 1. GM_setClipboard (Tampermonkey native)
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text);
                return;
            }
            if (typeof GM !== 'undefined' && GM.setClipboard) {
                GM.setClipboard(text);
                return;
            }
        } catch (e) {}

        // 2. Modern clipboard API (secure context)
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return;
            }
        } catch (e) {}

        // 3. Legacy fallback (textarea + execCommand)
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (e) {
            console.warn('[DomInspector] \uD074\uB9BD\uBCF4\uB4DC \uBCF5\uC0AC \uC2E4\uD328:', e);
        }
    }

}
