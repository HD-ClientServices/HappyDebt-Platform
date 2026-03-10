# HappyDebt Atomic Design System (AI QA Rulebook)

This document serves as the absolute source of truth and evaluation parameters for any AI agent designing or implementing UI components for the HappyDebt platform. 

## 1. Core Principles
- **Aesthetic**: Claude Console Dark Mode (Ultra-minimalist, high-contrast borders, dark background) combined with HappyDebt's modern branding.
- **Methodology**: Strict adherence to Atomic Design (Atoms → Molecules → Organisms → Templates → Pages).
- **Precision**: 1px solid borders, consistent small border radii, high readability.

---

## 2. Atoms (The Fundamentals)

### 2.1 Colors
All colors must use semantic CSS variables mapped in Tailwind.
- **Background (`--background`)**: `#0a0a0a` (Near Black)
- **Card/Surface (`--card`)**: `#121212`
- **Foreground/Text (`--foreground`)**: `#fafafa` (Off-White)
- **Muted Text (`--muted-foreground`)**: `#a1a1aa` (Zinc-400)
- **Borders (`--border`)**: `#27272a` (Zinc-800) - Thin, distinct lines.
- **Primary Accent (`--primary`)**: `#7c3aed` (Purple-600) - Represents HappyDebt's brand purple optimized for dark mode.
- **Primary Accent Foreground (`--primary-foreground`)**: `#ffffff`

### 2.2 Typography
- **Headings (H1, H2, H3, H4)**: `Space Grotesk` (Geometric, modern, bold weights).
- **Body & UI Elements**: `Inter` (Legible, neutral).
- **Letter Spacing**: Tighter on headings (`-0.02em`), normal on body.

### 2.3 Spacing & Layout
- Based on an 8px grid (`p-2`, `p-4`, `p-6`, etc.).
- Margins between major sections should be generous (`mb-8` or `mb-12`).

### 2.4 Border Radius
- **Cards/Containers**: `8px` (`rounded-lg`) or `12px` (`rounded-xl`). Never fully rounded.
- **Buttons (Primary/Secondary)**: `9999px` (`rounded-full`) for pill-shaped buttons to match HappyDebt's branding.
- **Inputs**: `6px` (`rounded-md`).

### 2.5 Borders
- **Thickness**: Strictly `1px`.
- **Style**: Solid.
- **Color**: `--border` (`#27272a`).

---

## 3. Molecules (Simple UI Components)

### 3.1 Buttons
- **Primary**: Pill shaped, `--primary` background, white text. Hover state slightly lighter.
- **Secondary (Outline)**: Pill shaped, transparent background, `1px solid --border`, `--foreground` text. Hover state `--muted` background.
- **Ghost**: No background or border until hovered.

### 3.2 Inputs & Forms
- Minimalist fields. `1px solid --border`, background transparent or `--card`. Focus state should highlight border to `--primary` or a white ring, not a heavy glow.

### 3.3 Badges
- Small rounded indicators. Subtle background (e.g., 10% opacity of primary color) with primary colored text, or solid `--muted` background.

---

## 4. Organisms (Complex Components)

### 4.1 Stat Cards (Claude Console Style)
- Contains a title (muted), a main value (large, Space Grotesk), and optionally a chart or secondary value.
- Must be wrapped in a `1px solid --border` container with `rounded-xl` and `--card` background.

### 4.2 Data Tables
- Clean, no vertical dividers.
- `1px solid --border` on the bottom of header rows.
- Hover states on rows should use `--muted` background.

### 4.3 Navigation Sidebar
- Left-aligned, fixed width.
- Very subtle distinction from main background or separated by a `1px` right border.
- Active items highlighted with a subtle `--muted` background or a left-border accent.

---

## 5. QA Evaluation Checklist for AI
When generating new code, the AI must verify:
1. [ ] Are we using `Space Grotesk` for headings and `Inter` for body?
2. [ ] Are borders exactly `1px` thick using the `--border` variable?
3. [ ] Is the primary accent purple (`#7c3aed` or similar)?
4. [ ] Are buttons pill-shaped (`rounded-full`)?
5. [ ] Is the background dark (`#0a0a0a`) and text high contrast?
6. [ ] Does the layout feel like a developer tool (dense, structured, bordered) but with consumer brand touches?
