// dcddp vocabulary registry — the meta-model as code (schema 7.0).
//
// Layer 2 of the four-layer stack (see tools/docs/DESIGN.md and tools/docs/STORAGE.md).
//   - node-kinds: what kinds of nodes exist, how they're identified (kind prefix + sequence),
//     where they sit in index.yaml (containment) and where their detail entry lives by default
//   - rel-kinds:  what kinds of edges exist, allowed (source, target) endpoint pairs, storage
//
// Storage model (7.0):
//   - `index.yaml` is the single source of existence: every node (except inline kinds) is
//     listed there with `id` + `name`; nesting expresses containment (the implicit rels).
//   - Detail files under `business/` and `applications/` are flat attribute bags keyed by id.
//     File boundaries carry no meaning — the loader scans every YAML file in those trees.
//   - Non-containment edges are stored on the source node's detail entry (string-list /
//     scalar / struct-list / derived shapes), with target values being node ids.
//
// All CLI commands are driven by this registry. Adding a new kind = adding an entry here.

// -------------------- Value-type system --------------------
//
// Value-types are schema-level type designations used in the `type` slot of attrs and
// fields. Primitives are built in; user-defined value-types (`value-object` / `enum`) are
// node kinds flagged `valueType: true` so they appear in index + sidebar like other nodes.

export const VALUE_TYPE_PRIMITIVES = [
  'String', 'Long', 'Integer', 'Boolean', 'Double', 'LocalDateTime', 'Date',
] as const

// Escape hatch marker — "intentionally unstructured prose" (distinct from `String`).
export const VALUE_TYPE_FREE_TEXT = 'free-text'

export interface NodeAttrSpec {
  name: string
  // Value-type designation: 'String' | 'Long' | 'free-text' | user-defined VT name |
  // composite like 'List<Long>' | 'Map<String, Foo>' | structured shapes below.
  //   'field-list'  — list of single-key maps `- name: "Type, desc"` (entity fields / event payload)
  //   'string-list' — list of strings
  type: string
}

// -------------------- Node kinds --------------------

// Where a kind's detail entry is written by default. `dir`:
//   'business'     → business/<file>.yaml
//   'applications' → applications/<file>.yaml
//   'app'          → applications/<app-id>-<app-name>/<file>.yaml (nearest application ancestor)
export interface DetailLocation {
  dir: 'business' | 'applications' | 'deployment' | 'app'
  file: string
}

export interface NodeKindSpec {
  kind: string
  // Id prefix: ids are `<idPrefix>-<seq>` (e.g. buc-003). Sequence is per prefix, never reused.
  idPrefix: string
  // Index placement. `view` for kinds that may appear at the top of a view; `parents` for
  // kinds that may be nested inside another kind's entry (containment = implicit rel).
  // A kind may have both (entity: business-scoped at top of `business`, or under
  // application / entity).
  view?: 'business' | 'applications' | 'deployment'
  parents: string[]
  // Inline kinds are not listed in index.yaml; they live inside the owner's detail entry
  // under `inlineKey` (e.g. rules). They still get ids from the sequence table.
  inline?: { key: string }
  // Value-type kinds (value-object / enum) — nodes, but also usable in `type` slots.
  valueType?: true
  // Default detail file (file boundaries are not semantic; this is where new entries go).
  location: DetailLocation
  attrs: NodeAttrSpec[]
  // If true, at most one instance of this kind may exist in a model.
  singleton?: true
  description: string
}

// -------------------- Rel kinds --------------------

// How a rel-kind stores its (source, target, attrs) triple on the source's detail entry.
// Target values are node ids. `field` is a key or dot-path on the entry.
export type RelStorage =
  // String appended to a list field on the source. Target id is the string.
  | { shape: 'string-list'; field: string }
  // Scalar field on the source. Target id is the value.
  | { shape: 'scalar'; field: string }
  // Struct appended to a list field on the source; struct has known field names.
  | { shape: 'struct-list'; field: string; targetField: string; kindField?: string; kindValue?: string }
  // Derived: no independent storage; computed from another structural attribute.
  | { shape: 'derived'; source: DerivedSource }
  // Containment: expressed by nesting in index.yaml (or inline placement). No storage here.
  | { shape: 'containment' }

export type DerivedSource =
  // Scan `container` (a field-list) and match each item's type name against nodes of
  // `matchNodeKind` in the same application scope.
  | { from: 'field-type'; container: string; matchNodeKind: string }

export interface RelEndpoint {
  source: string
  target: string
  storage: RelStorage
  // If true, every source-kind node MUST have at least one edge of this rel-kind to some
  // allowed target (satisfied by any required endpoint sharing the source).
  required?: boolean
}

export interface RelKindSpec {
  kind: string
  endpoints: RelEndpoint[]
  edgeAttrs: string[]
  // true = containment; the edge IS the index nesting (or inline placement).
  implicit?: boolean
  description: string
}

// -------------------- Endpoint helpers (public) --------------------

export function allowedSourceKinds(rel: RelKindSpec): string[] {
  return [...new Set(rel.endpoints.map(e => e.source))]
}

export function allowedTargetKinds(rel: RelKindSpec, sourceKind?: string): string[] {
  const candidates = sourceKind ? rel.endpoints.filter(e => e.source === sourceKind) : rel.endpoints
  return [...new Set(candidates.map(e => e.target))]
}

export function resolveEndpoint(rel: RelKindSpec, sourceKind: string, targetKind: string): RelEndpoint {
  const match = rel.endpoints.find(e => e.source === sourceKind && e.target === targetKind)
  if (!match) {
    const allowed = rel.endpoints.map(e => `${e.source}→${e.target}`).join(', ')
    throw new Error(`rel "${rel.kind}" does not allow ${sourceKind}→${targetKind}. Allowed: ${allowed}`)
  }
  return match
}

// -------------------- Ordering convention (CANONICAL) --------------------
//
// Declaration order of NODE_KINDS / REL_KINDS is the canonical display order everywhere.
// Consumers must NOT re-sort alphabetically. Insert new kinds at the semantically right spot.

const BIZ = (file: string): DetailLocation => ({ dir: 'business', file })
const APP = (file: string): DetailLocation => ({ dir: 'app', file })

export const NODE_KINDS: Record<string, NodeKindSpec> = {
  // ============ Business layer ============

  'organization': {
    kind: 'organization', idPrefix: 'org',
    view: 'business', parents: [],
    location: BIZ('actors'),
    singleton: true,
    attrs: [
      { name: 'summary', type: 'free-text' },
      { name: 'industry', type: 'String' },
    ],
    description: 'Organization — the business entity this model belongs to',
  },

  'business-worker': {
    kind: 'business-worker', idPrefix: 'bw',
    view: 'business', parents: [],
    location: BIZ('actors'),
    attrs: [{ name: 'summary', type: 'free-text' }],
    description: 'Business worker — an internal actor role (e.g. Admin, Support)',
  },

  'external-party': {
    kind: 'external-party', idPrefix: 'ep',
    view: 'business', parents: [],
    location: BIZ('actors'),
    attrs: [
      { name: 'type', type: 'String' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'External party — a person, org, or system outside the modeled organization (may contain participants)',
  },

  'participant': {
    kind: 'participant', idPrefix: 'pt',
    parents: ['external-party'],
    location: BIZ('actors'),
    attrs: [
      { name: 'type', type: 'String' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Participant — a specific role or actor inside an external party',
  },

  'business-use-case': {
    kind: 'business-use-case', idPrefix: 'buc',
    view: 'business', parents: [],
    location: BIZ('business-use-cases'),
    attrs: [
      { name: 'summary', type: 'free-text' },
      { name: 'stakeholder_interests', type: 'free-text' },
      { name: 'docs', type: 'free-text' },
    ],
    description: 'Business use case — value proposition the organization offers ("what you can do here")',
  },

  'system': {
    kind: 'system', idPrefix: 'sys',
    view: 'business', parents: [],
    location: BIZ('systems'),
    attrs: [{ name: 'summary', type: 'free-text' }],
    description: 'System — a bounded set of capabilities offered by the organization, container for system-use-cases',
  },

  'system-use-case': {
    kind: 'system-use-case', idPrefix: 'suc',
    parents: ['system'],
    location: BIZ('systems'),
    attrs: [{ name: 'summary', type: 'free-text' }],
    description: 'System use case — capability the system exposes ("what the system provides")',
  },

  // ============ Application layer ============

  'application': {
    kind: 'application', idPrefix: 'app',
    view: 'applications', parents: [],
    location: { dir: 'applications', file: 'applications' },
    attrs: [
      { name: 'type', type: 'String' },
      { name: 'summary', type: 'free-text' },
      { name: 'tech_stack', type: 'free-text' },
      { name: 'infrastructure', type: 'free-text' },
      { name: 'repositories', type: 'free-text' },
      { name: 'docs', type: 'free-text' },
    ],
    description: 'Application (subsystem) — a deployable unit of software',
  },

  'app-use-case': {
    kind: 'app-use-case', idPrefix: 'auc',
    parents: ['application'],
    location: APP('use-cases'),
    attrs: [
      { name: 'summary', type: 'free-text' },
      { name: 'api', type: 'string-list' },
      { name: 'docs', type: 'free-text' },
    ],
    description: 'App use case — responsibility slice inside an application',
  },

  'page': {
    kind: 'page', idPrefix: 'pg',
    parents: ['application'],
    location: APP('pages'),
    attrs: [
      { name: 'summary', type: 'free-text' },
      { name: 'display_mappings', type: 'string-list' },
      { name: 'external_links', type: 'free-text' },
    ],
    description: 'Page — a UI screen of a frontend application',
  },

  // Technical resource / integration point owned by an application: an API endpoint, a
  // message topic, a table, a cache key… Use cases reference it with `uses` (+ mode).
  'resource': {
    kind: 'resource', idPrefix: 'res',
    parents: ['application'],
    location: APP('resources'),
    attrs: [
      { name: 'type', type: 'String' },            // one of RESOURCE_TYPES
      { name: 'spec', type: 'free-text' },         // path + method / key pattern / schema summary
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Resource — a technical integration point owned by an application (api / topic / table / cache-key / queue / file / bucket). Use cases expose api resources; entities use the others',
  },
  'solution': {
    kind: 'solution', idPrefix: 'sol',
    view: 'applications', parents: [],
    location: { dir: 'applications', file: 'solutions' },
    attrs: [{ name: 'summary', type: 'free-text' }],
    description: 'Solution — how one concern is handled across the application layer (e.g. an entity\'s lifecycle): a named set of app use cases and entities from any application. Studio draws its use case diagram and entity diagram',
  },
  'observability-store': {
    kind: 'observability-store', idPrefix: 'obs',
    view: 'deployment', parents: [],
    location: { dir: 'deployment', file: 'observability-stores' },
    attrs: [
      { name: 'type', type: 'String' },                   // one of OBSERVABILITY_STORE_TYPES
      { name: 'grafana_url', type: 'String' },            // Grafana site that fronts this store, e.g. https://grafana.example.com
      { name: 'grafana_datasource_uid', type: 'String' }, // uid of the matching Grafana datasource (for deep links)
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Observability store — where metrics, logs or traces live (prometheus / loki / elasticsearch / clickhouse / tempo / …), in the deployment view. Metrics are sourced from it; with a Grafana URL the studio deep-links a metric\'s expression into Grafana Explore',
  },
  'data-source': {
    kind: 'data-source', idPrefix: 'ds',
    view: 'deployment', parents: [],
    location: { dir: 'deployment', file: 'data-sources' },
    attrs: [
      { name: 'type', type: 'String' },       // one of DATA_SOURCE_TYPES
      { name: 'endpoint', type: 'String' },   // host / dsn / cluster name, free text
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Data source — a store that holds business data (mysql / postgres / redis / kafka / mongodb / s3 / …), in the deployment view. Resources (tables, cache keys, topics, buckets) are stored in it',
  },
  'metric': {
    kind: 'metric', idPrefix: 'met',
    view: 'business', parents: ['application'],
    location: BIZ('metrics'),    // app-scoped metrics resolve to APP('metrics') — see locationFor()
    attrs: [
      { name: 'expression', type: 'free-text' },   // how it is computed: PromQL / SQL / 口径
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Metric — a monitoring metric or KPI: a name and an expression. Business-level at the top of the business view, technical under an application. `measures` points at the use cases / entities it observes; `sourced-from` names the observability store the expression runs against',
  },

  // ============ Domain layer ============

  // Entity is tri-positional: top of business view (business entity), under an
  // application (app-scoped DDD entity), or under another entity (aggregate member —
  // the parent is the aggregate root). Aggregates have no wrapper node (SCHEMA NOTE 17/18).
  'entity': {
    kind: 'entity', idPrefix: 'ent',
    view: 'business', parents: ['application', 'entity'],
    location: BIZ('entities'),   // app-scoped entities resolve to APP('domain') — see locationFor()
    attrs: [
      { name: 'archetype', type: 'String' },
      { name: 'table_name', type: 'String' },
      { name: 'summary', type: 'free-text' },
      { name: 'fields', type: 'field-list' },
      { name: 'invariants', type: 'string-list' },
      { name: 'methods', type: 'string-list' },
      { name: 'repository', type: 'free-text' },
      { name: 'notes', type: 'free-text' },
      { name: 'state_machine', type: 'free-text' },
      { name: 'docs', type: 'free-text' },
    ],
    description: 'Entity — a domain concept with identity. Business-scoped at the top of the business view; app-scoped under an application; nested under another entity = aggregate member',
  },

  'value-object': {
    kind: 'value-object', idPrefix: 'vo',
    parents: ['application', 'entity'],
    valueType: true,
    location: APP('domain'),
    attrs: [
      { name: 'fields', type: 'field-list' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Value object — immutable value type declared by an application (or inside an aggregate root)',
  },

  'enum': {
    kind: 'enum', idPrefix: 'enum',
    parents: ['application'],
    valueType: true,
    location: APP('domain'),
    attrs: [
      { name: 'values', type: 'string-list' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'Enum — closed set of named values declared by an application',
  },

  'role': {
    kind: 'role', idPrefix: 'role',
    parents: ['application'],
    location: APP('domain'),
    attrs: [
      { name: 'methods', type: 'string-list' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'OOP role / interface — abstract capability that an entity implements (app-scoped)',
  },

  'domain-service': {
    kind: 'domain-service', idPrefix: 'svc',
    parents: ['application'],
    location: APP('domain'),
    attrs: [
      { name: 'operations', type: 'string-list' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'DDD domain service — stateless operation across aggregates (app-scoped)',
  },

  'domain-event': {
    kind: 'domain-event', idPrefix: 'evt',
    parents: ['application'],
    location: APP('domain'),
    attrs: [
      { name: 'payload', type: 'field-list' },
      { name: 'published_when', type: 'free-text' },
      { name: 'summary', type: 'free-text' },
    ],
    description: 'DDD domain event — a fact that happened, published & handled by entities/services (app-scoped)',
  },

  // ============ Cross-cutting ============

  'rule': {
    kind: 'rule', idPrefix: 'rule',
    parents: ['app-use-case', 'entity'],
    inline: { key: 'rules' },
    location: BIZ('entities'),   // unused: inline kinds live in the owner's entry
    attrs: [
      { name: 'content', type: 'free-text' },
      { name: 'field', type: 'String' },
    ],
    description: 'Rule — a natural-language constraint attached to a use case or entity (inline in the owner\'s entry)',
  },
}

// Every node entry may carry an `ext` map of free-form extension attributes (project-specific
// metadata the vocabulary does not model: owner, data_source, ticket, ...). Tools keep it as-is,
// validate only checks that it is a map, studio shows and edits it as JSON.
export const EXT_ATTR = 'ext'

export const OBSERVABILITY_STORE_TYPES = ['prometheus', 'loki', 'elasticsearch', 'clickhouse', 'tempo', 'mysql', 'postgres'] as const
export const DATA_SOURCE_TYPES = ['mysql', 'postgres', 'redis', 'kafka', 'rabbitmq', 'mongodb', 'elasticsearch', 'clickhouse', 'hive', 'cassandra', 's3', 'oss'] as const

// Closed value sets for String attrs that validate checks.
export const RESOURCE_TYPES = ['api', 'topic', 'table', 'cache-key', 'queue', 'file', 'bucket'] as const
// `uses` edge modes. app-use-case → entity: read / write. entity → resource: read / write for
// table / cache-key / file / bucket; publish / subscribe for topic / queue.
export const USES_MODES = ['read', 'write', 'publish', 'subscribe'] as const
export const USES_MODES_BY_RESOURCE_TYPE: Record<string, readonly string[]> = {
  api: [], table: ['read', 'write'], 'cache-key': ['read', 'write'], file: ['read', 'write'], bucket: ['read', 'write'],
  topic: ['publish', 'subscribe'], queue: ['publish', 'subscribe'],
}

// Resolve where a node's detail entry goes given its ancestor chain (nearest first).
// Entities / VOs inherit application scope from their ancestors.
export function locationFor(kind: string, ancestorKinds: string[]): DetailLocation {
  const spec = NODE_KINDS[kind]
  if (!spec) throw new Error(`unknown node kind: ${kind}`)
  if (kind === 'entity' && ancestorKinds.includes('application')) return APP('domain')
  if (kind === 'metric' && ancestorKinds.includes('application')) return APP('metrics')
  return spec.location
}

// -------------------- Rel kinds registry --------------------

const containment = (pairs: Array<[string, string]>, kind: string, description: string): RelKindSpec => ({
  kind,
  endpoints: pairs.map(([source, target]) => ({ source, target, storage: { shape: 'containment' } })),
  edgeAttrs: [],
  implicit: true,
  description,
})

const structRel = (kindValue: string): RelStorage => ({
  shape: 'struct-list', field: 'relationships', targetField: 'target', kindField: 'kind', kindValue,
})

const DDD_EDGE_ATTRS = ['cardinality', 'via', 'note', 'bidirectional', 'from-role', 'to-role', 'from-cardinality', 'to-cardinality']

export const REL_KINDS: Record<string, RelKindSpec> = {
  // --- ownership (implicit — index nesting) ---

  'has-uc': containment([['system', 'system-use-case'], ['application', 'app-use-case']], 'has-uc',
    'System / application owns a use case (index nesting)'),
  'has-page': containment([['application', 'page']], 'has-page',
    'Application contains a page (index nesting)'),
  'has-participant': containment([['external-party', 'participant']], 'has-participant',
    'External party contains a participant (index nesting)'),
  'has-role': containment([['application', 'role']], 'has-role',
    'Application declares an OOP role (index nesting)'),
  'has-domain-service': containment([['application', 'domain-service']], 'has-domain-service',
    'Application declares a domain service (index nesting)'),
  'has-domain-event': containment([['application', 'domain-event']], 'has-domain-event',
    'Application declares a domain event (index nesting)'),
  'has-entity': containment([['application', 'entity']], 'has-entity',
    'Application scopes an entity (index nesting)'),
  'has-value-type': containment([['application', 'value-object'], ['application', 'enum'], ['entity', 'value-object']], 'has-value-type',
    'Application (or aggregate root) declares a value type (index nesting)'),
  'has-metric': containment([['application', 'metric']], 'has-metric', 'Application owns a technical metric'),
  'has-resource': containment([['application', 'resource']], 'has-resource',
    'Application owns a technical resource (index nesting)'),
  'aggregates': containment([['entity', 'entity']], 'aggregates',
    'DDD aggregate boundary: root entity aggregates member entities (index nesting under the root)'),
  'has-rule': {
    kind: 'has-rule',
    endpoints: [
      { source: 'app-use-case', target: 'rule', storage: { shape: 'containment' } },
      { source: 'entity', target: 'rule', storage: { shape: 'containment' } },
    ],
    edgeAttrs: [], implicit: true,
    description: 'App use case / entity owns a rule (inline in the owner\'s `rules`)',
  },

  // --- provides ---

  'provides': {
    kind: 'provides',
    endpoints: [{ source: 'organization', target: 'business-use-case', storage: { shape: 'string-list', field: 'provides' } }],
    edgeAttrs: [],
    description: 'Organization provides a business use case',
  },

  // --- actor ---

  'has-actor': {
    kind: 'has-actor',
    endpoints: (() => {
      const sources = ['business-use-case', 'system-use-case', 'app-use-case']
      const targets = ['business-worker', 'external-party', 'participant']
      const eps: RelEndpoint[] = []
      for (const s of sources) for (const t of targets) {
        eps.push({ source: s, target: t, storage: { shape: 'scalar', field: 'actor' }, required: s === 'business-use-case' || undefined })
      }
      // An application can act on a system / app use case (e.g. the frontend invoking a backend use case).
      for (const s of ['system-use-case', 'app-use-case']) eps.push({ source: s, target: 'application', storage: { shape: 'scalar', field: 'actor' } })
      return eps
    })(),
    edgeAttrs: [],
    description: 'A use case is performed by an actor — a business worker / external party / participant, or (for system & app use cases) another application (source\'s `actor` field)',
  },

  // --- functional dependency / invocation ---

  'uses': {
    kind: 'uses',
    endpoints: [
      { source: 'business-use-case', target: 'system-use-case', storage: { shape: 'string-list', field: 'uses' } },
      // business / system use case → business-layer entity (mode: read | write); stored in `entities`
      // because `uses` on a business use case already holds system-use-case ids
      { source: 'business-use-case', target: 'entity', storage: { shape: 'struct-list', field: 'entities', targetField: 'target' } },
      { source: 'system-use-case', target: 'entity', storage: { shape: 'struct-list', field: 'entities', targetField: 'target' } },
      { source: 'entity', target: 'value-object',
        storage: { shape: 'derived', source: { from: 'field-type', container: 'fields', matchNodeKind: 'value-object' } } },
      // app use case → entity (mode: read | write)
      { source: 'app-use-case', target: 'entity',
        storage: { shape: 'struct-list', field: 'uses', targetField: 'target' } },
      // entity → resource (mode: read | write for storage; publish | subscribe for messaging)
      { source: 'entity', target: 'resource',
        storage: { shape: 'struct-list', field: 'uses', targetField: 'target' } },
    ],
    edgeAttrs: ['mode', 'note'],
    description: 'Functional dependency: business use case invokes system use case; business / system use case uses a business-layer entity (read / write, field `entities`); entity uses a value object (derived from field types); app use case uses an entity (read / write); entity uses a resource (read / write / publish / subscribe)',
  },

  'covers': {
    kind: 'covers',
    endpoints: ['app-use-case', 'entity'].map(target => ({ source: 'solution', target, storage: { shape: 'string-list' as const, field: 'covers' } })),
    edgeAttrs: [],
    description: 'Solution covers an app use case or an entity',
  },
  'sourced-from': {
    kind: 'sourced-from',
    endpoints: [{ source: 'metric', target: 'observability-store', storage: { shape: 'scalar', field: 'store' } }],
    edgeAttrs: [],
    description: 'Metric is computed against an observability store (its expression runs there)',
  },
  'stored-in': {
    kind: 'stored-in',
    endpoints: [{ source: 'resource', target: 'data-source', storage: { shape: 'scalar', field: 'store' } }],
    edgeAttrs: [],
    description: 'Resource (table / cache-key / topic / queue / file / bucket) lives in a data source',
  },
  'measures': {
    kind: 'measures',
    endpoints: ['business-use-case', 'system-use-case', 'app-use-case', 'entity'].map(target => ({ source: 'metric', target, storage: { shape: 'string-list' as const, field: 'measures' } })),
    edgeAttrs: [],
    description: 'Metric observes a use case (any layer) or an entity',
  },
  'exposes': {
    kind: 'exposes',
    endpoints: [{ source: 'app-use-case', target: 'resource', storage: { shape: 'string-list', field: 'exposes' } }],
    edgeAttrs: [],
    description: 'App use case implements an API endpoint (resource of type api). Callers link to the use case (includes), not to the endpoint',
  },

  'has-entry': {
    kind: 'has-entry',
    endpoints: [{ source: 'system-use-case', target: 'app-use-case', storage: { shape: 'scalar', field: 'entry' } }],
    edgeAttrs: [],
    description: 'System use case designates its entry app use case',
  },

  // --- reference / annotation ---

  'references': {
    kind: 'references',
    endpoints: [
      { source: 'page', target: 'app-use-case', storage: { shape: 'string-list', field: 'related_use_cases' } },
      { source: 'rule', target: 'entity', storage: { shape: 'string-list', field: 'related_entities' } },
      { source: 'rule', target: 'app-use-case', storage: { shape: 'string-list', field: 'related_use_cases' } },
    ],
    edgeAttrs: [],
    description: 'Loose reference / annotation (page → app-uc; rule → entity; rule → app-uc)',
  },

  // --- UML use-case relations ---

  'includes': {
    kind: 'includes',
    endpoints: [{ source: 'app-use-case', target: 'app-use-case', storage: { shape: 'string-list', field: 'includes' } }],
    edgeAttrs: [],
    description: 'App use case includes another app use case (UML)',
  },
  'extends': {
    kind: 'extends',
    endpoints: [{ source: 'app-use-case', target: 'app-use-case', storage: { shape: 'string-list', field: 'extends' } }],
    edgeAttrs: [],
    description: 'App use case extends another app use case (UML)',
  },

  // --- DDD entity relations ---

  'composition': {
    kind: 'composition',
    endpoints: [{ source: 'entity', target: 'entity', storage: structRel('composition') }],
    edgeAttrs: DDD_EDGE_ATTRS,
    description: 'DDD composition (strong ownership, lifecycle-bound)',
  },
  'associates': {
    kind: 'associates',
    endpoints: [{ source: 'entity', target: 'entity', storage: structRel('associates') }],
    edgeAttrs: DDD_EDGE_ATTRS,
    description: 'Plain DDD association (reference, may carry cardinality/via)',
  },
  'depends-on': {
    kind: 'depends-on',
    endpoints: [{ source: 'entity', target: 'entity', storage: structRel('depends-on') }],
    edgeAttrs: ['note'],
    description: 'DDD dependency (weak coupling)',
  },
  'implements': {
    kind: 'implements',
    endpoints: [
      { source: 'entity', target: 'role', storage: structRel('implements') },
      // business layer: a PPT / MI / Description entity plays a Role entity (archetype: role)
      { source: 'entity', target: 'entity', storage: structRel('implements') },
    ],
    edgeAttrs: ['note'],
    description: 'Implementation — app entity implements a role (interface); business entity implements a role-archetype entity',
  },
  'realizes': {
    kind: 'realizes',
    endpoints: [{ source: 'entity', target: 'entity', storage: structRel('realizes') }],
    edgeAttrs: ['note'],
    description: 'DDD cross-layer realization: app-scoped entity realizes a business-scoped entity',
  },

  // --- DDD domain events ---

  'emits': {
    kind: 'emits',
    endpoints: [{ source: 'entity', target: 'domain-event', storage: { shape: 'string-list', field: 'emits' } }],
    edgeAttrs: [],
    description: 'Entity emits a domain event',
  },
  'handles': {
    kind: 'handles',
    endpoints: [
      { source: 'entity', target: 'domain-event', storage: { shape: 'string-list', field: 'handles' } },
      { source: 'domain-service', target: 'domain-event', storage: { shape: 'string-list', field: 'handles' } },
    ],
    edgeAttrs: [],
    description: 'Entity or domain service handles (subscribes to) a domain event',
  },

  // --- state machine ---

  'transitions-to': {
    kind: 'transitions-to',
    endpoints: [{ source: 'entity', target: 'entity',
      storage: { shape: 'struct-list', field: 'state_machine.transitions', targetField: 'to' } }],
    edgeAttrs: ['from', 'trigger'],
    description: 'State machine transition between entity states (self-loop; `to` is a state name)',
  },
}

// -------------------- Derived lookups --------------------

export function listNodeKinds(): string[] { return Object.keys(NODE_KINDS) }
export function listRelKinds(): string[] { return Object.keys(REL_KINDS) }

export function nodeSpec(kind: string): NodeKindSpec {
  const s = NODE_KINDS[kind]
  if (!s) throw new Error(`unknown node kind: ${kind}. Known: ${listNodeKinds().join(', ')}`)
  return s
}
export function relSpec(kind: string): RelKindSpec {
  const s = REL_KINDS[kind]
  if (!s) throw new Error(`unknown rel kind: ${kind}. Known: ${listRelKinds().join(', ')}`)
  return s
}

// Kind of an id by its prefix (`auc-017` → `app-use-case`). Null if no prefix matches.
export function kindOfId(id: string): string | null {
  const dash = id.lastIndexOf('-')
  if (dash <= 0) return null
  const prefix = id.slice(0, dash)
  if (!/^\d+$/.test(id.slice(dash + 1))) return null
  for (const spec of Object.values(NODE_KINDS)) if (spec.idPrefix === prefix) return spec.kind
  return null
}

export function isNodeId(s: string): boolean { return kindOfId(s) !== null }

// Which child kinds may nest under `parentKind` in index.yaml (declaration order).
export function childKindsOf(parentKind: string): string[] {
  return Object.values(NODE_KINDS).filter(s => !s.inline && s.parents.includes(parentKind)).map(s => s.kind)
}

// Inline child kinds of `ownerKind` (rules).
export function inlineKindsOf(ownerKind: string): NodeKindSpec[] {
  return Object.values(NODE_KINDS).filter(s => s.inline && s.parents.includes(ownerKind))
}

// Root kinds of a view (declaration order).
export function rootKindsOf(view: 'business' | 'applications' | 'deployment'): string[] {
  return Object.values(NODE_KINDS).filter(s => s.view === view).map(s => s.kind)
}

// The implicit rel-kind that expresses parent→child containment, if any.
export function containmentRel(parentKind: string, childKind: string): RelKindSpec | null {
  for (const rel of Object.values(REL_KINDS)) {
    if (!rel.implicit) continue
    if (rel.endpoints.some(e => e.source === parentKind && e.target === childKind)) return rel
  }
  return null
}

// Value-type kinds (user-defined) — for `type` slot resolution and `dcddp vt` listings.
export const VALUE_TYPE_KINDS: string[] = Object.values(NODE_KINDS).filter(s => s.valueType).map(s => s.kind)

// -------------------- Layers / groups (display) --------------------

export const NODE_LAYERS: { label: string; kinds: string[] }[] = [
  { label: 'Business layer',
    kinds: ['organization', 'business-worker', 'external-party', 'participant',
            'business-use-case', 'system', 'system-use-case'] },
  { label: 'Application layer', kinds: ['application', 'app-use-case', 'page', 'resource'] },
  { label: 'Domain layer', kinds: ['entity', 'value-object', 'enum', 'role', 'domain-service', 'domain-event'] },
  { label: 'Cross-cutting', kinds: ['rule'] },
]

export const REL_GROUPS: { label: string; kinds: string[] }[] = [
  { label: 'Ownership (implicit — index nesting)',
    kinds: ['has-uc', 'has-page', 'has-participant', 'has-role', 'has-domain-service',
            'has-domain-event', 'has-entity', 'has-value-type', 'has-resource', 'has-metric', 'aggregates', 'has-rule'] },
  { label: 'Provides', kinds: ['provides'] },
  { label: 'Actor', kinds: ['has-actor'] },
  { label: 'Functional dependency', kinds: ['uses', 'exposes', 'has-entry'] },
  { label: 'Observability', kinds: ['measures', 'sourced-from'] },
  { label: 'Deployment', kinds: ['stored-in'] },
  { label: 'Solution', kinds: ['covers'] },
  { label: 'Reference', kinds: ['references'] },
  { label: 'UML use-case relations', kinds: ['includes', 'extends'] },
  { label: 'DDD entity relations', kinds: ['composition', 'associates', 'depends-on', 'implements', 'realizes'] },
  { label: 'DDD events', kinds: ['emits', 'handles'] },
  { label: 'State machine', kinds: ['transitions-to'] },
]

// -------------------- Discovery helpers (user-facing output, English) --------------------

function locationLine(spec: NodeKindSpec): string {
  if (spec.inline) return `inline: owner entry's \`${spec.inline.key}[]\` (not listed in index.yaml)`
  const loc = spec.location
  if (loc.dir === 'business') return `business/${loc.file}.yaml → ${spec.kind}[]`
  if (loc.dir === 'applications') return `applications/${loc.file}.yaml → ${spec.kind}[]`
  return `applications/<app-id>-<app-name>/${loc.file}.yaml → ${spec.kind}[]`
}

function indexLines(spec: NodeKindSpec): string[] {
  const out: string[] = []
  if (spec.inline) return out
  if (spec.view) out.push(`index.yaml: ${spec.view}.${spec.kind}[]`)
  for (const p of spec.parents) out.push(`index.yaml: nested under a ${p} entry as ${spec.kind}[]`)
  return out
}

export function nodeStorageLines(spec: NodeKindSpec): string[] {
  const out = indexLines(spec)
  if (spec.kind === 'entity') {
    out.push(`Detail: business/entities.yaml (business-scoped) or applications/<app>/domain.yaml (app-scoped)`)
  } else {
    out.push(`Detail: ${locationLine(spec)}`)
  }
  return out
}

export function endpointStorageLines(ep: RelEndpoint, edgeAttrs: string[]): string[] {
  const s = ep.storage
  const out: string[] = []
  if (s.shape === 'containment') {
    out.push(`Containment — expressed by nesting the ${ep.target} under the ${ep.source} in index.yaml`)
    return out
  }
  if (s.shape === 'derived') {
    out.push(`Derived — computed from source's \`${s.source.container}[?].type\` matching ${s.source.matchNodeKind} names in the same application`)
    out.push(`CLI: connect/disconnect not supported — edit the underlying \`${s.source.container}\``)
    return out
  }
  out.push(`Stored on source entry at \`${s.field}\` — target value is the target node id`)
  if (s.shape === 'string-list') out.push(`Shape: string list. Example: \`${s.field}: [${ep.target === 'entity' ? 'ent-003' : NODE_KINDS[ep.target]?.idPrefix + '-001'}]\``)
  else if (s.shape === 'scalar') out.push(`Shape: scalar — at most one edge of this kind per source. Example: \`${s.field}: ${NODE_KINDS[ep.target]?.idPrefix}-001\``)
  else if (s.shape === 'struct-list') {
    out.push(`Shape: struct list — ${s.kindField ? `\`${s.kindField}: ${s.kindValue}\` marks this rel-kind; ` : ''}target in \`${s.targetField}\``)
    if (edgeAttrs.length) out.push(`Edge attrs live alongside in the map: ${edgeAttrs.join(', ')}`)
  }
  return out
}

export function describeNode(kind: string): string {
  const spec = NODE_KINDS[kind]
  if (!spec) return `unknown node kind: ${kind}`
  const lines: string[] = []
  lines.push(`Node kind: ${kind}\n  ${spec.description}`)
  lines.push(`  Id form: ${spec.idPrefix}-<seq> (e.g. ${spec.idPrefix}-001); address by id or by "${kind}:<name>"`)
  if (spec.singleton) lines.push(`  Cardinality: singleton (at most 1 per model)`)
  if (spec.view) lines.push(`  Placement: top of ${spec.view} view${spec.parents.length ? ` or under: ${spec.parents.join(', ')}` : ''}`)
  else lines.push(`  Placement: under: ${spec.parents.join(', ')} (--parent required)`)
  lines.push(`  Allowed attrs (--set):`)
  for (const a of spec.attrs) lines.push(`    - ${a.name} : ${a.type}`)
  lines.push(`  Storage:`)
  for (const line of nodeStorageLines(spec)) lines.push(`    ${line}`)
  return lines.join('\n')
}

export function describeRel(kind: string): string {
  const spec = REL_KINDS[kind]
  if (!spec) return `unknown rel kind: ${kind}`
  const lines: string[] = []
  lines.push(`Rel kind: ${kind}\n  ${spec.description}`)
  if (spec.implicit) lines.push(`  (implicit — containment; create by nesting / --parent, not by connect)`)
  lines.push(`  Edge attrs (--set): ${spec.edgeAttrs.length ? spec.edgeAttrs.join(', ') : '(none — endpoints only)'}`)
  lines.push(`  Endpoints:`)
  for (const ep of spec.endpoints) {
    lines.push(`    - ${ep.source} → ${ep.target}${ep.required ? ' (REQUIRED)' : ''}`)
    for (const line of endpointStorageLines(ep, spec.edgeAttrs)) lines.push(`        ${line}`)
  }
  return lines.join('\n')
}

// -------------------- Markdown reference generation --------------------

function mdNodeKind(kind: string): string[] {
  const spec = NODE_KINDS[kind]
  const out: string[] = []
  out.push(`#### \`${kind}\``, '', spec.description, '')
  out.push(`- **Id**: \`${spec.idPrefix}-<seq>\``)
  if (spec.singleton) out.push(`- **Cardinality**: singleton (at most 1 per model)`)
  out.push(`- **Placement**: ${spec.view ? `top of \`${spec.view}\` view` : ''}${spec.view && spec.parents.length ? ' or ' : ''}${spec.parents.length ? `under ${spec.parents.map(p => `\`${p}\``).join(' / ')}` : ''}`)
  out.push(`- **Storage**:`)
  for (const line of nodeStorageLines(spec)) out.push(`  - ${line}`)
  if (spec.attrs.length) {
    out.push(`- **Attrs**:`, '', '  | Name | Type |', '  |------|------|')
    for (const a of spec.attrs) out.push(`  | \`${a.name}\` | \`${a.type}\` |`)
  } else out.push(`- **Attrs**: _(none beyond name)_`)
  out.push('')
  return out
}

function mdRelKind(kind: string): string[] {
  const spec = REL_KINDS[kind]
  const out: string[] = []
  out.push(`#### \`${kind}\``, '', spec.description, '')
  if (spec.implicit) out.push(`_Implicit — containment expressed by index.yaml nesting._`, '')
  out.push(`- **Edge attrs**: ${spec.edgeAttrs.length ? spec.edgeAttrs.map(a => `\`${a}\``).join(', ') : '_(none — endpoints only)_'}`)
  out.push(`- **Endpoints**:`)
  for (const ep of spec.endpoints) {
    out.push(`  - \`${ep.source}\` → \`${ep.target}\`${ep.required ? ' **(required)**' : ''}`)
    for (const line of endpointStorageLines(ep, spec.edgeAttrs)) out.push(`    - ${line}`)
  }
  out.push('')
  return out
}

export function describeVocabularyMarkdown(): string {
  const out: string[] = []
  out.push('# Vocabulary reference', '',
    '> **AUTO-GENERATED** — do not hand-edit.',
    '> Source: `tools/core/src/vocabulary.ts`.',
    '> Regenerate: `dcddp describe --format markdown > tools/docs/vocabulary-reference.md`', '',
    'Schema 7.0 storage: `index.yaml` lists every node (id + name, nesting = containment);',
    'detail entries live in flat per-kind files under `business/` and `applications/`.', '')
  out.push('## Index', '')
  out.push('**Node kinds** (' + Object.keys(NODE_KINDS).length + '): ' + Object.keys(NODE_KINDS).map(k => `\`${k}\``).join(' · '), '')
  out.push('**Rel kinds** (' + Object.keys(REL_KINDS).length + '): ' + Object.keys(REL_KINDS).map(k => `\`${k}\``).join(' · '), '')
  out.push('**Value-type kinds**: primitives (built-in), `free-text` (escape hatch), ' + VALUE_TYPE_KINDS.map(k => `\`${k}\``).join(' · ') + ' (user-defined nodes)', '')
  out.push('## Node kinds', '')
  const seenNodes = new Set<string>()
  for (const layer of NODE_LAYERS) {
    out.push(`### ${layer.label}`, '')
    for (const k of layer.kinds) { if (k in NODE_KINDS) { seenNodes.add(k); out.push(...mdNodeKind(k)) } }
  }
  for (const k of Object.keys(NODE_KINDS)) if (!seenNodes.has(k)) out.push(...mdNodeKind(k))
  out.push('## Rel kinds', '')
  const seenRels = new Set<string>()
  for (const group of REL_GROUPS) {
    out.push(`### ${group.label}`, '')
    for (const k of group.kinds) { if (k in REL_KINDS) { seenRels.add(k); out.push(...mdRelKind(k)) } }
  }
  for (const k of Object.keys(REL_KINDS)) if (!seenRels.has(k)) out.push(...mdRelKind(k))
  out.push('---', '', '## Value-type system', '',
    'Value-types appear in the `type` slot of attrs and fields. Primitives: ' + VALUE_TYPE_PRIMITIVES.map(p => `\`${p}\``).join(' · '),
    '', '`free-text` — intentionally unstructured prose. `field-list` — list of `- name: "Type, desc"`. `string-list` — list of strings.',
    '', 'User-defined value types are the node kinds ' + VALUE_TYPE_KINDS.map(k => `\`${k}\``).join(' · ') + '; a field type names one by its name within the same application.',
    '', 'Composite: `List<T>` · `Optional<T>` · `Map<K, V>`.', '',
    '---', '', '## Extension attributes', '',
    'Every node entry may carry an `ext` map of free-form extension attributes (project-specific metadata the vocabulary does not model, e.g. `ext: { owner: 交易团队, data_source: ClickHouse }`). Tools keep it verbatim; `validate` only checks that it is a map; `--set ext.owner=…` writes into it.', '')
  return out.join('\n')
}
