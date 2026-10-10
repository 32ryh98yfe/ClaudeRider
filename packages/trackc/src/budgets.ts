// CTRK v3 stores exact local prop geometry once and instances it; no solid may be omitted to meet this budget.
// The previous 1.5 MiB bound covered road triangles and coarse boxes only (design 20, simulation 10).
export const CTRK_MAX_BYTES = 5 * 1024 * 1024;
export const CVIS_GZIP_MAX_BYTES = 3 * 1024 * 1024;
