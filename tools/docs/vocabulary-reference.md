# Vocabulary reference

> **AUTO-GENERATED** — do not hand-edit.
> Source: `tools/core/src/vocabulary.ts`.
> Regenerate: `dcddp describe --format markdown > tools/docs/vocabulary-reference.md`

Schema 7.0 storage: `index.yaml` lists every node (id + name, nesting = containment);
detail entries live in flat per-kind files under `business/` and `applications/`.

## Index

**Node kinds** (19): `organization` · `business-worker` · `external-party` · `participant` · `business-use-case` · `system` · `system-use-case` · `application` · `app-use-case` · `page` · `resource` · `metric` · `entity` · `value-object` · `enum` · `role` · `domain-service` · `domain-event` · `rule`

**Rel kinds** (29): `has-uc` · `has-page` · `has-participant` · `has-role` · `has-domain-service` · `has-domain-event` · `has-entity` · `has-value-type` · `has-metric` · `has-resource` · `aggregates` · `has-rule` · `provides` · `has-actor` · `uses` · `measures` · `exposes` · `has-entry` · `references` · `includes` · `extends` · `composition` · `associates` · `depends-on` · `implements` · `realizes` · `emits` · `handles` · `transitions-to`

**Value-type kinds**: primitives (built-in), `free-text` (escape hatch), `value-object` · `enum` (user-defined nodes)

## Node kinds

### Business layer

#### `organization`

Organization — the business entity this model belongs to

- **Id**: `org-<seq>`
- **Cardinality**: singleton (at most 1 per model)
- **Placement**: top of `business` view
- **Storage**:
  - index.yaml: business.organization[]
  - Detail: business/actors.yaml → organization[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |
  | `industry` | `String` |

#### `business-worker`

Business worker — an internal actor role (e.g. Admin, Support)

- **Id**: `bw-<seq>`
- **Placement**: top of `business` view
- **Storage**:
  - index.yaml: business.business-worker[]
  - Detail: business/actors.yaml → business-worker[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |

#### `external-party`

External party — a person, org, or system outside the modeled organization (may contain participants)

- **Id**: `ep-<seq>`
- **Placement**: top of `business` view
- **Storage**:
  - index.yaml: business.external-party[]
  - Detail: business/actors.yaml → external-party[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `type` | `String` |
  | `summary` | `free-text` |

#### `participant`

Participant — a specific role or actor inside an external party

- **Id**: `pt-<seq>`
- **Placement**: under `external-party`
- **Storage**:
  - index.yaml: nested under a external-party entry as participant[]
  - Detail: business/actors.yaml → participant[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `type` | `String` |
  | `summary` | `free-text` |

#### `business-use-case`

Business use case — value proposition the organization offers ("what you can do here")

- **Id**: `buc-<seq>`
- **Placement**: top of `business` view
- **Storage**:
  - index.yaml: business.business-use-case[]
  - Detail: business/business-use-cases.yaml → business-use-case[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |
  | `stakeholder_interests` | `free-text` |
  | `docs` | `free-text` |

#### `system`

System — a bounded set of capabilities offered by the organization, container for system-use-cases

- **Id**: `sys-<seq>`
- **Placement**: top of `business` view
- **Storage**:
  - index.yaml: business.system[]
  - Detail: business/systems.yaml → system[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |

#### `system-use-case`

System use case — capability the system exposes ("what the system provides")

- **Id**: `suc-<seq>`
- **Placement**: under `system`
- **Storage**:
  - index.yaml: nested under a system entry as system-use-case[]
  - Detail: business/systems.yaml → system-use-case[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |

### Application layer

#### `application`

Application (subsystem) — a deployable unit of software

- **Id**: `app-<seq>`
- **Placement**: top of `applications` view
- **Storage**:
  - index.yaml: applications.application[]
  - Detail: applications/applications.yaml → application[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `type` | `String` |
  | `summary` | `free-text` |
  | `tech_stack` | `free-text` |
  | `infrastructure` | `free-text` |
  | `repositories` | `free-text` |
  | `docs` | `free-text` |

#### `app-use-case`

App use case — responsibility slice inside an application

- **Id**: `auc-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as app-use-case[]
  - Detail: applications/<app-id>-<app-name>/use-cases.yaml → app-use-case[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |
  | `api` | `string-list` |
  | `docs` | `free-text` |

#### `page`

Page — a UI screen of a frontend application

- **Id**: `pg-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as page[]
  - Detail: applications/<app-id>-<app-name>/pages.yaml → page[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `summary` | `free-text` |
  | `display_mappings` | `string-list` |
  | `external_links` | `free-text` |

#### `resource`

Resource — a technical integration point owned by an application (api / topic / table / cache-key / queue / file / bucket). Use cases expose api resources; entities use the others

- **Id**: `res-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as resource[]
  - Detail: applications/<app-id>-<app-name>/resources.yaml → resource[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `type` | `String` |
  | `spec` | `free-text` |
  | `summary` | `free-text` |

### Domain layer

#### `entity`

Entity — a domain concept with identity. Business-scoped at the top of the business view; app-scoped under an application; nested under another entity = aggregate member

- **Id**: `ent-<seq>`
- **Placement**: top of `business` view or under `application` / `entity`
- **Storage**:
  - index.yaml: business.entity[]
  - index.yaml: nested under a application entry as entity[]
  - index.yaml: nested under a entity entry as entity[]
  - Detail: business/entities.yaml (business-scoped) or applications/<app>/domain.yaml (app-scoped)
- **Attrs**:

  | Name | Type |
  |------|------|
  | `archetype` | `String` |
  | `table_name` | `String` |
  | `summary` | `free-text` |
  | `fields` | `field-list` |
  | `invariants` | `string-list` |
  | `methods` | `string-list` |
  | `repository` | `free-text` |
  | `notes` | `free-text` |
  | `state_machine` | `free-text` |
  | `docs` | `free-text` |

#### `value-object`

Value object — immutable value type declared by an application (or inside an aggregate root)

- **Id**: `vo-<seq>`
- **Placement**: under `application` / `entity`
- **Storage**:
  - index.yaml: nested under a application entry as value-object[]
  - index.yaml: nested under a entity entry as value-object[]
  - Detail: applications/<app-id>-<app-name>/domain.yaml → value-object[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `fields` | `field-list` |
  | `summary` | `free-text` |

#### `enum`

Enum — closed set of named values declared by an application

- **Id**: `enum-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as enum[]
  - Detail: applications/<app-id>-<app-name>/domain.yaml → enum[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `values` | `string-list` |
  | `summary` | `free-text` |

#### `role`

OOP role / interface — abstract capability that an entity implements (app-scoped)

- **Id**: `role-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as role[]
  - Detail: applications/<app-id>-<app-name>/domain.yaml → role[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `methods` | `string-list` |
  | `summary` | `free-text` |

#### `domain-service`

DDD domain service — stateless operation across aggregates (app-scoped)

- **Id**: `svc-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as domain-service[]
  - Detail: applications/<app-id>-<app-name>/domain.yaml → domain-service[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `operations` | `string-list` |
  | `summary` | `free-text` |

#### `domain-event`

DDD domain event — a fact that happened, published & handled by entities/services (app-scoped)

- **Id**: `evt-<seq>`
- **Placement**: under `application`
- **Storage**:
  - index.yaml: nested under a application entry as domain-event[]
  - Detail: applications/<app-id>-<app-name>/domain.yaml → domain-event[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `payload` | `field-list` |
  | `published_when` | `free-text` |
  | `summary` | `free-text` |

### Cross-cutting

#### `rule`

Rule — a natural-language constraint attached to a use case or entity (inline in the owner's entry)

- **Id**: `rule-<seq>`
- **Placement**: under `app-use-case` / `entity`
- **Storage**:
  - Detail: inline: owner entry's `rules[]` (not listed in index.yaml)
- **Attrs**:

  | Name | Type |
  |------|------|
  | `content` | `free-text` |
  | `field` | `String` |

#### `metric`

Metric — a monitoring metric or KPI: a name and an expression. Business-level at the top of the business view, technical under an application. `measures` points at the use cases / entities it observes; anything else (data source, owner, alert) goes in `ext`

- **Id**: `met-<seq>`
- **Placement**: top of `business` view or under `application`
- **Storage**:
  - index.yaml: business.metric[]
  - index.yaml: nested under a application entry as metric[]
  - Detail: business/metrics.yaml → metric[]
- **Attrs**:

  | Name | Type |
  |------|------|
  | `expression` | `free-text` |
  | `summary` | `free-text` |

## Rel kinds

### Ownership (implicit — index nesting)

#### `has-uc`

System / application owns a use case (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `system` → `system-use-case`
    - Containment — expressed by nesting the system-use-case under the system in index.yaml
  - `application` → `app-use-case`
    - Containment — expressed by nesting the app-use-case under the application in index.yaml

#### `has-page`

Application contains a page (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `page`
    - Containment — expressed by nesting the page under the application in index.yaml

#### `has-participant`

External party contains a participant (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `external-party` → `participant`
    - Containment — expressed by nesting the participant under the external-party in index.yaml

#### `has-role`

Application declares an OOP role (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `role`
    - Containment — expressed by nesting the role under the application in index.yaml

#### `has-domain-service`

Application declares a domain service (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `domain-service`
    - Containment — expressed by nesting the domain-service under the application in index.yaml

#### `has-domain-event`

Application declares a domain event (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `domain-event`
    - Containment — expressed by nesting the domain-event under the application in index.yaml

#### `has-entity`

Application scopes an entity (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `entity`
    - Containment — expressed by nesting the entity under the application in index.yaml

#### `has-value-type`

Application (or aggregate root) declares a value type (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `value-object`
    - Containment — expressed by nesting the value-object under the application in index.yaml
  - `application` → `enum`
    - Containment — expressed by nesting the enum under the application in index.yaml
  - `entity` → `value-object`
    - Containment — expressed by nesting the value-object under the entity in index.yaml

#### `has-resource`

Application owns a technical resource (index nesting)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `resource`
    - Containment — expressed by nesting the resource under the application in index.yaml

#### `has-metric`

Application owns a technical metric

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `application` → `metric`
    - Containment — expressed by nesting the metric under the application in index.yaml

#### `aggregates`

DDD aggregate boundary: root entity aggregates member entities (index nesting under the root)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `entity` → `entity`
    - Containment — expressed by nesting the entity under the entity in index.yaml

#### `has-rule`

App use case / entity owns a rule (inline in the owner's `rules`)

_Implicit — containment expressed by index.yaml nesting._

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `app-use-case` → `rule`
    - Containment — expressed by nesting the rule under the app-use-case in index.yaml
  - `entity` → `rule`
    - Containment — expressed by nesting the rule under the entity in index.yaml

### Provides

#### `provides`

Organization provides a business use case

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `organization` → `business-use-case`
    - Stored on source entry at `provides` — target value is the target node id
    - Shape: string list. Example: `provides: [buc-001]`

### Actor

#### `has-actor`

A use case is performed by an actor — a business worker / external party / participant, or (for system & app use cases) another application (source's `actor` field)

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `business-use-case` → `business-worker` **(required)**
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: bw-001`
  - `business-use-case` → `external-party` **(required)**
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: ep-001`
  - `business-use-case` → `participant` **(required)**
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: pt-001`
  - `system-use-case` → `business-worker`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: bw-001`
  - `system-use-case` → `external-party`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: ep-001`
  - `system-use-case` → `participant`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: pt-001`
  - `app-use-case` → `business-worker`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: bw-001`
  - `app-use-case` → `external-party`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: ep-001`
  - `app-use-case` → `participant`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: pt-001`
  - `system-use-case` → `application`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: app-001`
  - `app-use-case` → `application`
    - Stored on source entry at `actor` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `actor: app-001`

### Functional dependency

#### `uses`

Functional dependency: business use case invokes system use case; business / system use case uses a business-layer entity (read / write, field `entities`); entity uses a value object (derived from field types); app use case uses an entity (read / write); entity uses a resource (read / write / publish / subscribe)

- **Edge attrs**: `mode`, `note`
- **Endpoints**:
  - `business-use-case` → `system-use-case`
    - Stored on source entry at `uses` — target value is the target node id
    - Shape: string list. Example: `uses: [suc-001]`
  - `business-use-case` → `entity`
    - Stored on source entry at `entities` — target value is the target node id
    - Shape: struct list — target in `target`
    - Edge attrs live alongside in the map: mode, note
  - `system-use-case` → `entity`
    - Stored on source entry at `entities` — target value is the target node id
    - Shape: struct list — target in `target`
    - Edge attrs live alongside in the map: mode, note
  - `entity` → `value-object`
    - Derived — computed from source's `fields[?].type` matching value-object names in the same application
    - CLI: connect/disconnect not supported — edit the underlying `fields`
  - `app-use-case` → `entity`
    - Stored on source entry at `uses` — target value is the target node id
    - Shape: struct list — target in `target`
    - Edge attrs live alongside in the map: mode, note
  - `entity` → `resource`
    - Stored on source entry at `uses` — target value is the target node id
    - Shape: struct list — target in `target`
    - Edge attrs live alongside in the map: mode, note

#### `exposes`

App use case implements an API endpoint (resource of type api). Callers link to the use case (includes), not to the endpoint

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `app-use-case` → `resource`
    - Stored on source entry at `exposes` — target value is the target node id
    - Shape: string list. Example: `exposes: [res-001]`

#### `has-entry`

System use case designates its entry app use case

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `system-use-case` → `app-use-case`
    - Stored on source entry at `entry` — target value is the target node id
    - Shape: scalar — at most one edge of this kind per source. Example: `entry: auc-001`

### Observability

#### `measures`

Metric observes a use case (any layer) or an entity

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `metric` → `business-use-case`
    - Stored on source entry at `measures` — target value is the target node id
    - Shape: string list. Example: `measures: [buc-001]`
  - `metric` → `system-use-case`
    - Stored on source entry at `measures` — target value is the target node id
    - Shape: string list. Example: `measures: [suc-001]`
  - `metric` → `app-use-case`
    - Stored on source entry at `measures` — target value is the target node id
    - Shape: string list. Example: `measures: [auc-001]`
  - `metric` → `entity`
    - Stored on source entry at `measures` — target value is the target node id
    - Shape: string list. Example: `measures: [ent-003]`

### Reference

#### `references`

Loose reference / annotation (page → app-uc; rule → entity; rule → app-uc)

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `page` → `app-use-case`
    - Stored on source entry at `related_use_cases` — target value is the target node id
    - Shape: string list. Example: `related_use_cases: [auc-001]`
  - `rule` → `entity`
    - Stored on source entry at `related_entities` — target value is the target node id
    - Shape: string list. Example: `related_entities: [ent-003]`
  - `rule` → `app-use-case`
    - Stored on source entry at `related_use_cases` — target value is the target node id
    - Shape: string list. Example: `related_use_cases: [auc-001]`

### UML use-case relations

#### `includes`

App use case includes another app use case (UML)

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `app-use-case` → `app-use-case`
    - Stored on source entry at `includes` — target value is the target node id
    - Shape: string list. Example: `includes: [auc-001]`

#### `extends`

App use case extends another app use case (UML)

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `app-use-case` → `app-use-case`
    - Stored on source entry at `extends` — target value is the target node id
    - Shape: string list. Example: `extends: [auc-001]`

### DDD entity relations

#### `composition`

DDD composition (strong ownership, lifecycle-bound)

- **Edge attrs**: `cardinality`, `via`, `note`, `bidirectional`, `from-role`, `to-role`, `from-cardinality`, `to-cardinality`
- **Endpoints**:
  - `entity` → `entity`
    - Stored on source entry at `relationships` — target value is the target node id
    - Shape: struct list — `kind: composition` marks this rel-kind; target in `target`
    - Edge attrs live alongside in the map: cardinality, via, note, bidirectional, from-role, to-role, from-cardinality, to-cardinality

#### `associates`

Plain DDD association (reference, may carry cardinality/via)

- **Edge attrs**: `cardinality`, `via`, `note`, `bidirectional`, `from-role`, `to-role`, `from-cardinality`, `to-cardinality`
- **Endpoints**:
  - `entity` → `entity`
    - Stored on source entry at `relationships` — target value is the target node id
    - Shape: struct list — `kind: associates` marks this rel-kind; target in `target`
    - Edge attrs live alongside in the map: cardinality, via, note, bidirectional, from-role, to-role, from-cardinality, to-cardinality

#### `depends-on`

DDD dependency (weak coupling)

- **Edge attrs**: `note`
- **Endpoints**:
  - `entity` → `entity`
    - Stored on source entry at `relationships` — target value is the target node id
    - Shape: struct list — `kind: depends-on` marks this rel-kind; target in `target`
    - Edge attrs live alongside in the map: note

#### `implements`

Implementation — app entity implements a role (interface); business entity implements a role-archetype entity

- **Edge attrs**: `note`
- **Endpoints**:
  - `entity` → `role`
    - Stored on source entry at `relationships` — target value is the target node id
    - Shape: struct list — `kind: implements` marks this rel-kind; target in `target`
    - Edge attrs live alongside in the map: note
  - `entity` → `entity`
    - Stored on source entry at `relationships` — target value is the target node id
    - Shape: struct list — `kind: implements` marks this rel-kind; target in `target`
    - Edge attrs live alongside in the map: note

#### `realizes`

DDD cross-layer realization: app-scoped entity realizes a business-scoped entity

- **Edge attrs**: `note`
- **Endpoints**:
  - `entity` → `entity`
    - Stored on source entry at `relationships` — target value is the target node id
    - Shape: struct list — `kind: realizes` marks this rel-kind; target in `target`
    - Edge attrs live alongside in the map: note

### DDD events

#### `emits`

Entity emits a domain event

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `entity` → `domain-event`
    - Stored on source entry at `emits` — target value is the target node id
    - Shape: string list. Example: `emits: [evt-001]`

#### `handles`

Entity or domain service handles (subscribes to) a domain event

- **Edge attrs**: _(none — endpoints only)_
- **Endpoints**:
  - `entity` → `domain-event`
    - Stored on source entry at `handles` — target value is the target node id
    - Shape: string list. Example: `handles: [evt-001]`
  - `domain-service` → `domain-event`
    - Stored on source entry at `handles` — target value is the target node id
    - Shape: string list. Example: `handles: [evt-001]`

### State machine

#### `transitions-to`

State machine transition between entity states (self-loop; `to` is a state name)

- **Edge attrs**: `from`, `trigger`
- **Endpoints**:
  - `entity` → `entity`
    - Stored on source entry at `state_machine.transitions` — target value is the target node id
    - Shape: struct list — target in `to`
    - Edge attrs live alongside in the map: from, trigger

---

## Value-type system

Value-types appear in the `type` slot of attrs and fields. Primitives: `String` · `Long` · `Integer` · `Boolean` · `Double` · `LocalDateTime` · `Date`

`free-text` — intentionally unstructured prose. `field-list` — list of `- name: "Type, desc"`. `string-list` — list of strings.

User-defined value types are the node kinds `value-object` · `enum`; a field type names one by its name within the same application.

Composite: `List<T>` · `Optional<T>` · `Map<K, V>`.

---

## Extension attributes

Every node entry may carry an `ext` map of free-form extension attributes (project-specific metadata the vocabulary does not model, e.g. `ext: { owner: 交易团队, data_source: ClickHouse }`). Tools keep it verbatim; `validate` only checks that it is a map; `--set ext.owner=…` writes into it.
