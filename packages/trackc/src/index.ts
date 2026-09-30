// @cr/trackc public surface (docs/design/02-contracts.md B6). Node only.
export { parse, TrackDslError, type DslError, type TrackAst, type Stmt } from './dsl.ts';
export { buildTrack, COMPILER_VERSION, type BuildResult, type BuildOptions, type VisMeta } from './build.ts';
export { validate, type Finding, type GhostData } from './validate.ts';
export { toDef } from './schema.ts';
export type * from './schema.ts';
