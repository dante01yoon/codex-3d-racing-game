# Contributing

Thanks for helping improve the Codex Racing Game! This project is intentionally lightweight so new circuits and ambience can be added quickly. The notes below focus on creating and testing additional maps.

## Adding a New Track

1. Open `src/maps.js`.
2. Duplicate an existing map object and give it a unique `id`, plus a descriptive `name` and `description`.
3. Replace the `track.controlPoints` array with your circuit layout. Points are `[x, y, z]` coordinates and should form a smooth loop when connected in order.
4. Tweak optional sections to dial-in the ambience:
   - `track` – radius, segment count, surface colour, and edge glow.
   - `environment` – counts/offsets for guard rails, trees, mist, grandstands, billboards, and floodlights.
   - `trafficPresets` – starting lane, progress, and colours for ambient cars.
5. Save the file and run the game locally (see the README) to make sure the new map appears in the track selector and drives correctly.
6. If you add new assets (textures, models, etc.) place them under `assets/` and reference them from your map configuration.

## Testing Checklist

- Launch `python3 -m http.server 8000` in the repo root and open `http://localhost:8000/`.
- Pick your new track from the selection menu.
- Verify spawn position, checkpoint progression, minimap rendering, and AI traffic behaviour.
- Confirm collisions, checkpoint rewards, and the race timer still work end-to-end.

## Style Notes

- Keep map logic declarative—only describe data in `maps.js`; the runtime will handle building geometry and scenery.
- Prefer whole-number coordinates when possible (fractions are fine for fine-tuning, just keep things readable).
- Document any unusual parameters with brief inline comments so the next contributor knows why they matter.

Happy racing!
