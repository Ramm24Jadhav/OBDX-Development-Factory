# Design tokens

The factory's design tokens are CSS custom properties at the top of `factory-ui/src/css/app.css`. Pages and
components use only these (never raw colours that should change with the theme); the dark theme (`<html data-theme="dark">`) redefines only the tokens. `npm run check:tokens` (also run by every UI build) fails
when a style uses a token that is not defined. This file is generated from the stylesheet.

Naming: `--fx-<role>[-<variant>]`, for example `--fx-primary-text` or `--fx-surface-2`. Status colours come in three: the
strong colour for fills and icons, `-text` for text (WCAG AA on surfaces and tints), `-soft` for tinted backgrounds.


## Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--fx-primary` | `#4f46e5` | `#4f46e5` | Filled primary buttons, selected states, focus accents |
| `--fx-primary-hover` | `#4338ca` | `#5b55eb` |  |
| `--fx-primary-active` | `#3730a3` | `#4338ca` |  |
| `--fx-primary-text` | `#4338ca` | `#a5b4fc` | Links and primary-coloured text (readable on surfaces) |
| `--fx-primary-soft` | `#eef2ff` | `rgba(99, 102, 241, 0.16)` | Tinted backgrounds: selected rows, chips, info boxes |
| `--fx-primary-border` | `#c7d2fe` | `rgba(129, 140, 248, 0.45)` | Borders of secondary buttons and selected chips |
| `--fx-on-primary` | `#ffffff` | same |  |
| `--fx-secondary` | `#0ea5e9` | same |  |
| `--fx-violet` | `#7c3aed` | same |  |
| `--fx-violet-text` | `#6d28d9` | `#c4b5fd` |  |
| `--fx-violet-soft` | `#f3e8ff` | `rgba(139, 92, 246, 0.18)` |  |
| `--fx-gradient-brand` | `linear-gradient(135deg, #3b82f6 0%, #4f46e5 55%, #8b5cf6 100%)` | same |  |

## Status: the strong colour for fills and icons, -text for text on light surfaces (WCAG AA), -soft for tints

| Token | Light | Dark | Use |
|---|---|---|---|
| `--fx-success` | `#10b981` | same |  |
| `--fx-success-text` | `#047857` | `#34d399` | Success text on surfaces and tints |
| `--fx-success-soft` | `#ecfdf5` | `rgba(16, 185, 129, 0.14)` |  |
| `--fx-warning` | `#f59e0b` | same |  |
| `--fx-warning-text` | `#b45309` | `#fbbf24` | Warning text |
| `--fx-warning-soft` | `#fffbeb` | `rgba(245, 158, 11, 0.14)` |  |
| `--fx-danger` | `#ef4444` | same |  |
| `--fx-danger-text` | `#b91c1c` | `#f87171` | Error text |
| `--fx-danger-soft` | `#fef2f2` | `rgba(239, 68, 68, 0.14)` |  |
| `--fx-info` | `#0284c7` | same |  |
| `--fx-info-text` | `#0369a1` | `#38bdf8` | Information text |
| `--fx-info-soft` | `#f0f9ff` | `rgba(14, 165, 233, 0.14)` |  |

## Neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `--fx-bg` | `#fafafc` | `#0b1120` | Page background |
| `--fx-surface` | `#ffffff` | `#111827` | Cards, inputs, menus |
| `--fx-surface-2` | `#f8fafc` | `#162032` | Subtle fills: table headers, hovered rows |
| `--fx-surface-3` | `#f1f5f9` | `#1e293b` | Stronger fills: tracks, pressed states |
| `--fx-border` | `#e5e7eb` | `#263247` | Card and divider borders |
| `--fx-border-strong` | `#cbd5e1` | `#3b4a63` | Input borders |
| `--fx-text` | `#0f172a` | `#e5e7eb` | Headings and main text |
| `--fx-text-body` | `#334155` | `#cbd5e1` | Body text |
| `--fx-text-muted` | `#64748b` | `#94a3b8` | Secondary text and placeholders (4.5:1) |
| `--fx-text-faint` | `#94a3b8` | `#64748b` | Decorative text only (below 4.5:1) |
| `--fx-disabled` | `#cbd5e1` | `#475569` |  |

## Navigation

| Token | Light | Dark | Use |
|---|---|---|---|
| `--fx-nav-bg` | `#0f172a` | `#070b16` |  |
| `--fx-nav-bg-2` | `#1e1b4b` | `#151338` |  |
| `--fx-nav-text` | `#cbd5e1` | same |  |
| `--fx-nav-muted` | `#8b97b8` | same |  |
| `--fx-nav-text-strong` | `#ffffff` | same |  |
| `--fx-nav-active` | `linear-gradient(90deg, #4f46e5, #6366f1)` | same |  |
| `--fx-nav-hover` | `rgba(255, 255, 255, 0.07)` | same |  |

## Type: Inter when installed, then the system UI font

| Token | Light | Dark | Use |
|---|---|---|---|
| `--fx-font` | `Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif` | same |  |
| `--fx-font-mono` | `"Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace` | same |  |
| `--fx-text-display` | `clamp(2rem, 3vw + 1rem, 3.1rem)` | same |  |
| `--fx-text-h1` | `clamp(1.5rem, 1.4vw + 1.05rem, 2rem)` | same |  |
| `--fx-text-h2` | `clamp(1.25rem, 0.9vw + 1rem, 1.5rem)` | same |  |
| `--fx-text-h3` | `clamp(1.0625rem, 0.45vw + 0.95rem, 1.25rem)` | same |  |
| `--fx-text-lg` | `clamp(1rem, 0.2vw + 0.95rem, 1.0625rem)` | same |  |
| `--fx-text-h4` | `1rem` | same |  |
| `--fx-text-md` | `0.9375rem` | same |  |
| `--fx-text-h5` | `0.875rem` | same |  |
| `--fx-text-base` | `0.875rem` | same |  |
| `--fx-text-sm` | `0.8125rem` | same |  |
| `--fx-text-caption` | `0.75rem` | same |  |
| `--fx-text-2xs` | `0.6875rem` | same |  |
| `--fx-text-overline` | `0.6875rem` | same |  |
| `--fx-weight-semibold` | `600` | same |  |
| `--fx-weight-medium` | `500` | same |  |

## Space, shape, depth, motion

| Token | Light | Dark | Use |
|---|---|---|---|
| `--fx-space-1` | `4px` | same |  |
| `--fx-space-2` | `8px` | same |  |
| `--fx-space-3` | `12px` | same |  |
| `--fx-space-4` | `16px` | same |  |
| `--fx-space-5` | `20px` | same |  |
| `--fx-space-6` | `24px` | same |  |
| `--fx-radius-sm` | `6px` | same |  |
| `--fx-radius` | `8px` | same |  |
| `--fx-radius-lg` | `12px` | same |  |
| `--fx-radius-xl` | `16px` | same |  |
| `--fx-radius-pill` | `999px` | same |  |
| `--fx-shadow-sm` | `0 1px 2px rgba(15, 23, 42, 0.06)` | `0 1px 2px rgba(0, 0, 0, 0.4)` |  |
| `--fx-shadow` | `0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.05)` | `0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)` |  |
| `--fx-shadow-lg` | `0 12px 32px rgba(15, 23, 42, 0.14)` | `0 12px 32px rgba(0, 0, 0, 0.5)` |  |
| `--fx-focus` | `0 0 0 3px rgba(79, 70, 229, 0.28)` | `0 0 0 3px rgba(129, 140, 248, 0.4)` | Focus ring (box-shadow) |
| `--fx-focus-color` | `#4f46e5` | `#818cf8` |  |
| `--fx-duration` | `0.15s` | same |  |
| `--fx-control-height` | `36px` | same | Height of buttons and fields (30px in compact density) |
| `--fx-control-height-sm` | `30px` | same |  |
| `--fx-control-height-lg` | `42px` | same |  |

## Modes

- **Light / Dark / System**: `preferences.theme` (Account & Preferences, the top bar, the command palette).
- **Compact density**: `preferences.density = 'compact'` sets `body.fx-compact`, which lowers the control heights and table padding.
- **More contrast**: when the system asks for it (`prefers-contrast: more`), borders and muted text get stronger in both themes.
- **Reduced motion**: `prefers-reduced-motion: reduce` turns animations and transitions off everywhere.
