---
name: Il Mio Ricettario
description: Private digital recipe book for Italian families — warm, editorial, tactile
colors:
  terracotta: "oklch(52% 0.13 42)"
  terracotta-deep: "oklch(43% 0.12 42)"
  sage: "oklch(50% 0.08 148)"
  cream-bg: "oklch(97% 0.01 75)"
  ink: "oklch(18% 0.03 55)"
  ink-muted: "oklch(45% 0.04 55)"
  surface-secondary: "oklch(91% 0.02 75)"
  surface-muted: "oklch(91% 0.015 75)"
  border-taupe: "oklch(88% 0.02 75)"
  rust-alert: "oklch(58% 0.22 25)"
typography:
  display:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.24em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  editorial: "29px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.cream-bg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.terracotta-deep}"
    textColor: "{colors.cream-bg}"
  button-outline:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  input-field:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  chip-kicker:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
---

# Design System: Il Mio Ricettario

## 1. Overview

**Creative North Star: "Paper and Terracotta" ("Carta e Terracotta")**

This system aims for the physical consistency of a well-made object: the grain of a fine cream paper and the warm glaze of handmade ceramics. Surfaces must not look like backlit glass panels; they must feel like they have substance. The warmth doesn't come from a "pretty" color smeared everywhere, but from the combination of a cream background that is never white, brown ink that is never black, and a single terracotta accent used as a stamp, not as paint.

It's a cookbook, not an app. Every screen is a page of a curated cookbook: the content (recipe titles in Bodoni, ingredients, steps) is the substance, and the frame serves it quietly. Density is low and airy on reading pages, and may grow only where the user is genuinely managing data (meal planner, pantry, shopping list). The register is "product": familiarity is a virtue, surprise is a cost. The primitives (buttons, inputs, cards) follow known conventions; the personality lives in the editorial layer above them — `shell-stage`, `cinematic-heading`, the terracotta-sage rules.

This system explicitly rejects four things, inherited from PRODUCT.md: *food social* (no huge photos, likes, followers), the *AI/SaaS* aesthetic (no cold dashboards, purple-blue gradients, neon glow, decorative glassmorphism), the *delivery app* (no carts, prices, promotions) and the *corporate* look (no blue, no cold neutral gray).

**Key Characteristics:**
- Warm cream background (`oklch(97% 0.01 75)`), never pure white; dark brown ink (`oklch(18% 0.03 55)`), never black.
- A single terracotta accent as a rare stamp; sage as an even rarer second voice.
- Bodoni Moda for headings (editorial authority), Jost for body (readability in the kitchen).
- Tactile depth on desktop (soft shadows, ambient drift), flat on mobile for performance.
- Generous touch and high contrast: the user reads with flour-covered hands.

## 2. Colors

An earthy, warm palette built entirely in OKLCH around a single family of tones (warm hues ~42–75, plus a sage at 148), so that every surface belongs to the same physical object.

### Primary
- **Terracotta** (`oklch(52% 0.13 42)`): the only true accent. Primary actions, current selection, focus ring, editorial rules. It's a stamp on paper, not paint to spread.
- **Deep Terracotta** (`oklch(43% 0.12 42)`): hover state of primary buttons and accent text on light backgrounds when more contrast is needed.

### Secondary
- **Sage** (`oklch(50% 0.08 148)`): second voice, even rarer than terracotta. Confirmations, positive-state accents, second end of the gradient rules. Never competing with terracotta in the same glance.

### Tertiary
- **Alert Rust** (`oklch(58% 0.22 25)`): destructive/error only (delete, pantry expiries). It's the only high-saturation red allowed, and only as a signal.

### Neutral
- **Cream** (`oklch(97% 0.01 75)`): primary background, card and popover surfaces. The color of the page.
- **Ink** (`oklch(18% 0.03 55)`): main text. Very dark brown, never `#000`.
- **Muted Ink** (`oklch(45% 0.04 55)`): muted text, descriptions, secondary labels. Medium brown — verified on cream at ≥4.5:1 contrast.
- **Dark Cream** (`oklch(91% 0.02 75)`): secondary surface, toolbar/section backdrops, ghost hover states.
- **Light Taupe** (`oklch(88% 0.02 75)`): borders, dividers, input outlines.

### Named Rules
**The Stamp Rule.** Terracotta appears on ≤10% of any screen. It's an ink stamp, not a background tint. Its rarity is what makes it authoritative; if two terracotta elements compete in the same glance, one is too many.

**The Never-White-Never-Black Rule.** No surface is `#ffffff`, no text is `#000000`. The background is always cream, the ink always brown. Pure white gives away the "app"; it breaks the paper illusion.

**The Anti-Cold Rule.** Blue is forbidden, cold neutral gray is forbidden. Every neutral carries warm chroma toward hue 75. A cold gray in this system is a bug, not a choice.

## 3. Typography

**Display Font:** Bodoni Moda (with fallback Georgia, serif)
**Body Font:** Jost (with fallback system-ui, sans-serif)

**Character:** A pairing on an axis of contrast, not similarity: a high-contrast Italian Didone (Bodoni, a revival of Giambattista Bodoni — centuries of Italian publishing and fashion) against a contemporary geometric humanist (Jost). Bodoni brings authority and warmth in its curves; Jost brings readability at every size. The editorial signature is Bodoni **in italics** for page titles and empty states.

### Hierarchy
- **Display** (Bodoni, 600, often italic, ~`text-3xl`/1.875rem, line-height ~1.05): page titles, empty-state headings, editorial moments. Uses `text-wrap: balance`.
- **Headline** (Bodoni, 600, `text-lg`–`text-2xl`): section titles and card titles. `font-display` is applied only to `h1–h4`.
- **Title** (Jost, 600, `text-lg`/1.125rem, leading-none, tracking-tight): compact card titles and panel headers.
- **Body** (Jost, 400, `text-sm`/0.875rem, line-height 1.5): running text, descriptions, values. Prose cap 65–75ch; ingredients and tables may run denser.
- **Label** (Jost, 600, `text-[0.7rem]`, letter-spacing 0.24em, UPPERCASE): editorial kickers and badges. Short labels only (≤4 words).

### Named Rules
**The Editorial Italic Rule.** Italics are reserved for Bodoni in titles and editorial moments (empty states, page headings). Jost body text is never italicized for "emphasis": emphasis in the body comes from weight, not slant.

**The Uppercase-Labels-Only Rule.** Uppercase with 0.24em tracking (`editorial-kicker`) is allowed only on labels of ≤4 words. Never a sentence, never a paragraph in uppercase.

## 4. Elevation

A **hybrid system that depends on device capability**. On desktop (≥1440px) depth is tactile: soft, wide-radius shadows with negative offset (the shadow sits under and inside the object, like paper laid on paper), plus a very faint ambient drift of warm gradients behind `shell-stage`. On mobile (<1440px) the whole decorative layer is removed — borders, shadows and pseudo-elements disappear and `shell-stage` becomes a flat cream tint — because the stage covers the entire viewport and rasterization would bring no perceptible benefit, only cost.

### Shadow Vocabulary (desktop only)
- **Resting card** (`box-shadow: shadow-sm` from Tailwind): minimal lift, the paper just peeling off the page.
- **Editorial panel** (`box-shadow: 0 20px 55px -42px oklch(var(--foreground)/0.3), inset 0 1px 0 oklch(100% 0 0 /0.6)`): diffuse depth with a thread of light at the top, for `shell-panel` and empty states.
- **Stage** (`box-shadow: 0 30px 80px -52px oklch(var(--foreground)/0.28), inset 0 1px 0 oklch(100% 0 0 /0.7)`): the page's outer frame, the widest and softest shadow in the system.

### Named Rules
**The Brown Shadow Rule.** Shadows are never black: they use `oklch(var(--foreground)/α)`, i.e. transparent brown. A black shadow on cream turns cold gray and betrays the warm material.

**The Flat-Mobile Rule.** Below 1440px every depth decoration switches off. Materiality is a desktop luxury; in the kitchen, on a phone, performance and flat tint win.

## 5. Components

The primitives are shadcn/Radix with `class-variance-authority`: familiar on purpose. The character lives in the editorial layer above them.

### Buttons
- **Shape:** soft corners (`rounded-md`, 6px). Fixed heights: `default` 40px, `sm` 36px, `lg` 44px, `icon` 40×40.
- **Primary:** terracotta background, cream text, padding `8px 16px` (`h-10 px-4`). Color-only transition.
- **Hover / Focus:** hover → `bg-primary/90` (shifts toward deep terracotta); focus-visible → 2px terracotta ring with 2px offset on the background. Never remove the focus ring.
- **Secondary / Outline / Ghost / Link:** secondary on dark cream; outline with taupe border on cream, soft sage hover; transparent ghost with soft sage hover; terracotta link with underline-offset. Destructive uses alert rust.

### Chips (kicker)
- **Style:** cream pill with a soft terracotta border (`border-primary/15`), Jost 600 uppercase text with 0.24em tracking in muted ink. Often paired with an icon in a soft-terracotta circle.
- **State:** decorative/label, not interactive. For active filters, the selected chip carries a soft terracotta background and terracotta text.

### Cards / Containers
- **Corner Style:** `rounded-lg` (8px) for standard cards; `rounded-[1.8rem]` (~29px) for editorial panels and empty states.
- **Background:** cream (`bg-card`), with editorial panels on a vertical gradient from cream to a slightly darker cream.
- **Shadow Strategy:** see Elevation — `shadow-sm` at rest on cards, panel shadow on `shell-panel` (desktop only).
- **Border:** 1px taupe (`border`), often at reduced opacity (`border/0.7`).
- **Internal Padding:** `p-6` (24px) standard card padding.
- **Never nested cards.** A card inside a card is always a structural mistake.

### Inputs / Fields
- **Style:** 40px height, taupe border (`border-input`), cream background, `rounded-md`, `text-sm` text. Placeholder in muted ink (never lighter: it must hold 4.5:1).
- **Focus:** 2px terracotta ring with 2px offset (`focus-visible:ring-ring`), no glow.
- **Disabled:** cursor-not-allowed, 50% opacity.

### Navigation
- **Desktop (≥1440px):** sidebar. **Mobile portrait:** bottom navigation (actions in the thumb zone). **Mobile landscape:** hamburger + drawer (sheet). Active state marked in terracotta; labels always present under the icons, never icon-only navigation.

### Signature: the editorial Stage
`shell-stage` and `shell-panel` are the product's signature: frames with a taupe border, radial warm terracotta/sage gradients at very low opacity, a thread of inner light at the top, and (stage) an 18s ambient drift. `cinematic-heading` adds a terracotta→sage→transparent gradient rule under the title. They're what turns a tool page into a cookbook page. Use them for page frames, not for every small container.

## 6. Do's and Don'ts

### Do:
- **Do** keep the cream background (`oklch(97% 0.01 75)`) and brown ink (`oklch(18% 0.03 55)`) everywhere; they're the color of the paper and the ink.
- **Do** use terracotta as a rare stamp (≤10% of the screen): primary actions, selection, focus ring, rules.
- **Do** reserve italic Bodoni for titles and editorial moments; keep body text in regular Jost.
- **Do** tint shadows in transparent brown (`oklch(var(--foreground)/α)`), never black.
- **Do** switch off the decorative depth layer below 1440px; in the kitchen, performance wins.
- **Do** provide generous touch and high contrast: the user reads with busy hands.
- **Do** always label navigation icons; use tracked uppercase only for labels of ≤4 words.

### Don't:
- **Don't** use pure white (`#fff`) for surfaces or pure black (`#000`) for text: it betrays the paper illusion.
- **Don't** introduce blue or cold neutral grays; every neutral carries warm chroma toward hue 75.
- **Don't** slip into the AI/SaaS aesthetic: no purple-blue gradients, neon glow, decorative glassmorphism, cold dashboards.
- **Don't** slip into food social: no huge photos, likes, followers, social counts.
- **Don't** slip into the delivery app: no carts, prices, promotional badges.
- **Don't** nest cards inside cards, use `background-clip: text` with a gradient (gradient text), or use colored side borders >1px as an accent.
- **Don't** put sentences or paragraphs in UPPERCASE; tracked uppercase is only for short kickers.
- **Don't** let terracotta and sage compete in the same glance: sage is the second, rarer voice.
