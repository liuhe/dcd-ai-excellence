// `dcddp studio` — run the studio web app for one model (server mode), or export a
// read-only static copy. Managed projects never install anything: everything runs from
// this repository.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadGraph, nodeReader } from '@dcddp/core'

interface StudioOptions { model: string; port: string; host: string; export?: string; name?: string; open?: boolean }

const STUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'studio')

function ensureClientBuild(): void {
  if (existsSync(join(STUDIO_DIR, 'dist', 'client', 'index.html'))) return
  process.stdout.write('[studio] client build not found — running `vite build` once…\n')
  const r = spawnSync('npx', ['vite', 'build'], { cwd: STUDIO_DIR, stdio: 'inherit' })
  if (r.status !== 0) throw new Error('studio client build failed')
}

export async function studio(opts: StudioOptions): Promise<void> {
  const model = resolve(opts.model)
  if (!existsSync(join(model, 'index.yaml'))) throw new Error(`${model}: index.yaml not found (not a 7.0 model; run \`dcddp migrate\` first)`)
  // Default display name: the project directory (…/<project>/docs/<model>) or <parent>/<dir>.
  const parent = dirname(model)
  const name = opts.name ?? (basename(parent) === 'docs' ? basename(dirname(parent)) : `${basename(parent)}/${basename(model)}`)
  ensureClientBuild()

  if (opts.export) {
    const out = resolve(opts.export)
    await rm(out, { recursive: true, force: true })
    await mkdir(out, { recursive: true })
    await cp(join(STUDIO_DIR, 'dist', 'client'), out, { recursive: true })
    const graph = await loadGraph(model, nodeReader(model), { onWarn: () => {} })
    await writeFile(join(out, 'graph.json'), JSON.stringify({ name, graph }), 'utf-8')
    // attachments (diagrams / docs) referenced relative to detail files
    await cp(model, join(out, 'model'), { recursive: true, filter: src => !src.includes('/node_modules') })
    process.stdout.write(`✓ exported read-only studio to ${out}\n  serve it with any static server, e.g. python3 -m http.server -d ${out} 8080\n`)
    return
  }

  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
  const child = spawn(process.execPath, ['--import', tsx, join(STUDIO_DIR, 'server', 'index.ts')], {
    stdio: 'inherit',
    env: { ...process.env, STUDIO_MODEL: model, STUDIO_MODEL_NAME: name, STUDIO_PORT: opts.port, STUDIO_HOST: opts.host },
  })
  process.stdout.write(`[studio] model: ${model}\n[studio] open http://localhost:${opts.port}/\n`)
  await new Promise<void>((res, rej) => { child.on('exit', code => (code === 0 ? res() : rej(new Error(`studio server exited with ${code}`)))); child.on('error', rej) })
}
