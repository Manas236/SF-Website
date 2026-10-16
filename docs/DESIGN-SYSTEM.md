# Samruddhi Fire website: design system

## 0. Source of the brand

The website takes its brand from the **Samruddhi Fire QMS**, the company's own
quotation and operations app, so the two read as one company:

- **Folder:** `C:\Users\infra\dev\Demo_Works` (read-only; nothing there was changed)
- **Colour, radius and shadow values:** `branding.py`, section 2 "PALETTE"
  (`RED`, `RED_DK`, `RED_LT`, `NAVY`, `NAVY_DK`, `NAVY_LT`, `SAFFRON`,
  `RED_ON_DARK`, `INK`, `MUTED`, `BORDER`, `SURFACE`, `CANVAS`) and its
  `CSS_TOKENS` block (`--radius`, `--shadow-sm`, `--shadow-md`, `--font`)
- **Type, buttons, cards, nav:** `chrome.py`, `BASE_STYLES`
- **Placeholder chip colours:** `branding.py`, `.todo-chip`
- **Logo:** `assets/logo-mark.png` (the SF roundel, 1024 px, transparent),
  `assets/logo.png`, `assets/favicon.ico`, `assets/favicon-32.png`

The QMS has no separate "landing page" template (its HTML lives in Python
strings, there is no `templates/` folder). On 16 Oct 2026 the developer,
Manas Gawde, confirmed it as the single brand source: DM Sans, red and navy on a
light ground, the roundel logo, the QMS's exact values. The original brief's
"Poppins, dark ember" was withdrawn. The footer credit line "Designed &
developed by Manas Gawde" is kept.

All values live in `src/styles/tokens.css` and nowhere else.

## 1. Colour

| Token | Value | QMS name | Use |
| --- | --- | --- | --- |
| `--sf-red` | `#D5121A` | `RED` | Primary actions (Call Now, Send), active nav, accents. The "S" of the roundel and SAMRUDDHI in the wordmark. |
| `--sf-red-dark` | `#A50D14` | `RED_DK` | Hover and pressed state of red. |
| `--sf-red-light` | `#FDECEC` | `RED_LT` | Icon wells, tinted pills, hover tint. |
| `--sf-red-on-dark` | `#FF5A5F` | `RED_ON_DARK` | Red text on navy (the print red goes muddy on dark). |
| `--sf-navy` | `#2A086E` | `NAVY` | Headings, wordmark FIRE, pills, navy buttons. |
| `--sf-navy-dark` | `#1C0449` | `NAVY_DK` | Dark bands: page heroes, CTA band, footer. |
| `--sf-navy-light` | `#EDEAF9` | `NAVY_LT` | Pill ground; body text on navy. |
| `--sf-saffron` | `#F2944A` | `SAFFRON` | Small accents only (a link on navy, the edit-mode outline). Never a surface. |
| `--sf-ink` | `#1A1626` | `INK` | Body text. |
| `--sf-muted` | `#6B6478` | `MUTED` | Secondary text. |
| `--sf-border` | `#E4E0EC` | `BORDER` | Hairlines, card borders, image wells. |
| `--sf-surface` | `#FFFFFF` | `SURFACE` | Cards, nav bar. |
| `--sf-canvas` | `#F6F4F9` | `CANVAS` | The page ground. |
| `--sf-todo-bg` / `-ink` / `-border` | `#FFF4D6` / `#8A5A00` / `#E0A93B` | `.todo-chip` | Placeholders (section 9). |

The ground is light. Navy is the only dark surface. No other colours: no
gradients except the photo scrims (black at low alpha) and the hero overlay
(navy-dark at alpha), no second accent.

## 2. Type

DM Sans, self-hosted through `@fontsource/dm-sans` (OFL), at the QMS's four
weights: 400 body, 500 nav and labels, 600 buttons and small headings, 700
headings and the wordmark. Base 16 px, line height 1.6 (the QMS's `html`).
The three weights above the fold are preloaded, and a metric-matched Arial
fallback ("DM Sans Fallback") takes the same space, so the swap does not move
anything.

| Role | Size | Weight |
| --- | --- | --- |
| Page H1 | `clamp(2rem, 5.5vw, 3.25rem)` | 700 |
| Section H2 | `clamp(1.6rem, 3.6vw, 2.25rem)` | 700 |
| Card title | 1.05rem to 1.25rem | 700 (QMS `.card-title`) |
| Body | 1rem; lead 1.1rem to 1.2rem | 400 |
| Card text | 0.95rem, line height 1.6 | 400 (QMS `.card-desc`, slightly larger for reading) |
| Pill | 0.72rem, uppercase, +0.04em | 600 (QMS `.nav-pill`) |

Headings are navy; text is ink; secondary text is muted.

## 3. Shape and elevation

| Token | Value | QMS | Use |
| --- | --- | --- | --- |
| `--sf-radius-card` | 14px | `--radius` | Cards, panels, photos, the map |
| `--sf-radius-icon` | 12px | `.card-icon` | Icon wells |
| `--sf-radius-button` | 8px | `.btn` | Buttons, inputs |
| `--sf-radius-pill` | 20px | `.nav-pill` | Pills |
| `--sf-shadow-sm` | `0 1px 3px rgba(26,22,38,.08), 0 1px 2px rgba(26,22,38,.06)` | `--shadow-sm` | Cards and the nav at rest |
| `--sf-shadow-md` | `0 6px 20px rgba(42,8,110,.14), 0 2px 6px rgba(26,22,38,.08)` | `--shadow-md` | Card hover, the Services menu |

## 4. Components (global.css)

- `.sf-container`: the page column, 1200px max, 20px gutters (32px from 640px).
- `.sf-pill` (navy on navy-light), `.sf-pill-red`: the QMS nav pill, used as the label above a heading.
- `.sf-btn` + `.sf-btn-primary` (red), `.sf-btn-ghost` (red outline; white outline on navy), `.sf-btn-navy`, `.sf-btn-light` (white on navy bands). 44px minimum height for touch.
- `.sf-card`: white, hairline border, 14px corners, small shadow. Add `data-card` for the hover (section 6).
- `.sf-icon`: the QMS card icon well, 48px, red-light ground, red 1.8px stroke icon (`src/data/icons.ts`).

## 5. Layout and breakpoints

Tailwind defaults (`sm 640`, `md 768`, `lg 1024`) plus one custom step, `1080px`,
where the nav goes from drawer to bar. The nav is fixed and 72px tall; the
first band of each page clears it. Bands alternate canvas and white; navy is
used for the page heroes, the closing call band and the footer. Checked at 360,
390 and 1280 wide with no horizontal scroll (`npm run check:site`).

## 6. Motion

All of it is `src/styles/motion.css` (timing) and `src/scripts/reveal.js`
(scroll reveal). Every duration, distance and curve is a `--sf-motion-*`
property in motion.css section 0, and `--sf-motion-pace` scales them all.

- The Services menu unrolls from the bar while its items drop in one by one;
  the phone drawer's links do the same. Closing is instant.
- Blocks below the fold fade up 24px once as they arrive.
- The homepage hero's headline, sub-line and buttons fade up on load from 35%
  opacity (never lower: the headline is the page's LCP element).
- Pointer devices only: photos zoom 4% inside their frame, arrows nudge 3px,
  cards lift 5px with the deeper shadow and a 3px red bar drawn across the top
  (the QMS's `.card:hover`), buttons rise 1px (the QMS's `.btn:hover`).

Off under reduced motion, with no JavaScript, in edit mode (`data-nt-mode`),
on `/studio/*` and in print. Only opacity and transform move (plus the menu
panel's clip-path), never layout.

## 7. Photography

Stock until the client's own photos arrive (docs/IMAGE-CREDITS.md). Subjects:
sprinklers, extinguishers, alarm panels, detectors, hydrants and hose reels,
red fire-line pipework, technicians servicing equipment, core drilling.
Never: firefighters, fire engines, burning buildings, flames as the subject,
visible brand logos, foreign signage. All photos are cropped 3:2 and served as
WebP at 480/960/1600 with a JPEG fallback.

Every photo on a page is either a gallery tile or an **image slot**
(`src/data/image-slots.ts`): the studio's "Site images" panel can point any
slot at any gallery photo, and upload replaces stock without code.

## 8. Copy rules (visitor-facing)

- **No em dashes** anywhere a visitor or search engine can see: titles, meta,
  JSON-LD, copy, alt text, captions, buttons, form messages, the 404, email
  subjects. Rewrite with a comma, colon, full stop or "and"; never a spaced
  hyphen. En dashes are fine in number ranges only.
- Titles: `<Page> | Samruddhi Fire`; the homepage is `Samruddhi Fire`.
- Meta descriptions 155 characters or less.
- Indian English, plain, short sentences.
- No figures of any kind, no testimonials or reviews, no accreditation,
  certification, licence, ISO or 24-hour claims, no named clients or
  projects. Facts come only from `src/data/site.ts`.

## 9. Editable slots and placeholders

Every run of visitor copy carries a declared key:

```astro
<T as="h2" k="about.story.heading" text={copy.story.heading} />
```

- The key mirrors the copy path with the page first (`home.hero.headline`).
- One key, one element, one run of text. Never put markup inside it.
- Keys are unique per page. Nav and footer take a `page` prop for their first
  segment.
- Never rename or reuse a key: rows in `content_edits` are filed under it.
- Text the client has edited is stored in the database and painted over the
  built copy on every load. No cleanup or deploy may overwrite it: changing the
  built copy under a key does not touch the client's edit.

**Placeholders**, for anything the client must supply or confirm, have one
format: the text `[Client to supply: ...]`, written with `ph()` from
`src/data/placeholder.ts`, rendered by `T` with `data-placeholder`, which wears
the QMS's amber "add ..." chip colours. The client replaces one by clicking it
in edit mode and typing; the marker disappears. `npm run check:placeholders`
lists them and says which have been replaced on the site.

## 10. Things the design does not have

- No dark page grounds other than navy bands.
- No new colours, no tints beyond the tokens.
- No icon font; a small inline SVG set in the QMS's stroke style.
- No counters, no parallax, no autoplaying media, no carousels.
