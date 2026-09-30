# Research dossier (planning phase, 2026-09-29)

Exported verbatim from the 12-agent research workflow. Values tagged **[sourced]** come from a cited source;
**[proposed]** values are design reasoning. Canonical decisions that resolve conflicts live in `docs/design/01-decisions.md`.

- [01-driving-mechanics.md](01-driving-mechanics.md) — driving-mechanics
- [02-modes-rules.md](02-modes-rules.md) — modes-rules
- [03-items.md](03-items.md) — items
- [04-maps-tracks.md](04-maps-tracks.md) — maps-tracks
- [05-tech-rendering.md](05-tech-rendering.md) — tech-rendering
- [06-physics-ai-netcode.md](06-physics-ai-netcode.md) — physics-ai-netcode
- [07-ui-art-character.md](07-ui-art-character.md) — ui-art-character
- [08-gap-1-real-kart-physics-and-timing-constants-were-never-sour.md](08-gap-1-real-kart-physics-and-timing-constants-were-never-sour.md) — gap-1-Real kart physics and timing constants were never sourced. A reachable classic-KartRider emulator source holds them.
- [09-gap-2-no-single-numerically-validated-simulation-spec-tick-r.md](09-gap-2-no-single-numerically-validated-simulation-spec-tick-r.md) — gap-2-No single, numerically validated simulation spec: tick rate, speed scale and drift/boost constants conflict, and none were checked against track geometry
- [10-gap-3-the-track-data-format-and-collision-model-are-undecide.md](10-gap-3-the-track-data-format-and-collision-model-are-undecide.md) — gap-3-The track data format and collision model are undecided, and there is no concrete geometry for any of the 20 tracks
- [11-gap-4-items-status-effects-and-kart-contacts-are-not-reconci.md](11-gap-4-items-status-effects-and-kart-contacts-are-not-reconci.md) — gap-4-Items, status effects and kart contacts are not reconciled with client prediction; the netcode tick rate is contradictory
- [12-contradictions.md](12-contradictions.md) — critic contradictions (resolved in design ADRs)
- [sim-prototype.md](sim-prototype.md) — validated 2D physics prototype (test oracle source)
- [../design/02-contracts.md](../design/02-contracts.md) — architecture plan and interface contracts
