# UI references (Milestone 8)

Notes on reference images the developer shared for the card and UI pass. The images themselves are AI-generated mood references (Gemini) with unclear rights, so they are not committed; only what we take from them is recorded here.

## Ref 1: property deed, "Foundry Way" (2026-10-25)

A tall dark-glass deed card with a neon frame, a lit isometric brick building as the hero, and a classic paper-deed rent table.

**Keep**

- **Hero building on the card.** The best idea in the image. Ours is the real thing: the art kit renders the property's own lot building (same city seed and family) at its current level, so the deed grows when you build, and is lit at night.
- **Reading order:** group label, then name, then building, then rents. You know what it is before reading numbers.
- **Dark glass base** that sits over the board (close to the current shell panels).
- **Group shown as a small pill/tag** above the name, as a secondary cue.

**Change**

- Group color must be the dominant cue (a solid header or band), so a card is recognisable at a glance in a hand or on the trade table.
- Rent ladder with house pips (●●○○) instead of "With 2 Houses" text rows; highlight the row that applies now.
- Show game state: owner, mortgaged, set progress (1 of 3), "×2 with full set" as a tag instead of the rules paragraph.
- Build and mortgage costs as compact labels, not sentences. No trailing periods on prices.
- Money in one consistent color; color carries meaning, not decoration.
- A compact version (about 120 px tall, for the trade table and My city) that clearly belongs to the full card.

**Drop**

- Neon glow, gradient title, two-tone glowing edge, corner brackets and HUD dots. They read as sci-fi and clash with style D (calm modern, DECISIONS.md D26).

## Ref 2: deed card from the vision prompt (2026-10-25)

The direction from Ref 1 rendered: muted coral header band with group and name, owner avatar badge, hero brick walk-up lit at dusk, a pip rent ladder with the current row highlighted, three small tags (×2 with full set, Build, Mortgage). Close to what we want; use it as the baseline for the Milestone 8 design page.

## Ref 3: game screen and city at night (2026-10-25)

The developer was lukewarm on the UI but loves the central city. What makes it look rich, and what we can take into our code-drawn kit:

- **Soft lighting:** gradients on wall faces (darker at the base, a fake ambient occlusion), soft dark contact pools at building bases, faint bevel highlights on edges. Ours are flat three-tone faces.
- **Warm against cool:** warm interior and lamp light against a cool blue night. Light spills onto the ground, sidewalks and walls below windows, not only inside the panes.
- **Silhouettes and detail:** pitched and gabled roofs, chimneys, dormers, porches, awnings, balconies, rooftop units; many buildings are not plain boxes.
- **Props and greenery:** round-crowned trees, hedges, fences, lawns, parked cars, plazas with lamps. Dark green lawns instead of light grey ground.
- **Cozy density:** low and mid-rise neighbourhood blocks packed together. Note it has no tall skyline; ours keeps the tall-in-the-middle rule (BOARD.md section 5), with this detail level applied to towers too.
- It looks like a soft 3D render (Blender-style global illumination). We match the feel, not the renderer.
