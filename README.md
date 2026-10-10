# Pulse Orbit

A fast browser timing game: keep a sweeping needle over glowing arcs, chain combos, and chase one more run.

## Play locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4731](http://127.0.0.1:4731).

## Build

```bash
npm run build
npm run preview
```

## How it works

- Tap / click / press Space when the needle is inside an arc; tapping empty ring breaks your combo
- Missing an arc costs a life (3 to start, max 5)
- Each level adds a new arc type: golden, shrinking, drifting, reverse, hazard (don't tap), double
- Perfects and golden arcs fill the fever meter: 6 s of 2× score where every hit is perfect
- Every level-up you draft 1 of 3 perks (wider arcs, shields, slow-mo, greed…)
- Runs earn XP toward a rank; ranks unlock permanent run perks
- Three daily missions plus a random reward chest when all are done
- Soft daily streak bonus and limited energy keep sessions short
- Best runs save to a local leaderboard in your browser

No accounts, no backend — progress lives in `localStorage`.
