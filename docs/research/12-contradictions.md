# Contradictions found by the completeness critic

All are resolved in `docs/design/01-decisions.md`.

1. Sim tick rate: driving-mechanics has a 120 Hz sim with 60 Hz inputs and 30 Hz snapshots. physics-ai-netcode has a 60 Hz sim with 2 sub-steps, inputs sent every 2 ticks (30 pkt/s) and 30 Hz snapshots. items has a 30 Hz server sim with 20 Hz snapshots.
2. Speed scale:
- driving-mechanics: V_grip 34 / V_boost 44.4 m/s with a display factor of 1.5.
- items: Vmax ≈ 40 m/s, and Turbo ×1.30 gives 52 m/s, faster than the speed-mode boost cap.
- maps-tracks: a 38 m/s average for layout, which is above grip max.
- physics: 'boosted 40 m/s'.
- HUD reference screenshot: shows 356 km/h, against the sourced boost top of 239.54 km/h.
3. Instant boost: driving-mechanics gives a 0.50 s window (sourced) after a full drift (≥0.35 s, β ≥ 10°), with a 0.6 s effect capped at 1.10×. physics-ai-netcode gives a 0.30 s window after a drift of ≥0.25 s, with +15% vMax for 0.4 s. The AI jitter table is built on the physics version.
4. Start boost has three incompatible specs:
- driving-mechanics: T3 0..+0.12 s, three tiers of 0.8/1.2/1.6 s.
- modes-rules: perfect −60..+40 ms 1.2 s, good 0.8 s, ok 0.4 s, and no early penalty.
- physics-ai-netcode: a single [−0.3, +0.1] s window, and a false start gives a 0.5 s wheelspin.

Classic KartRider source has StartBoosterTimeSpeed 1500 ms and StartBoosterTimeItem 1000 ms.
5. Booster and team-booster duration: driving-mechanics has a 2.4 s booster and a 1.25× team booster. modes-rules has a 1.5× team booster. items has a 2.0 s item Turbo. Classic source (yanygm/Launcher_V2 KartSpec.cs) has NormalBoosterTime ≈2900–3000 ms, ItemBoosterTime 3000 ms and TeamBoosterTime ≈4350–4500 ms (≈1.5×).
6. Team gauge: driving-mechanics sizes it at 2 × team size × the single-booster requirement, filled only by drifting. modes-rules has one shared gauge collecting all teammates' gains, and every member gets one team boost when it fills.
7. Grip and drift constants: lateral damping is 18 (grip) / 1.2 (neutral drift) in driving-mechanics vs 14 / 2.2 in physics-ai-netcode. Gravity is 30 vs 28 m/s². Collider radius is 0.9 vs 0.8 m.
8. Road collision model: driving-mechanics and maps-tracks want spline-space collision only ('do not use mesh collision for the road'). physics-ai-netcode wants three-mesh-bvh raycast and shapecast against a collision mesh, with the spline only auxiliary.
9. Frames: maps-tracks recommends three's computeFrenetFrames (parallel transport) for loops. tech-rendering says computeFrenetFrames is Bloomenthal-seeded and not up-aligned, and says to write custom up-constrained frames plus double-reflection RMF. maps also sets tension 0.5, which is ignored for centripetal curves.
10. Wall response:
- driving-mechanics: e=0.15, grind below 15°, ×0.92..0.60 for 15–45°, and above 45° ×0.40 with a 0.25 s stun and the boost cancelled.
- physics-ai-netcode: e=0.25, tangent kept at ×0.92, and above 50° an extra 35% loss.
- maps-tracks: 'reflection plus 15–30% loss'.
11. Respawn:
- Off-track timeout: 1.2 s (driving), 1.0 s (modes), 3 s (maps, physics).
- Placement: at v=0 on the last checkpoint (driving), at 40% of top speed (modes), at s−5 m (physics), or 0.3·w from centre (maps).
- Ghost time: 1.5 / 2.0 / 1 / 1.5 s.
- Manual R: a 3 s cooldown (driving) vs allowed only below 3 m/s for 1 s or while wrong-way (modes).
- Penalty: modes says there is no time penalty, but maps E2 has lava falls cost respawn plus a 2 s penalty.
12. Wrong-way trigger: modes uses >110° for 1.2 s above 4 m/s. ui uses >110° for 1.2 s above 20 km/h. maps uses velocity·T < 0 for 1.5 s. Only physics adds an auto-respawn after 4 s of wrong-way.
13. Item boxes: items has a 2.5 s respawn with one row per ~300 m (3–5 per lap) and the first row at least 150 m after the start. maps has a 3 s respawn with 3–4 rows per lap, 150–300 m apart.
14. Friendly fire: modes (sourced) says team item has friendly fire off except area hazards (water bomb, barricade). items says KRD banana and siren also hit teammates, and changes the barricade to target the highest opponent. items also lists the team-item win rule as unconfirmed, while modes marks it sourced.
15. Lap distribution: modes-rules proposes 12×3, 5×2, 2×1 plus a 5-lap mini oval. The maps-tracks roster is 10×3, 9×2 and 1×1, with no oval. maps' own 28–45 s/lap target and CI check fail its 2-lap 1.6–2.4 km tracks (≈42–63 s at 38 m/s) and its 4 km journey track. maps also scales classic widths and radii ×0.4 while keeping lap lengths ≈1:1.
16. Track vs physics capability: the D5 tightest radius is 9 m and D4 is 12 m, but the driving model's maximum drift yaw (≈2.5 rad/s) gives ≈12 m radius at 30 m/s. No report says whether these corners require braking, or whether the AI's aLat_drift of 26 m/s² matches the physics.
17. AI difficulty tiers: modes has Rookie 88 / Racer 94 / Pro 98 / Legend 101% pace, with a ±4% rubber band that is off in the final 15% of the last lap. physics has Easy 0.88 / Normal 0.94 / Hard 0.98 / Pro 1.00, a boost of up to ×1.04 for bots behind, and no rubber band on Pro. The names and the top tier differ.
18. Lobby parameters:
- Room code: 6 characters, excluding 0/O/1/I (modes) vs 5-character Crockford base32 (physics).
- Quick match: 20 s search plus a 15 s matching stage (modes) vs a 12 s wait (physics).
- Results screen: 12 s (modes) vs 8 s (physics FSM).
- Disconnect: autopilot for the rest of the race (modes) vs a 30 s reconnect window with AI takeover (physics).
19. Rendering: ui-art's mascot material uses MeshPhysicalMaterial with an onBeforeCompile Fresnel rim, and its Ultra tier asks for '2048 PCF-soft' shadows. tech-rendering mandates WebGPURenderer/TSL, where onBeforeCompile and ShaderMaterial are unsupported and PCFSoftShadowMap was removed in r186. DPR caps are 1/1.5/2/2 (ui) vs 1.0/1.25/1.5/native (tech). Chromatic aberration is ≤0.4 (tech) vs ≤0.004 (ui).
20. Codex asset pipeline: the user request says to use ChatGPT/Codex image generation installed on the PC. This session's container has no `codex` binary, and the repo is empty with no commits. tech-rendering plans all assets procedurally, and ui-art leaves Codex availability as an open question. No report defines how or where Codex-generated assets would enter the pipeline.
