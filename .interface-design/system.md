# Open Overleaf — Interface Design System

## Direction & Feel

**Product:** Single-user GitHub-backed LaTeX IDE
**User:** Academic / researcher editing LaTeX documents. Late evening, desk lamp on. Precision is comfort.

**Feel:** Dense precision of a terminal, warmth of a lamp-lit study. Ink meeting paper. Not SaaS, not generic.

### Domain
- Parchment, ink, typesetting, composition, academica, manuscript, galley proofs, marginalia, glyphs, tracking/leading, thesis defense

### Color World
Amber desk lamp (#c8a96e), deep charcoal ink (#0d0f14), warm off-white parchment (#e8e4d9), library green (#4a9e78), marginalia red (#b05252), cool vellum (#1a1d25)

### Signature Element
**The Composition Rail** — the file tree is styled as a typeset table of contents. Files are chapters with glyphic prefixes (§ for .tex, ⊕ for .bib, ◈ for images). Active file gets a left amber rule and amber text, like a highlighted marginal note. No generic folder/file icons.

---

## Token System

### CSS Variables
```css
/* Surfaces — same ink hue, shifting lightness only */
--ink-base       /* Canvas background */
--ink-raised     /* Sidebars, toolbar, statusbar */
--ink-elevated   /* Hover states */
--ink-float      /* Toasts, popups */
--ink-overlay    /* Dropdowns */

/* Text — 4 levels */
--quill-primary   /* Main content text */
--quill-secondary /* Supporting labels */
--quill-tertiary  /* Metadata, file types */
--quill-muted     /* Disabled, placeholder */

/* Borders — 5 levels, same hue */
--rule-faint     /* Nearly invisible, subtle rhythm */
--rule-soft      /* Section separators */
--rule-standard  /* Panel borders */
--rule-emphasis  /* Interactive emphasis */
--rule-focus     /* Focus rings (amber) */

/* Accent */
--lamp           /* #c8a96e — amber desk lamp, used sparingly */
--lamp-dim       /* Active state backgrounds */
--lamp-glow      /* Hover state backgrounds */

/* Semantic */
--ink-success / --ink-success-dim
--ink-warn / --ink-warn-dim
--ink-danger / --ink-danger-dim

/* Controls */
--ctrl-bg        /* Input backgrounds */
--ctrl-border    /* Input borders */
--ctrl-hover     /* Hover backgrounds */
```

---

## Depth Strategy

**Borders-only.** No drop shadows anywhere. Elevation is communicated solely through surface color shifts (same hue, different lightness). This matches the dense, technical, ink-on-paper feel.

- Canvas: `--ink-base`
- Panels: `--ink-raised`
- Hover: `--ink-elevated`
- Overlays: `--ink-float`

Active/selected states use `--lamp-dim` background + amber left border (2px).

---

## Spacing

Base unit: **4px**

Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48

---

## Typography

| Role | Font | Size | Weight | Tracking |
|------|------|------|--------|---------|
| UI labels, body | Inter | 13–14px | 400–600 | normal |
| Section headers | Inter | 9–10px | 700 | +0.1em upper |
| Code / paths | JetBrains Mono | 11–13px | 400 | 0 |
| Decorative glyphs | Libre Baskerville | 36–64px | 400 italic | normal |

---

## Border Radius

| Context | Value |
|---------|-------|
| Chips, micro elements | 3px (`--r-xs`) |
| Buttons, inputs | 6px (`--r-sm`) |
| Cards | 10px (`--r-md`) |
| Large containers | 16px (`--r-lg`) |

---

## Component Patterns

### Rail Item (Composition Rail)
```
.rail-item — flex row, 5px 16px padding, 2px left border (transparent → amber on active)
.rail-item-icon — monospace glyph (§ ⊕ ◈ etc), 14px width, centered
.rail-item-name — 12.5px Inter, quill-secondary, truncated
.rail-item-type — 9px mono, quill-muted, right-aligned
```

### Project Card
```
.project-card — padding 12 16, border-bottom rule-soft
.project-name — 13px semi, quill-primary
.project-desc — 11.5px quill-tertiary, truncated 1 line
.project-meta — chips + mono branch name
Active: lamp-dim bg + 2px left amber strip (::before)
```

### Chip
```
.chip — 11px, 2px 8px padding, r-xs, border: 1px
chip-success / chip-warn / chip-amber / chip-neutral
```

### Button
```
.btn-sm — 12px, 4px 10px, r-sm, ctrl-bg/border, hover: ctrl-hover/rule-emphasis
.btn-primary — lamp-dim bg, amber border, lamp color
.btn-ghost — transparent, hover: ctrl-hover
.btn-icon — 28×28, transparent, hover: ctrl-hover border
```

---

## Layout

```
app-shell: grid rows 44px / 1fr, height 100vh
app-titlebar: flex, 44px, ink-raised, rule-standard border-bottom
app-body: grid cols 240px / 1fr / 320px
  rail-panel: ink-raised, rule-standard border-right
  editor-panel: ink-base, flex col
  preview-panel: ink-raised, rule-standard border-left
```

---

## Animation

- `--t-micro: 100ms` — hover state changes
- `--t-fast: 160ms` — button transitions, theme toggle
- `--t-med: 240ms` — toast appear/disappear
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (decelerate, no bounce)
