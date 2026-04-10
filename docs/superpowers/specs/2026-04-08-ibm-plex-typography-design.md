# IBM Plex Typography — Design Spec
**Date:** 2026-04-08
**Modules affected:** `src/index.css`, `src/pages/PLPrintView.tsx`, all `.tsx` files with inline monospace styles

---

## Goal

Replace Inter (body) and browser-default monospace (codes, addresses) with the IBM Plex type family — IBM Plex Sans for UI text, IBM Plex Mono for all monospace elements — to establish a stronger, more distinctive typographic identity appropriate for an industrial WMS interface.

---

## Approach

Minimal font swap. No layout changes, no colour changes, no component logic changes.

Font loading via `@fontsource` npm packages — self-hosted, bundled by Vite, no external CDN dependency. Appropriate for warehouse environments that may operate on local networks.

---

## Changes

### 1. Install packages

```bash
npm install @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
```

### 2. `src/index.css`

Import the weights used across the app, update the `--font-sans` Tailwind token, and update the `body` font-family declaration.

**Imports to add at top of file:**
```css
@import '@fontsource/ibm-plex-sans/400.css';
@import '@fontsource/ibm-plex-sans/500.css';
@import '@fontsource/ibm-plex-sans/600.css';
@import '@fontsource/ibm-plex-sans/700.css';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/700.css';
```

**In `@theme` block — update:**
```css
--font-sans: 'IBM Plex Sans', system-ui, sans-serif;
```

**In `body` — update:**
```css
font-family: 'IBM Plex Sans', system-ui, sans-serif;
```

### 3. `src/pages/PLPrintView.tsx`

The print view has its own explicit font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`). Replace with:
```
'IBM Plex Sans', system-ui, sans-serif
```

### 4. Inline monospace styles — automated search-replace

62 instances of `fontFamily: 'monospace'` across `.tsx` files. Because inline styles have higher specificity than CSS body rules, `fontFamily: 'monospace'` cannot be overridden via a global stylesheet — a browser will resolve it to Courier New / Menlo regardless of body font settings.

Replace all instances with:
```
fontFamily: "'IBM Plex Mono', monospace"
```

This is a purely mechanical substitution — no logic changes.

---

## Weight mapping note

IBM Plex Sans has weights 100–700. The codebase uses `fontWeight: 800` in several places (rack pill, BPU label). With IBM Plex Sans, weight 800 silently maps to 700 (browser nearest-weight behaviour). The visual difference is negligible and no changes are needed.

---

## Out of scope

- Dark mode
- Colour changes
- Layout changes
- Any other font customisation (line-height, letter-spacing, etc.)
- Sidebar, Dashboard, or any non-typography visual change

---

## Files affected

| File | Change |
|---|---|
| `package.json` | Add `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` |
| `src/index.css` | 6 `@import` lines + update `--font-sans` + update `body` font-family |
| `src/pages/PLPrintView.tsx` | Update print font stack |
| All `.tsx` files (62 instances) | `'monospace'` → `"'IBM Plex Mono', monospace"` |
