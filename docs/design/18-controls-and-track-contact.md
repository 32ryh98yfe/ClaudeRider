# 18 — Responsive controls and visible track contact

> Historical evidence. [19 — Continuous handling](19-continuous-handling.md) is the current simulation-10 control/speed contract. The user explicitly authorized slower speeds, stronger traction, longer short-press drift, and local geometry changes. Earlier numerical speed, duration and data-preservation requirements below do not override that contract.

Simulation version 9 addresses the seven play-test findings after the reference
calibration: lost Shift presses, Escape immediately resuming, scenery obstructing
roads without contact, item boxes in speed races, frozen heading after drift,
discarded repeated Shift presses, and missed track traps. This amendment overrides
the version-5/8 repeat lock and zero-yaw cut behavior in documents 15–17.

## Input and drift

`Edge.DRIFT = 64` latches a deliberate press until a simulation input consumes it.
Held Shift still sustains the drift. Keyboard, rebound gamepad controls, annotated
replay, network sample merging, binary transport and ghosts preserve the same
edge. A press and release between rendered frames is a one-tick intent rather
than an absent input. Held-key repeat is not a new press. Held and edge together
cause only one impulse.

The network frame remains six bytes. The packed input used by buffers and ghosts
now reserves seven edge bits, shifting aim/emote up one bit. Version 9 rejects
older simulation trajectories; it does not reinterpret old packed ghosts.
There are no additional persistent kart/world fields.

Fresh left/right press edges select the direction of a simultaneous Shift impulse
even while the ordinary steering filter is crossing zero. Continuous steering
still uses that filter. A fresh press after a completed cut can re-enter immediately;
the existing exit lock only prevents an uninterrupted held Shift from chattering.

Repeated Shift adds yaw in the requested direction, proportional to elapsed ticks
over the existing nine-tick recovery interval. Short pulses no longer disappear
behind a binary cooldown. Their yaw is bounded, their speed loss is proportional,
and they do not jump the heading by a fixed three degrees. Counter-steering removes
the residual carry from the old slide, smoothly increases yaw response from
6/s to 12/s with the strength of counter-steering,
and preserves rotation toward the requested direction when the slip recovers.
Cut completion remains slip-based and does not zero yaw. AI lookahead and the
independent planar oracle follow the same laws; the AI drag controller inverts
the counter-steer branch of the new yaw law.

## Pause and mode presentation

The keyboard capture handler owns the Escape that opens pause. Menu navigation
does not process that consumed event again or turn key repeat into resume.
Offline pause stops the race clock and input submission; online pause remains a
menu with the shared race running. Both clear unsent input samples and held-input
fallbacks without erasing sent history. Closing settings returns to the pause menu.

RaceConfig.mode reaches the track renderer. Only item mode creates item-box
bodies, glyphs and their ground shadows. Speed, infinite boost and time attack
do not display nonfunctional pickups.

## Roads, scenery and hazards

Scenery and gameplay hazards have separate responsibilities. Decorative props
cannot obstruct the drivable corridor. A load-time triangle/corridor intersection
check retains arches with actual openings, fits generated pillars below their
supporting deck and rejects intersecting scenery. It does not remove gameplay
hazards or add solid barriers across the route. Correct authored placements where
the intended relationship is known, such as the creek below Meadow's bridge.

Custom damaging bodies are cloned and fitted inside the authored convex contact
shape. Suspension ropes/stems remain separate decoration, with the upper anchor
fixed. Shared source geometry is unchanged; owned fitted geometry is disposed.

Track traps use their authoritative animated pose and contact shape. Capture kart
centres before motion, then test the swept movement against the moving shape in
phase 5. Tick-local scratch is overwritten on every step, including rollback.
Lane wraps and parked-train teleports are not swept across the road. Existing
effect immunity and attachment exclusions still apply. Solid block contact is
resolved on the entry side rather than after a kart has passed through it.
Downward pressure from a solid box on a grounded kart selects a supported planar
exit whose entire translation clears the static walls. It cannot eject through
the road or the nearby outer wall; a fully boxed-in kart waits for the press.

The validation must include native keyboard controls, held/released/repeated
Shift, input and ghost serialization, authority/predictor determinism, all four
mode presentations, trap active/inactive phases, banked and vertical shape
orientation, and actual scenery clearance across the full track catalog.
