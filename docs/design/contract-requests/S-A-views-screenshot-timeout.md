# S-A: longer screenshot timeout in `tools/shots/views.mjs`

**Lane:** S-A (canopy_forest + spark_circuit stylized pass). **File:** `tools/shots/views.mjs` (shared, read-only for lanes).

## What
Give the per-view `page.screenshot()` an explicit, long timeout.

```diff
-    await page.screenshot({ path: f });
+    // SwiftShader at quality=high with four lanes sharing 4 CPUs can take > 30 s to produce the next frame
+    await page.screenshot({ path: f, timeout: 300_000 });
```

## Why
With four theme lanes each running one SwiftShader browser (load average 20+ on 4 CPUs), a quality=high frame can
take longer than Playwright's default 30 s screenshot timeout. The first BEFORE run of Fernwood Hollow froze at
tick 200 after 87 s and then died on `page.screenshot: Timeout 30000ms exceeded` at the first view, so the doc-34
§2 evidence could not be produced with the shared tool.

## Workaround used in the lane
An untracked copy of `views.mjs` with only this line changed (`node_modules/.lane-a/views-slow.mjs`, never
committed) produced every BEFORE / AFTER set; the camera poses, freeze ticks, settle time, URL and console-error
handling are identical to the shared script.
