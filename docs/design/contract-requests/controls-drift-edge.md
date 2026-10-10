# Preserve short drift presses

Approved by the orchestrator for the seven reported driving/playability bugs (2026-10-03).

The keyboard previously lost a complete 20 ms Shift press between 30 Hz samples. The network sample merge also lost a sampled Shift press when its release arrived before the next physics tick. This violated the repeated-Shift control requirement even when every browser event arrived correctly.

- Add `Edge.DRIFT = 64` to frozen `packages/sim/src/core/input.ts`. Mask valid edges with 127.
- Keep the network frame at six bytes; use its previously reserved edge bit 6. Bit 7 remains invalid.
- Expand packed ghost inputs to seven edge bits: aim starts at bit 26 and emote at bit 34. SIM_VERSION 9 rejects old ghosts before playback; the binary ghost envelope remains unchanged.
- Keyboard, gamepad and reference replay share the same edge. Simulation treats it as a one-tick drift intent and a fresh press; a simultaneous held transition must not create a second impulse. No persistent world field is added.

Validation covers short keyboard and gamepad presses, repeat suppression, reset on pause/blur, replay parity, sample merging, protocol reserved bits, all edge/aim/emote packing boundaries and ghost recording round trips. The orchestrator refreshes `contracts.lock` during integration.
