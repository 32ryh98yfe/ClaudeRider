# U — settings for the cinematic post effects (additive, approved by the orchestrator)

**What:** two optional `SettingsV1` fields in `apps/client/src/meta/save.ts`, with defaults in `defaults()` and parsing in
`migrateSave()`:

```ts
velocityBlur?: 'tier' | 'off' | 'on';   // camera/object motion blur (Ultra default on)
dof?: 'tier' | 'off' | 'on';            // cinematic depth of field (High: showcase only, Ultra: cinematic moments)
```

**Why:** the existing `motionBlur?: boolean` defaults to `false` and toggles the boost radial blur. A boolean cannot say
"on by default on Ultra, off elsewhere", and the two blurs are different effects. `'tier'` keeps the tier's choice, so
existing saves keep today's behaviour on every tier. `reducedMotion` still turns both off (render/quality.ts).

**Compatibility:** additive optional fields; old saves parse to `'tier'`. No version bump.
