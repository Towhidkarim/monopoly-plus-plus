# Art Guide

> Update 2026-10-23: city buildings (plaza and lot development) are now **code-generated first** (`DECISIONS.md` D13, `BOARD.md` section 5). AI art below is optional polish for hero pieces.

The developer is not an artist. The strategy is: **code draws structure, AI makes static art, scripts do the glue, code does all motion.**

## 1. Art direction

- Modern isometric city game asset. Clean geometric forms, flat-to-soft shading with a single light source, subtle gradients, crisp edges, no outlines, minimal detail, slightly stylized proportions, very light grain.
- Mood: playful but contemporary. Not glossy plastic toy. Reference mood is a clean, modern city-builder board.
- Camera for every board-attached asset: isometric, about 30 degrees elevation, 45 degrees rotation, orthographic look. Do not mix camera angles. Flat UI (cards) is front-facing.
- Lighting: single source from the top-left; soft contact shadow below objects; no glossy reflections.
- Motion/feel inspiration: Balatro-style juice (see `ARCHITECTURE.md`), not its art style.

## 2. Palette

| Role | Hex |
|---|---|
| Table / deep background | `#0B1426` midnight navy |
| Road / slab sides | `#1E2A3B` slate (walls: `#334155` left, `#1E293B` right) |
| Tile tops / sidewalks | `#CBD5E1` to `#E2E8F0` light concrete |
| Accent 1 | `#22D3EE` electric cyan |
| Accent 2 | `#60A5FA` sky blue |
| Accent 3 | `#14B8A6` teal |
| Accent 4 | `#6366F1` indigo |
| Alert / action | `#FB7185` coral (buy, rent due, bankruptcy; use sparingly) |

Property group colors (8 groups, each also gets a pattern or icon for color-blind support):
sky `#7DD3FC`, cyan `#22D3EE`, teal `#14B8A6`, indigo `#6366F1`, violet `#A78BFA`, rose `#FB7185`, amber `#FBBF24`, mint `#86EFAC`.

Keep a single `palette.ts` in `apps/web` as the source of truth. Image prompts reference these names and hex values.

## 3. What is code-drawn vs AI-generated

| Element | Source |
|---|---|
| Lot geometry (walls, top rhombus, group band), highlights, owner markers | Code (Pixi Graphics from grid geometry) |
| Group patterns | Code (procedural) or seamless textures |
| Cards (deeds, Chance, Chest): layout, text, color bands | Code (flat UI). Optional AI texture only for the background |
| Houses, hotels, tokens | AI sprites (isometric), or procedural SVG for v1 |
| Central plaza / skyline / rails | AI image, baked as one static layer |
| Trains and cars | Simple code-drawn shapes first; AI sprites later; moved along paths in code |
| Window lights | Derived from an AI day/night image pair via a mask script |
| Dice | 2D faces + code tumble first; optional Blender-rendered sprite sheet later |
| Particles, glows, blinking lights, shadows | Code |
| Text anywhere | Code only. Never ask an image model for readable text or numbers |

## 4. Reusable style block (paste into every board-asset prompt)

```
Style: modern isometric city game asset, clean geometric forms, flat-to-soft shading with
a single light source, subtle gradients, crisp edges, no outlines, minimal detail,
slightly stylized proportions. Very light grain texture.
Camera: isometric, about 30 degrees elevation, 45 degrees rotation, orthographic look.
Palette: midnight navy, slate, light concrete, electric cyan, sky blue, teal, indigo,
coral accents. Avoid pure green on the subject.
Lighting: from the top-left, soft contact shadow beneath the object, no glossy reflections.
Composition: single centered object filling about 80% of the frame.
Background: flat solid #00FF00 green, no gradient, no border, no text, no watermark.
```

For flat card art, drop the Camera line and say "front-facing, flat, no perspective".

## 5. Gemini workflow

1. Start a chat with a setup message containing the style block and: "Follow this style for every image in this conversation. Never include text, numbers, or watermarks. Reply 'Ready'."
2. Generate the **reference set first** and approve it before anything else: one property tile top, one corner tile, one house, one hotel, one token, one die.
3. For each new asset, upload the approved reference image and say: "Match this exact style, camera angle, lighting, and palette. Now generate: <object>."
4. To make variants (night version, owned/mortgaged states), use **edit** requests, not fresh generations: "Keep the exact same camera angle, composition, and objects. Only change: <x>. Output the same dimensions."
5. Do not ask for animation frames or sprite sheets from the model; frames drift. Ask for a few distinct poses at most.
6. Check every generated die for correct pip counts, and reject any asset with stray text.
7. Download at the largest size offered, downscale for use.

Example prompts (append the style block):

- Property house: "A small modern townhouse, light concrete walls, indigo roof, cyan window accents. Footprint roughly square so it fits on a single tile."
- Hotel: "A taller modern hotel tower on a small podium, teal glass, a coral rooftop sign blank of any text."
- Token set (one per generation): "A small stylized game token shaped like a <car / rocket / bus / briefcase / paper plane / cat>, chunky, seen from the isometric camera, coral and cyan accents."
- Central plaza: "A raised central city plaza with skyscrapers, a ring of rail track around it, small park, roads in a cross pattern, viewed isometrically on a dark navy base. Leave the outer ring empty."
- Night edit: "Edit this image. Keep the exact same camera angle, composition, buildings, roads, and colors. Only change two things: turn the windows on the buildings a warm yellow glow, and make the sky and background dark navy. Output the same dimensions."

## 6. Asset tooling (`tools/assets`)

Python (Pillow, numpy, optionally `rembg`) and Node scripts, all runnable from `pnpm assets:*`:

- `key_green.py`: remove `#00FF00` background with tolerance and edge defringing; output PNG with alpha. Fall back to `rembg` when the subject has greenish pixels.
- `trim_pad.py`: trim transparent borders, pad to consistent canvas, and record the footprint anchor (bottom-center) in a JSON sidecar.
- `pack_atlas`: pack sprites into an atlas (e.g. with a texture packer CLI) and write Pixi-compatible JSON.
- `make_light_mask.py`: derive the window-light layer from the day/night pair:

```python
from PIL import Image, ImageChops

day = Image.open("board_day.png").convert("RGB")
night = Image.open("board_night.png").convert("RGB").resize(day.size)
diff = ImageChops.subtract(night, day)
mask = diff.convert("L").point(lambda v: 255 if v > 40 else 0)
lights = Image.composite(night, Image.new("RGB", day.size, (0, 0, 0)), mask)
lights.save("windows_layer.png")   # load in Pixi with additive blend
```

- `render_dice.py` (optional, Blender headless: `blender -b -P render_dice.py`): rounded cube with inset pips, three-point light, transparent background, N rotation frames, atlas JSON output. Check the installed Blender version before relying on API calls.
- `check_alignment`: overlays layers at 50% alpha to verify day, night, and light layers align; fail if any layer dimensions differ.

## 7. Layered board images

Generate or derive these as separate, same-size, aligned images:

1. `base_day`: baked static city, plaza, rails (no moving vehicles).
2. `windows_layer`: lit windows on black (additive).
3. `night_tint`: a plain navy multiply overlay produced in code.
4. Vehicles and trains: separate cut-out sprites facing one direction.

Keep all layers from the same source image. Verify alignment early and after every regeneration. The AI board image is a look target and plaza source only; the 40 lots are built in code.

## 8. Acceptance checks for art

- Camera angle consistent across tile, house, hotel, token (overlay test on the debug grid).
- Tile top surface stays mostly empty so tokens and up to four houses fit.
- Group bands are bold and identifiable at phone size, with patterns for color-blind players.
- Corner spaces (GO, Jail, Free Parking, Go To Jail) are unmistakable at a glance via distinct shape, color, and icon.
- No generated text anywhere.
- All assets recorded in `docs/ASSETS.md` with source, tool, prompt, date, and license notes. Check the terms of any AI tool or asset pack before publishing.

## 9. Fallback if AI art consistency fails

Go code-first: procedural SVG or Pixi Graphics for tiles, houses, hotels, tokens, with the palette and shading rules above. Use CC0 packs (Kenney, Quaternius) for gaps and record licenses. Reintroduce AI art only for hero pieces (plaza, backdrop, card textures).
