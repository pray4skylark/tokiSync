# DomInspector Refactor Task

## Goal
Refactor `src/core/ui/DomInspector.js` — expand detection range, add CSS evasion detection, pseudo-element support, Shadow DOM, full-text TreeWalker filter, stronger selector generation, performance chunking.

## Requirements

### 1. simplify() — Range Expansion
- Remove `maxDepth` limit (set to 999 or Infinity, keep configurable)
- shrink `skip`: only `['script','style']` remain. Remove `link,meta,noscript,iframe,svg,path,br,hr,wbr`
- Relax `noLayout`: skip only if `display:none` OR `visibility:hidden`. For `opacity:0`, `offscreen`, `clip` etc → set `hidden` flag value instead of skipping
- `attrs` expansion:
  - `classList` → store as `{key: val}` string map (e.g. `class`, `id`, etc.)
  - Collect ALL `data-*` attributes
  - Collect `aria-*`, `role`, `style`, `loading`, `alt`, `title`, `href`, `src`
  - Already existing: `href,src,data-num,data-src,data-lazy,data-original,alt,title,value,type,name,data-id`
  - KEEP these plus add all `data-*` via iteration, plus `style`, `role`, `aria-*`, `loading`
- **Remove all `fullText` collection** — will be handled by TreeWalker in filter

### 2. CSS Evasion Detection (hidden flag)
Replace boolean `hidden` with string `hidden` flag:
- `display:none` → `"display-none"`
- `visibility:hidden` → `"visibility-hidden"` 
- `opacity < 0.5` → `"faded"`
- `position:absolute` + (`left:-9999` OR `top:-9999`) → `"offscreen"`
- `clip-path` starts with `inset(50%)` → `"clipped"`
- `font-size: 0` → `"zero-font"`
- `pointer-events: none` → `"no-pointer"`  (info only, don't hide)
- No issue → null

In render: `hidden` is truthy → `di-dimmed` class + tooltip showing the reason.

### 3. Pseudo-elements
After processing element children, check `::before`:
```js
const before = getComputedStyle(element, '::before');
if (before.content && before.content !== 'none' && before.content !== 'normal') {
  node.children.push({
    type: 'pseudo', name: '::before', content: before.content,
    hidden: null, children: []
  });
}
```
Same for `::after`.

### 4. Shadow DOM
```js
if (element.shadowRoot) {
  for (const child of element.shadowRoot.childNodes) {
    const s = this.simplify(child, depth + 1);
    if (s) { s.shadow = true; node.children.push(s); }
  }
}
```

### 5. Filter — TreeWalker full-text search
Current `filterNodes()` checks `node.text` only. Replace approach:

In `_applyFilter()`:
- If no text → rebuild normal tree
- If text:
  1. Walk DOM with `document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)`
  2. For each text node where `textContent.toLowerCase().includes(keyword)`:
     - Climb parentElement chain
     - Look up each parent in `nodeMap` (by `elementRef === parent`)
     - If found AND not already matched → set `matched = true`
  3. Also filter all tree nodes by tag/class/attr as before (to preserve non-text search)
  4. renderTreeFiltered() unchanged

To support this, maintain reverse index: build `this.elementToNode = new Map()` during simplify(), mapping `elementRef → node`.

Performance: 150ms debounce already exists.

### 6. toSelector() Enhancement
Add `nth-of-type` + attribute selector fallback:

```js
toSelector(node) {
  // 1. id unique → #id
  // 2. class unique → tag.class
  // 3. data attribute unique → tag[data-x="y"]
  // 4. nth-of-type (preferred)
  // 5. nth-child (fallback)
  // 6. path with attribute segments
}
```

When climbing path:
```js
if (parent) {
  const sameTag = Array.from(parent.children).filter(c => c.tagName === el.tagName);
  if (sameTag.length > 1) {
    const nth = sameTag.indexOf(el) + 1;
    seg += `:nth-of-type(${nth})`;   // use nth-of-type instead of nth-child
  }
}
```

### 7. Performance Chunking
- `renderTree()`: If total nodes > 200, use `requestAnimationFrame` chunking
- `nodeMap` → `this.nodeMap.push(node)` still, but render in batches of 100
- Keep sync render for ≤200 nodes (no perceivable delay)

### 8. Code Structure
- Extract config to static getter or constructor options:
```js
constructor(options = {}) {
  this.options = {
    enablePseudo: true,
    enableShadow: true,
    maxDepth: 999,
    ...options
  };
}
```

## Output
- Only modify `src/core/ui/DomInspector.js`
- Keep class name, constructor signature, show(), build(), toSelector() public API identical
- After implementation, run `npm run build:core` to verify no syntax errors

## Verification
1. `npm run build:core` — must succeed
2. Check that `FormRuleEditor.js` still works (import unchanged)
