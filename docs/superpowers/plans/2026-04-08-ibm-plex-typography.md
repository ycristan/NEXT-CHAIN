# IBM Plex Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Inter (body) and browser-default monospace with IBM Plex Sans + IBM Plex Mono across the entire app.

**Architecture:** Three independent changes — install packages + update CSS root, fix the print view's own font stack, then replace 62 inline `fontFamily: 'monospace'` instances with `'IBM Plex Mono', monospace` via a single automated command.

**Tech Stack:** @fontsource npm packages, Vite (bundles font files as static assets), React 19 + TypeScript

---

## File Map

| File | Change |
|---|---|
| `package.json` | Add `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` (via npm install) |
| `src/index.css` | 6 `@import` lines at top; update `--font-sans`; update `body { font-family }` |
| `src/pages/PLPrintView.tsx:94` | Update CSS template literal print font stack |
| 17 `.tsx` files (62 instances) | Automated sed replace: `fontFamily: 'monospace'` → `fontFamily: "'IBM Plex Mono', monospace"` |

---

## Task 1: Install @fontsource packages and update index.css

**Files:**
- Modify: `src/index.css:1-6` (add imports at top)
- Modify: `src/index.css:6` (`--font-sans` in `@theme`)
- Modify: `src/index.css:48` (`body { font-family }`)

This project has no unit tests — verification is via build success and visual browser check.

- [ ] **Step 1: Install the font packages**

```bash
cd "C:/Users/yuridelima/Desktop/Projetos Programacao/NEXT Warehouse Manager"
npm install @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
```

Expected output: `added 2 packages` (or similar). No errors.

- [ ] **Step 2: Add @import lines at the top of `src/index.css`**

Open `src/index.css`. The first line is currently `@import "tailwindcss";`.

Add the following 6 lines immediately after line 1 (after the `@import "tailwindcss";` line), leaving a blank line before `@custom-variant`:

```css
@import "tailwindcss";

@import '@fontsource/ibm-plex-sans/400.css';
@import '@fontsource/ibm-plex-sans/500.css';
@import '@fontsource/ibm-plex-sans/600.css';
@import '@fontsource/ibm-plex-sans/700.css';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/700.css';

@custom-variant dark (&:is(.dark *));
```

- [ ] **Step 3: Update `--font-sans` in the `@theme` block**

Current line 6:
```css
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
```

Replace with:
```css
  --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
```

- [ ] **Step 4: Update `body { font-family }` declaration**

Current line 48:
```css
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Replace with:
```css
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
```

- [ ] **Step 5: Start dev server and visually verify IBM Plex Sans is loading**

```bash
npm run dev
```

Open the app in a browser. Navigate to any page (e.g. Login or Inventory). Open DevTools → Elements → computed styles on any text node. The `font-family` resolved value should show `IBM Plex Sans`. If it shows `Inter` or `system-ui`, the imports are not loading — double-check the `@import` paths (they must come after `@import "tailwindcss"`).

- [ ] **Step 6: Run build to confirm no errors**

```bash
npm run build
```

Expected: build completes with no errors. Font files will be emitted into the `dist/assets/` folder.

- [ ] **Step 7: Commit**

```bash
git add src/index.css package.json package-lock.json
git commit -m "feat: replace Inter with IBM Plex Sans via @fontsource"
```

---

## Task 2: Fix PLPrintView.tsx print font stack

**Files:**
- Modify: `src/pages/PLPrintView.tsx:94`

The print view has its own `@media screen` CSS template literal with `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` — it does not inherit from `body` because the print root is positioned fixed, overriding inheritance. This line must be updated separately.

- [ ] **Step 1: Open `src/pages/PLPrintView.tsx` and locate line 94**

The line currently reads:
```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

It lives inside a `@media screen` CSS template literal block.

- [ ] **Step 2: Replace the font stack**

Replace line 94 with:
```
font-family: 'IBM Plex Sans', system-ui, sans-serif;
```

Full surrounding context for reference (lines 89–96):
```tsx
  @media screen {
    #pl-print-root {
      position: fixed; inset: 0; z-index: 9999;
      background: #fff; overflow: auto;
      padding: 32px 40px 60px;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
  }
```

- [ ] **Step 3: Visually verify in dev server**

With dev server running, navigate to the Picking Line module, select a rack, and open the print preview (print button). The printed layout should render in IBM Plex Sans, not in the system default sans-serif.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PLPrintView.tsx
git commit -m "feat: update PLPrintView print font stack to IBM Plex Sans"
```

---

## Task 3: Replace inline monospace styles with IBM Plex Mono

**Files:**
- Modify: 17 `.tsx` files under `src/` (62 total instances of `fontFamily: 'monospace'`)

All 62 instances follow the exact same pattern in JSX inline styles: `fontFamily: 'monospace'`. The sed command below replaces them all in one pass. No logic changes — purely a string substitution.

After this change, `fontFamily: 'monospace'` → `fontFamily: "'IBM Plex Mono', monospace"`. In CSS this produces `font-family: 'IBM Plex Mono', monospace` — IBM Plex Mono loads first, with the generic `monospace` family as fallback.

- [ ] **Step 1: Verify the current count (baseline)**

```bash
grep -r "fontFamily: 'monospace'" src --include="*.tsx" | wc -l
```

Expected output: `62`

If the number is different from 62, stop and investigate before proceeding.

- [ ] **Step 2: Run the automated replacement**

```bash
find src -name "*.tsx" -print0 | xargs -0 sed -i "s|fontFamily: 'monospace'|fontFamily: \"'IBM Plex Mono', monospace\"|g"
```

This command:
- Finds all `.tsx` files under `src/`
- For each file, replaces every occurrence of `fontFamily: 'monospace'` with `fontFamily: "'IBM Plex Mono', monospace"`
- The `-i` flag edits files in-place

- [ ] **Step 3: Verify zero remaining instances**

```bash
grep -r "fontFamily: 'monospace'" src --include="*.tsx" | wc -l
```

Expected output: `0`

If not 0, run `grep -r "fontFamily: 'monospace'" src --include="*.tsx"` to see which files were missed, and edit them manually.

- [ ] **Step 4: Verify the replacement looks correct in a sample file**

```bash
grep -n "IBM Plex Mono" src/pages/PickingLine.tsx | head -5
```

Expected: lines showing `fontFamily: "'IBM Plex Mono', monospace"`. Confirm the double/single quote nesting is correct — the outer quotes are double, the inner are single.

- [ ] **Step 5: Run TypeScript build to confirm no syntax errors**

```bash
npm run build
```

Expected: build completes with no errors. If there are TypeScript errors about string syntax, check the quote nesting in the affected file.

- [ ] **Step 6: Run lint**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 7: Visual verify IBM Plex Mono in browser**

With dev server running, open the Picking Line module. Bin addresses (e.g. "40 A01"), brand codes, and the zoom percentage should all render in IBM Plex Mono. Open DevTools → Elements → computed styles on any of these elements to confirm `font-family` resolves to `IBM Plex Mono`.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "feat: replace inline monospace font with IBM Plex Mono across all components"
```
