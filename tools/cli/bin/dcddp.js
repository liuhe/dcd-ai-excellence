#!/usr/bin/env node
// Package-local entry (npm `bin`). The repo-level stable entry is <repo>/apply/bin/dcddp.
// Delegates to TS source via tsx, resolved from this repo so it works from any cwd.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const entry = resolve(__dirname, '../src/index.ts')
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href

const result = spawnSync(process.execPath, ['--import', tsx, entry, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
