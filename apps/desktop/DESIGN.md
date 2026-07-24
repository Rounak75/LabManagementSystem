# Design System & Aesthetics (Desktop)

## Vibe & Texture
- **Aesthetic:** Soft Structuralism (Medical context)
- **Backgrounds:** Silver-grey (`bg-stone-50`) to pure white (`bg-white`).
- **Typography:** Massive Grotesk typography for hierarchy, `Inter` or system-ui for data density.
- **Components:** Airy, floating components with incredibly soft, highly diffused ambient shadows. Double-bezel architecture (Doppelrand) for main cards.
- **Motion:** Custom cubic-bezier easings. `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for UI interactions. Under 300ms. Spring animations for hover physics.

## Core Rules
- **No standard `1px solid gray` borders.** Use soft `ring-1 ring-black/5` or `border-slate-200/60`.
- **No generic shadows.** Use highly diffused ambient shadows (`shadow-[0_8px_30px_rgb(0,0,0,0.04)]`).
- **Button-in-Button:** Trailing icons in primary CTAs must have their own nested circular wrapper.
- **Spatial Rhythm:** Generous macro-whitespace (`py-8` to `py-12` minimum for layout sections).
- **Interactive States:** Use `active:scale-[0.98]` to simulate physical press.
