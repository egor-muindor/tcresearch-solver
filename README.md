# GTNH Research Solver

A standalone web tool for the Thaumcraft / **GregTech: New Horizons** research
hex minigame. Place anchor aspects on the board and the solver fills the empty
cells to **connect all anchors** — routing around dead cells, respecting aspect
crafting, and minimizing (inventory deficit, cell count).

**▶ Live app: https://egor-muindor.github.io/tcresearch-solver/**

## Features

- Hex board of radius 2–5; place anchors, dead cells, or manual aspects.
- Exact branch-and-bound solver (node-weighted Steiner / Dreyfus–Wagner) running
  in a **Web Worker** — the UI stays responsive and a solve can be cancelled.
- **Inventory accounting toggle**: account for your real aspect supply
  (scarcity-aware), or leave it off to solve for pure connectivity with zero input.
- Manual editing, **Validate**, and **Continue Solve** to finish a partial chain.
- **Subtract used** applies the solution's consumption to your inventory.
- State is persisted in `localStorage`.

## Development

Requires [Bun](https://bun.sh) (pinned to 1.3.14).

```bash
bun install
bun run dev        # local dev server
bun test           # unit tests
bunx tsc --noEmit  # typecheck
bun run build      # production build -> dist/
bun run preview    # preview the production build under /tcresearch-solver/
```

## License

The source code in this repository is licensed under the **MIT License**
(see [LICENSE](LICENSE)). This is an independent reimplementation — no code was
copied from the original projects.

The bundled **aspect data and icons** (under `aspects/`) are derived from
[ythri/tcresearch](https://github.com/ythri/tcresearch) and remain licensed
under [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/), © their original
authors.
