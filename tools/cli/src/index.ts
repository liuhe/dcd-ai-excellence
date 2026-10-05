import { Command } from 'commander'
import { list } from './commands/list.ts'
import { get } from './commands/get.ts'
import { validate } from './commands/validate.ts'
import { migrate } from './commands/migrate.ts'
import {
  addNode, updateNodeCmd, removeNodeCmd, connectCmd, disconnectCmd, updateEdgeCmd, describeCmd, initCmd,
} from './commands/graph-verbs.ts'
import { vtAdd, vtUpdate, vtRemove, vtList, vtDescribe } from './commands/value-type.ts'
import { studio } from './commands/studio.ts'
import { importCmd } from './commands/import.ts'

// Piping into `head` closes stdout early; exit quietly instead of dumping an EPIPE stack.
process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EPIPE') process.exit(0); throw e })

const program = new Command()

program
  .name('dcddp')
  .description('DCDDP CLI — schema 7.0 (index.yaml + flat detail files, opaque ids). Full manual: tools/docs/CLI_MANUAL.md')
  .version('1.0.0-alpha')

const modelOpt = ['-m, --model <path>', 'Model root directory', '.'] as const

// -------------------- Inspect --------------------

program.command('list <kind>')
  .description('List nodes of a kind (id, name, container). <kind> is any node-kind (see `dcddp describe`).')
  .option(...modelOpt)
  .option('--parent <ref>', 'Only nodes under this parent (id or name)')
  .option('--json', 'Emit JSON', false)
  .action(list)

program.command('get <kind> <idOrName>')
  .description('Show one node with its attrs, edges and children. Name must be unique within the kind; otherwise use the id.')
  .option(...modelOpt)
  .option('--json', 'Emit JSON', false)
  .action(get)

program.command('validate')
  .description('Load the model and report structural problems. Exit 2 on error.')
  .option(...modelOpt)
  .option('--json', 'Emit JSON', false)
  .action(validate)

program.command('describe [kind]')
  .description('Introspect the vocabulary (list all kinds, or details of one).')
  .option('--json', 'Emit JSON', false)
  .option('--format <fmt>', 'Output format for "all": markdown (full reference doc)')
  .action(describeCmd)

// -------------------- Mutate (6 graph-primitive verbs) --------------------

program.command('add-node <kind> [name]')
  .description('Create a node. Non-root kinds need --parent; inline kinds (rule) take no name. Prints the allocated id.')
  .option(...modelOpt)
  .option('-p, --parent <ref>', 'Containing node (id or "<kind>:<name>")')
  .option('--package <path>', 'Package path in index.yaml, e.g. "Auth/Login"')
  .option('-s, --set <keyvals...>', 'attr=value (JSON arrays/objects accepted)', [])
  .option('--json', 'Emit JSON', false)
  .action(addNode)

program.command('import <file>')
  .description('Batch-create nodes and edges from an id-less nested YAML draft ("-" = stdin). Resolves refs, allocates ids, validates. Rejects the whole draft on any bad ref.')
  .option(...modelOpt)
  .option('--dry-run', 'Plan and report only; write nothing', false)
  .option('--json', 'Emit JSON', false)
  .action(importCmd)

program.command('update-node <kind> <idOrName>')
  .description('Modify attrs. name/package/parent are index-level: --set name=.. package=.. parent=<ref>; --unset package.')
  .option(...modelOpt)
  .option('-s, --set <keyvals...>', 'attr=value', [])
  .option('-u, --unset <keys...>', 'attr keys to remove', [])
  .option('--json', 'Emit JSON', false)
  .action(updateNodeCmd)

program.command('remove-node <kind> <idOrName>')
  .description('Delete a node and everything nested under it; references to them are cleaned up.')
  .option(...modelOpt)
  .option('--json', 'Emit JSON', false)
  .action(removeNodeCmd)

program.command('connect <from>')
  .description('Create an edge. <from> and --to are node refs: an id or "<kind>:<name>".')
  .option(...modelOpt)
  .requiredOption('-r, --rel <kind>', 'edge kind (see `dcddp describe <rel-kind>`)')
  .requiredOption('-t, --to <ref>', 'target node ref')
  .option('-s, --set <keyvals...>', 'edge attr=value', [])
  .option('--json', 'Emit JSON', false)
  .action(connectCmd)

program.command('update-edge <from>')
  .description('Modify attrs on an existing edge (struct-list rels only).')
  .option(...modelOpt)
  .requiredOption('-r, --rel <kind>', 'edge kind')
  .requiredOption('-t, --to <ref>', 'target node ref')
  .option('-s, --set <keyvals...>', 'edge attr=value', [])
  .option('-u, --unset <keys...>', 'edge attr keys to remove', [])
  .option('--json', 'Emit JSON', false)
  .action(updateEdgeCmd)

program.command('disconnect <from>')
  .description('Remove an edge.')
  .option(...modelOpt)
  .requiredOption('-r, --rel <kind>', 'edge kind')
  .requiredOption('-t, --to <ref>', 'target node ref')
  .option('--json', 'Emit JSON', false)
  .action(disconnectCmd)

// -------------------- Value types --------------------

const vt = program.command('vt').description('Value types (value-object / enum). They are nodes; these are convenience verbs.')
vt.command('list').description('List primitives and user-defined value types.')
  .option(...modelOpt).option('--app <ref>', 'Only this application').option('--json', 'Emit JSON', false).action(vtList)
vt.command('describe [kind]').description('Describe the value-type system or one kind.')
  .option(...modelOpt).option('--json', 'Emit JSON', false).action(vtDescribe)
vt.command('add <name>').description('Declare a value type under an application (or aggregate root for value-object).')
  .option(...modelOpt).requiredOption('-k, --kind <kind>', 'value-object | enum').requiredOption('-p, --parent <ref>', 'application (or entity) ref')
  .option('-s, --set <keyvals...>', 'attr=value', []).option('--json', 'Emit JSON', false).action(vtAdd)
vt.command('update <idOrName>').description('Modify a value type.')
  .option(...modelOpt).requiredOption('-k, --kind <kind>', 'value-object | enum')
  .option('-s, --set <keyvals...>', 'attr=value', []).option('-u, --unset <keys...>', 'attr keys to remove', []).option('--json', 'Emit JSON', false).action(vtUpdate)
vt.command('remove <idOrName>').description('Remove a value type.')
  .option(...modelOpt).requiredOption('-k, --kind <kind>', 'value-object | enum').option('--json', 'Emit JSON', false).action(vtRemove)

// -------------------- Lifecycle --------------------

program.command('init')
  .description('Create an empty 7.0 model directory.')
  .option(...modelOpt)
  .requiredOption('--org <name>', 'Organization name')
  .option('--json', 'Emit JSON', false)
  .action(initCmd)

program.command('studio')
  .description('Run the studio web app for a model (API + built client), or --export a read-only static copy.')
  .option(...modelOpt)
  .option('--port <port>', 'HTTP port', '4733')
  .option('--host <host>', 'Bind address', '0.0.0.0')
  .option('--name <name>', 'Display name (default: <parent>/<dir>)')
  .option('--export <dir>', 'Write a static read-only copy (SPA + graph.json + attachments) instead of serving')
  .action(studio)

program.command('migrate')
  .description('Migrate a model between schema versions (writes migration-report.md for 7.0).')
  .option(...modelOpt)
  .option('--from <version>', 'Override detected schema version')
  .option('--to <version>', 'Target schema version')
  .option('--dry-run', 'Show what would change without writing', false)
  .action(migrate)

program.parseAsync(process.argv).catch(err => {
  process.stderr.write(`dcddp: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
