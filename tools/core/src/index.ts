// Public entry point for @dcddp/core — shared logic for all interfaces (CLI, kg-web, studio).
// Interface-specific adapters (command dispatch, UI rendering) live elsewhere; anything
// reused across interfaces belongs here.

export * from './types.ts'
export * from './paths.ts'
export * from './reader.ts'
export * from './index-file.ts'
export * from './loader.ts'
export * from './query.ts'

// Vocabulary (meta-model registry) — node-kinds / rel-kinds and their storage mapping.
export * from './vocabulary.ts'

// Graph ops — add-node / update-node / move-node / remove-node / connect / update-edge / disconnect.
export * from './graph.ts'

// Validation (loader diagnostics + structural checks).
export * from './validate.ts'
export * from './import-draft.ts'

// Value-type helpers (user-defined value types are nodes; these keep the `vt` surface).
export * from './value-type.ts'

// yaml@2 round-trip helpers.
export * from './yaml-io.ts'

// Schema versioning + migration framework
export * from './version.ts'
export * from './migrations/index.ts'

import './migrations/v2-to-v3.ts'
import './migrations/v3-to-v4.ts'
import './migrations/v4-to-v5.ts'
import './migrations/v5-to-v6.ts'
import './migrations/v6-to-v7.ts'
