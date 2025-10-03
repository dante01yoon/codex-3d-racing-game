# Codex Racing Game

A browser-based 3D racing prototype built with Three.js. Drive a stylised sportscar around a looping neon-lit track, using lightweight physics and a chase camera to keep the action in focus.

## Features

- Three.js scene with dynamic lighting, fog, ambient mist, and shadow-capable renderer
- Procedurally generated closed-circuit race track with glowing checkpoints, guard rails, and start markers
- Stylised low-poly car roster with the player car plus ambient AI traffic featuring basic avoidance behaviour
- Lap timer HUD with current/last/best splits, checkpoint tracking, and a global race countdown
- Toggleable minimap that tracks the player and ambient traffic in real time
- Modular track system with an in-game selector; define new circuits in `src/maps.js`
- Lightweight collision response so cars bounce when they trade paint
- Checkpoint bonuses with on-track bursts and a post-race dashboard summarising your score
- Third-person chase camera that dynamically eases behind the car for smooth framing
- Trackside trees, neon billboards, grandstands, and alternating floodlights for a stadium vibe

## Demo

<video src="assets/racing_demo.mov" controls width="640">
  Your browser does not support embedded videos. <a href="assets/racing_demo.mov">Download the clip</a> instead.
</video>

If the inline player does not appear in your viewer (some Markdown renderers ignore video tags), open `assets/racing_demo.mov` directly for the preview.

## Getting Started

This project is completely static; no build tooling is required. Any modern browser with WebGL2 support should run it.

### Run a Local Development Server

1. Open a terminal in the repository root.
2. Start a simple HTTP server (replace `python3` with `python` on Windows if needed):
   ```bash
   python3 -m http.server 8000
   ```
3. Visit [http://localhost:8000](http://localhost:8000) and open `index.html`.
4. Pick a circuit from the track selector overlay (press `L` later to change tracks on the fly).

Alternatively, launch the project with any static file server of your choice.

## Controls

- `Arrow Up` / `W`: Accelerate
- `Arrow Down` / `S`: Brake / reverse
- `Arrow Left` / `A`: Steer left
- `Arrow Right` / `D`: Steer right
- `R`: Reset to the starting grid
- `M`: Toggle minimap visibility
- `L`: Open the track selector

## Project Structure

```
.
├── index.html        # Entry point hooking up the canvas and UI overlay
├── styles.css        # HUD and canvas styling
├── src
│   ├── main.js       # Three.js setup, game loop, cars, HUD, physics
│   └── maps.js       # Declarative map definitions consumed by the selector
├── vendor
│   └── three.module.js
└── CONTRIBUTING.md   # Guide for creating new tracks and improvements
```

## Next Steps

- Introduce proper race flow: countdown, lap goals, and podium logic
- Expand AI into competitive opponents or ghost replays with lap ghosts
- Layer in audio (engine loops, tyre squeals, ambience) and richer VFX
- Port to a bundler-based toolchain for asset pipelines and optimisations

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for a quick primer on adding new tracks or enhancing the project.
