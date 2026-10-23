# tools/assets

Asset pipeline scripts (green-key removal, trim/pad, atlas packing, light masks). See `docs/ART_GUIDE.md` section 6. Added in the art milestone.

- `pack-audio.ts` (`pnpm assets:audio`): packs `audio/<pack>/*.ogg` into `apps/web/public/audio/<pack>.pack`. Run it after adding or changing a sound file, and log the source in `docs/ASSETS.md`.
