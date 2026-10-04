// Migration 6.0 → 7.0: nested-by-parent files → index.yaml + flat detail files with ids.
//
//   6.0 layout                                  7.0 layout
//   business.yaml (actors, systems, BUCs)       index.yaml
//   business/business-model.yaml + <E>.yaml     business/actors.yaml, business-use-cases.yaml,
//   applications.yaml + applications/<app>.yaml   systems.yaml, entities.yaml
//   deployment.yaml (unchanged)                 applications/applications.yaml
//                                               applications/<app-id>-<name>/{use-cases,pages,domain}.yaml
//
// Ids are allocated per kind prefix in file order (deterministic). Every name-based
// reference is rewritten to an id; unresolvable references are dropped and listed in the
// report. Aggregate wrapper blocks collapse into their root entity (members nest under
// it in index.yaml). Rules get ids and stay inline in their owner.

import { Document, YAMLMap, isMap, isSeq, YAMLSeq } from 'yaml'
import yaml from 'js-yaml'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { registerMigration, type Migration, type MigrationContext, type MigrationResult, type FileEdit } from './index.ts'
import { NODE_KINDS } from '../vocabulary.ts'
import { formatId } from '../index-file.ts'
import { slug } from '../graph.ts'

type Obj = Record<string, unknown>

// Bilingual key fallback for 6.x data.
const ALIASES: Record<string, string[]> = {
  name: ['name', '名称'], summary: ['summary', '摘要'], use_cases: ['use_cases', '用例'], pages: ['pages', '页面'],
  package: ['package', '分组'], actor: ['actor', '执行者'], entry: ['entry', '入口'], system_use_cases: ['system_use_cases', '系统用例'],
  fields: ['fields', '字段'], rules: ['rules', '规则'], associations: ['associations', '关联'],
  related_use_cases: ['related_use_cases', '关联用例'], related_entities: ['related_entities', '关联实体'],
  business_use_cases: ['business_use_cases', '业务用例'], systems: ['systems', '系统'], applications: ['applications', '子系统'],
  external_parties: ['external_parties', '外部参与方'], participants: ['participants', '参与者'], business_workers: ['business_workers', '业务工人'],
  docs: ['docs', '扩展文档'], notes: ['notes', '备注'], state_machine: ['state_machine', '状态机'], type: ['type', '类型'],
  content: ['content', '内容'], relation: ['relation', '关系'], application: ['application', '子系统'],
  stakeholder_interests: ['stakeholder_interests', '相关方利益'], table_name: ['table_name', '表名'],
}
function get(o: Obj | undefined, key: string): unknown {
  if (!o) return undefined
  for (const k of ALIASES[key] ?? [key]) if (o[k] !== undefined) return o[k]
  return undefined
}
function str(o: Obj | undefined, key: string): string { const v = get(o, key); return v == null ? '' : String(v) }
function list(o: Obj | undefined, key: string): Obj[] { const v = get(o, key); return Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === 'object') : [] }
function strList(o: Obj | undefined, key: string): string[] { const v = get(o, key); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] }

// Copy remaining keys (attrs we don't explicitly handle) from an old object, normalizing aliases.
const CANON: Record<string, string> = {}
for (const [canon, alts] of Object.entries(ALIASES)) for (const a of alts) CANON[a] = canon
function rest(o: Obj, skip: string[]): Obj {
  const out: Obj = {}
  const skipSet = new Set(skip.flatMap(k => ALIASES[k] ?? [k]))
  for (const [k, v] of Object.entries(o)) {
    if (skipSet.has(k) || k.startsWith('_')) continue
    out[CANON[k] ?? k] = v
  }
  return out
}

interface Entry { id: string; name: string; data: Obj; children: Entry[]; package?: string; kind(): string }

// Normalize a field list to the schema's compact form `- name: "Type, desc"`.
// Accepts the structured 6.x variant `- {name, type, desc}`; leaves strings untouched (validate flags them).
function normalizeFieldList(v: unknown): unknown {
  // Map form `{ code: null, user: "String, who" }` → list of single-key maps
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Obj).map(([k, val]) => ({ [k]: val == null ? '' : String(val) }))
  }
  // String form `'{ a, b }'` / `'a / b / c'` → names with empty specs
  if (typeof v === 'string') {
    const inner = v.trim().replace(/^\{|\}$/g, '')
    const names = inner.split(/\s*[,/]\s*/).map(x => x.trim()).filter(Boolean)
    return names.length ? names.map(n => ({ [n]: '' })) : []
  }
  if (!Array.isArray(v)) return v
  return v.flatMap(item => {
    if (typeof item === 'string') {
      const m = item.match(/^([A-Za-z_][\w.]*)\s*:\s*(.*)$/)
      if (m) return [{ [m[1]]: m[2] }]
      if (item.includes(' / ')) return item.split(' / ').map(x => x.trim()).filter(Boolean).map(n => ({ [n]: '' }))
      return [{ [item]: '' }]
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const o = item as Obj
    const keys = Object.keys(o)
    if (keys.length === 1) return [item]
    if (typeof o.name === 'string') {
      const type = o.type == null ? '' : String(o.type)
      const desc = o.desc ?? o.description
      const spec = [type, desc == null ? '' : String(desc)].filter(Boolean).join(', ')
      return [{ [o.name]: spec }]
    }
    return [item]
  })
}
const kindOf = (id: string): string => { const p = id.slice(0, id.lastIndexOf('-')); for (const s of Object.values(NODE_KINDS)) if (s.idPrefix === p) return s.kind; throw new Error(`bad id ${id}`) }

class Ids {
  counters: Record<string, number> = {}
  next(kind: string): string {
    const p = NODE_KINDS[kind].idPrefix
    this.counters[p] = (this.counters[p] ?? 0) + 1
    return formatId(p, this.counters[p])
  }
}

const migration: Migration = {
  from: '6.0',
  to: '7.0',
  description: 'index.yaml + flat detail files; opaque ids; aggregates collapse into root entities; rules get ids',
  async run(ctx: MigrationContext): Promise<MigrationResult> {
    const files = new Map(ctx.files.map(f => [f.relativePath, f]))
    const business = files.get('business.yaml')?.data ?? {}
    const bmOverview = files.get('business/business-model.yaml')?.data ?? {}
    const appsOverview = files.get('applications.yaml')?.data ?? {}
    const ids = new Ids()
    const report: string[] = ['# Migration report: 6.0 → 7.0', '', '## Name → id', '', '| kind | old handle | id |', '|---|---|---|']
    const dropped: string[] = []
    const mapLine = (kind: string, handle: string, id: string) => report.push(`| ${kind} | ${handle} | ${id} |`)

    // ---------- Pass 1: allocate ids, build entries ----------
    const biz: { organization: Entry[]; 'business-worker': Entry[]; 'external-party': Entry[]; 'business-use-case': Entry[]; system: Entry[]; entity: Entry[] } =
      { organization: [], 'business-worker': [], 'external-party': [], 'business-use-case': [], system: [], entity: [] }
    const apps: Entry[] = []

    const actorByName = new Map<string, string>()           // bw / ep / participant names → id
    const sucByName = new Map<string, string[]>()           // bare suc name → ids
    const sucByQualified = new Map<string, string>()        // "sys.uc" → id
    const bucByName = new Map<string, string>()
    const bizEntityByName = new Map<string, string>()
    const bizEntityEntry = new Map<string, Entry>()
    interface AppScope {
      id: string; name: string; entry: Entry
      auc: Map<string, string>; page: Map<string, string>; entity: Map<string, string>; vo: Map<string, string>
      role: Map<string, string>; evt: Map<string, string>; svc: Map<string, string>; enum: Map<string, string>
      entities: Map<string, Entry>
      aggregateRoot: Map<string, string>   // 6.x aggregate wrapper name → root entity name
    }
    const appScopes = new Map<string, AppScope>()
    const pending: Array<() => void> = []   // pass-2 reference resolution closures

    const mkEntry = (kind: string, name: string, data: Obj, handle = name): Entry => {
      const id = ids.next(kind)
      mapLine(kind, handle, id)
      return { id, name, data, children: [], kind: () => kindOf(id) }
    }

    // organizations
    for (const org of list(business, 'organizations')) {
      const e = mkEntry('organization', str(org, 'name'), rest(org, ['name', 'provided_use_cases']))
      biz.organization.push(e)
      const provided = strList(org, 'provided_use_cases')
      pending.push(() => { const ids2 = provided.map(n => bucByName.get(n)).filter((x): x is string => !!x); if (ids2.length) e.data.provides = ids2; for (const n of provided) if (!bucByName.get(n)) dropped.push(`organization ${e.name}: provides "${n}" (business-use-case not found)`) })
    }
    if (biz.organization.length === 0 && typeof business.organization === 'string') {
      biz.organization.push(mkEntry('organization', business.organization, {}))
    }
    // workers
    for (const w of (get(business, 'business_workers') as unknown[] | undefined) ?? []) {
      const o: Obj = typeof w === 'string' ? { name: w } : (w as Obj)
      const e = mkEntry('business-worker', str(o, 'name'), rest(o, ['name']))
      biz['business-worker'].push(e); actorByName.set(e.name, e.id)
    }
    // external parties + participants
    for (const ep of list(business, 'external_parties')) {
      const e = mkEntry('external-party', str(ep, 'name'), rest(ep, ['name', 'participants', 'use_cases']))
      biz['external-party'].push(e); actorByName.set(e.name, e.id)
      for (const p of list(ep, 'participants')) {
        const pe = mkEntry('participant', str(p, 'name'), rest(p, ['name']), `${e.name}.${str(p, 'name')}`)
        e.children.push(pe)
        if (!actorByName.has(pe.name)) actorByName.set(pe.name, pe.id)
        actorByName.set(`${e.name}.${pe.name}`, pe.id)
      }
    }
    // systems + sucs
    for (const s of list(business, 'systems')) {
      const e = mkEntry('system', str(s, 'name'), rest(s, ['name', 'use_cases']))
      biz.system.push(e)
      for (const uc of list(s, 'use_cases')) {
        const ue = mkEntry('system-use-case', str(uc, 'name'), rest(uc, ['name', 'package', 'actor', 'entry']), `${e.name}.${str(uc, 'name')}`)
        ue.package = str(uc, 'package') || undefined
        e.children.push(ue)
        sucByName.set(ue.name, [...(sucByName.get(ue.name) ?? []), ue.id])
        sucByQualified.set(`${e.name}.${ue.name}`, ue.id)
        const actor = str(uc, 'actor'); const entry = str(uc, 'entry')
        pending.push(() => {
          if (actor) { const a = actorByName.get(actor) ?? appScopes.get(actor)?.id; if (a) ue.data.actor = a; else dropped.push(`system-use-case ${ue.name}: actor "${actor}" not found`) }
          if (entry) { const t = resolveAuc(entry, undefined); if (t) ue.data.entry = t; else dropped.push(`system-use-case ${ue.name}: entry "${entry}" not found`) }
        })
      }
    }
    // business use cases
    for (const b of list(business, 'business_use_cases')) {
      const e = mkEntry('business-use-case', str(b, 'name'), rest(b, ['name', 'actor', 'system_use_cases']))
      biz['business-use-case'].push(e); bucByName.set(e.name, e.id)
      const actor = str(b, 'actor'); const sucs = strList(b, 'system_use_cases')
      pending.push(() => {
        if (actor) { const a = actorByName.get(actor); if (a) e.data.actor = a; else dropped.push(`business-use-case ${e.name}: actor "${actor}" not found`) }
        const uses: string[] = []
        for (const ref of sucs) {
          const id = sucByQualified.get(ref) ?? (sucByName.get(ref)?.length === 1 ? sucByName.get(ref)![0] : undefined)
          if (id) uses.push(id); else dropped.push(`business-use-case ${e.name}: uses "${ref}" (system-use-case not found or ambiguous)`)
        }
        if (uses.length) e.data.uses = uses
      })
    }
    // business entities (overview order; detail files merged)
    for (const ov of list(bmOverview, 'entities')) {
      const name = str(ov, 'name')
      const detailRel = str(ov, 'detail')
      const detailFile = detailRel ? files.get(join('business', detailRel.replace(/^\.\//, ''))) : undefined
      const detail: Obj = { ...rest(ov, ['name', 'detail']), ...(detailFile ? rest(detailFile.data, ['name']) : {}) }
      const e = mkEntry('entity', name, {})
      e.data = prepareEntity(detail, e, undefined)
      biz.entity.push(e); bizEntityByName.set(name, e.id); bizEntityEntry.set(name, e)
    }
    // applications
    for (const ov of list(appsOverview, 'applications')) {
      const name = str(ov, 'name')
      const detailRel = str(ov, 'detail') || `./applications/${name}.yaml`
      const detailFile = files.get(detailRel.replace(/^\.\//, ''))
      const d: Obj = detailFile?.data ?? {}
      const e = mkEntry('application', name, { ...rest(ov, ['name', 'detail']), ...rest(d, ['name', 'use_cases', 'pages', 'domain_model']) })
      apps.push(e)
      const scope: AppScope = { id: e.id, name, entry: e, auc: new Map(), page: new Map(), entity: new Map(), vo: new Map(), role: new Map(), evt: new Map(), svc: new Map(), enum: new Map(), entities: new Map(), aggregateRoot: new Map() }
      appScopes.set(name, scope)
      // use cases
      for (const uc of list(d, 'use_cases')) {
        const ue = mkEntry('app-use-case', str(uc, 'name'), rest(uc, ['name', 'package', 'actor', 'associations', 'rules']), `${name}.${str(uc, 'name')}`)
        ue.package = str(uc, 'package') || undefined
        e.children.push(ue); scope.auc.set(ue.name, ue.id)
        const actor = str(uc, 'actor'); const assoc = list(uc, 'associations'); const rules = get(uc, 'rules')
        pending.push(() => {
          if (actor) { const a = actorByName.get(actor) ?? appScopes.get(actor)?.id; if (a) ue.data.actor = a; else dropped.push(`app-use-case ${name}.${ue.name}: actor "${actor}" not found`) }
          const inc: string[] = [], ext: string[] = []
          for (const a of assoc) {
            const target = resolveAuc(str(a, 'name'), str(a, 'application') || name)
            if (!target) { dropped.push(`app-use-case ${name}.${ue.name}: association to "${str(a, 'name')}" not found`); continue }
            if (str(a, 'relation') === 'Extend') ext.push(target); else inc.push(target)
          }
          if (inc.length) ue.data.includes = inc
          if (ext.length) ue.data.extends = ext
          ue.data.rules = convertRules(rules, `${name}.${ue.name}`, name)
          if (!(ue.data.rules as unknown[]).length) delete ue.data.rules
        })
      }
      // pages
      for (const pg of list(d, 'pages')) {
        const pe = mkEntry('page', str(pg, 'name'), rest(pg, ['name', 'related_use_cases']), `${name}/${str(pg, 'name')}`)
        e.children.push(pe); scope.page.set(pe.name, pe.id)
        const refs = strList(pg, 'related_use_cases')
        pending.push(() => { const r = refs.map(x => resolveAuc(x, name)).filter((x): x is string => !!x); if (r.length) pe.data.related_use_cases = r; for (const x of refs) if (!resolveAuc(x, name)) dropped.push(`page ${name}/${pe.name}: related use case "${x}" not found`) })
      }
      // domain model
      const dm = (get(d, 'domain_model') as Obj | undefined) ?? {}
      for (const r of list(dm, 'roles')) { const re = mkEntry('role', str(r, 'name'), rest(r, ['name', 'relationships']), `${name}.${str(r, 'name')}`); e.children.push(re); scope.role.set(re.name, re.id); const rels = list(r, 'relationships'); if (rels.length) pending.push(() => { const kept = convertRelationships(rels, re, scope, `role ${name}.${re.name}`); if (kept.length) re.data.relationships = kept }) }
      for (const en of list(dm, 'entities')) { const ee = mkEntry('entity', str(en, 'name'), {}, `${name}.${str(en, 'name')}`); ee.data = prepareEntity(en, ee, scope); e.children.push(ee); scope.entity.set(ee.name, ee.id); scope.entities.set(ee.name, ee) }
      for (const ag of list(dm, 'aggregates')) {
        const rootName = str(ag, 'root') || str(ag, 'name')
        const members = list(ag, 'entities')
        const rootDef = members.find(m => str(m, 'name') === rootName) ?? { name: rootName }
        const re = mkEntry('entity', rootName, {}, `${name}.${rootName} (aggregate ${str(ag, 'name')})`)
        if (str(ag, 'name') && str(ag, 'name') !== rootName) report.push(`| aggregate wrapper | ${name}.${str(ag, 'name')} → root ${rootName} | ${re.id} |`)
        re.data = prepareEntity({ ...rootDef, invariants: get(ag, 'invariants'), notes: [str(rootDef, 'notes'), str(ag, 'notes')].filter(Boolean).join('\n') || undefined }, re, scope)
        const agRels = list(ag, 'relationships'); if (agRels.length) pending.push(() => { const kept = convertRelationships(agRels, re, scope, `aggregate ${name}.${rootName}`); re.data.relationships = [...((re.data.relationships as unknown[]) ?? []), ...kept] })
        e.children.push(re); scope.entity.set(rootName, re.id); scope.entities.set(rootName, re)
        if (str(ag, 'name')) scope.aggregateRoot.set(str(ag, 'name'), rootName)
        for (const m of members) {
          if (str(m, 'name') === rootName) continue
          const me = mkEntry('entity', str(m, 'name'), {}, `${name}.${str(m, 'name')} (in ${rootName})`)
          me.data = prepareEntity(m, me, scope)
          re.children.push(me); scope.entity.set(me.name, me.id); scope.entities.set(me.name, me)
        }
        for (const vo of list(ag, 'value_objects')) {
          const ve = mkEntry('value-object', str(vo, 'name'), rest(vo, ['name', 'relationships']), `${name}.${str(vo, 'name')} (in ${rootName})`)
          if (ve.data.fields !== undefined) ve.data.fields = normalizeFieldList(ve.data.fields)
          re.children.push(ve); scope.vo.set(ve.name, ve.id)
        }
      }
      for (const vo of list(dm, 'value_objects')) { const ve = mkEntry('value-object', str(vo, 'name'), rest(vo, ['name', 'relationships']), `${name}.${str(vo, 'name')}`); if (ve.data.fields !== undefined) ve.data.fields = normalizeFieldList(ve.data.fields); e.children.push(ve); scope.vo.set(ve.name, ve.id) }
      for (const en of list(dm, 'enums')) { const ee = mkEntry('enum', str(en, 'name'), rest(en, ['name']), `${name}.${str(en, 'name')}`); e.children.push(ee); scope.enum.set(ee.name, ee.id) }
      for (const s of list(dm, 'domain_services')) { const se = mkEntry('domain-service', str(s, 'name'), rest(s, ['name', 'relationships', 'handles']), `${name}.${str(s, 'name')}`); e.children.push(se); scope.svc.set(se.name, se.id); const handles = strList(s, 'handles'); pending.push(() => { const h = handles.map(x => scope.evt.get(x)).filter((x): x is string => !!x); if (h.length) se.data.handles = h }) }
      for (const ev of list(dm, 'domain_events')) { const ee = mkEntry('domain-event', str(ev, 'name'), rest(ev, ['name', 'relationships']), `${name}.${str(ev, 'name')}`); if (ee.data.payload !== undefined) ee.data.payload = normalizeFieldList(ee.data.payload); e.children.push(ee); scope.evt.set(ee.name, ee.id) }
      // repositories → root entity attr; unassigned ones are kept on the application
      for (const repo of list(dm, 'repositories')) {
        const target = list(repo, 'relationships').find(r => str(r, 'kind') === 'composition')
        const tname0 = target ? str(target, 'target') : ''
        const tname = scope.aggregateRoot.get(tname0) ?? (scope.entities.has(tname0) ? tname0 : tname0.replace(/Aggregate$/, ''))
        const ent = scope.entities.get(tname)
        const repoData: Obj = { name: str(repo, 'name'), ...(get(repo, 'operations') ? { operations: get(repo, 'operations') } : {}) }
        if (ent) ent.data.repository = repoData
        else {
          e.data.repositories = [...((e.data.repositories as Obj[]) ?? []), repoData]
          report.push(`| ⚠ repository kept on application | ${name}.${str(repo, 'name')} (managed entity "${tname0 || '?'}" not found) | ${e.id} |`)
        }
      }
    }

    // ---------- helpers needing maps ----------
    function resolveAuc(ref: string, appName: string | undefined): string | undefined {
      if (ref.includes('.')) {
        const [a, ...r] = ref.split('.'); const s = appScopes.get(a); const id = s?.auc.get(r.join('.'))
        if (id) return id
      }
      if (appName) return appScopes.get(appName)?.auc.get(ref)
      // bare, no app context: unique across apps?
      const hits = [...appScopes.values()].map(s => s.auc.get(ref)).filter((x): x is string => !!x)
      return hits.length === 1 ? hits[0] : undefined
    }
    function resolveEntityRef(ref: string, scope: AppScope | undefined): string | undefined {
      if (scope) {
        // direct name, 6.x aggregate wrapper name, or the "<Root>Aggregate" naming convention
        const id = scope.entity.get(ref) ?? scope.entity.get(scope.aggregateRoot.get(ref) ?? '') ?? scope.entity.get(ref.replace(/Aggregate$/, ''))
        if (id) return id
      }
      return bizEntityByName.get(ref)
    }
    function convertRules(raw: unknown, owner: string, appName: string | undefined): Obj[] {
      if (!Array.isArray(raw)) return []
      const out: Obj[] = []
      for (const r of raw) {
        const o: Obj = typeof r === 'string' ? { content: r } : (r as Obj)
        const id = ids.next('rule'); mapLine('rule', `${owner} #${out.length + 1}`, id)
        const e: Obj = { id, ...rest(o, ['related_entities', 'related_use_cases']) }
        const scope = appName ? appScopes.get(appName) : undefined
        const ents = strList(o, 'related_entities').map(x => { const id2 = resolveEntityRef(x, scope); if (!id2) dropped.push(`rule ${id} (${owner}): related entity "${x}" not found`); return id2 }).filter((x): x is string => !!x)
        const ucs = strList(o, 'related_use_cases').map(x => { const id2 = resolveAuc(x, appName); if (!id2) dropped.push(`rule ${id} (${owner}): related use case "${x}" not found`); return id2 }).filter((x): x is string => !!x)
        if (ents.length) e.related_entities = ents
        if (ucs.length) e.related_use_cases = ucs
        out.push(e)
      }
      return out
    }
    function convertRelationships(rels: Obj[], owner: Entry, scope: AppScope | undefined, label: string): Obj[] {
      const out: Obj[] = []
      for (const r of rels) {
        const kind = str(r, 'kind'); const target = str(r, 'target'); const tk = str(r, 'target_kind')
        let id: string | undefined; let newKind = kind
        if (tk === 'business-entity') { id = bizEntityByName.get(target); if (kind === 'implements' && scope) newKind = 'realizes' }
        else if (tk === 'role') id = scope?.role.get(target)
        else if (tk === 'entity' || tk === 'aggregate' || tk === '') id = resolveEntityRef(target, scope)
        if (!id || !['composition', 'associates', 'depends-on', 'implements', 'realizes'].includes(newKind)) {
          dropped.push(`${label}: relationship ${kind} → ${tk || '?'} "${target}" dropped (${!id ? 'target not found' : 'unsupported kind'})`)
          continue
        }
        const attrs = rest(r, ['kind', 'target', 'target_kind'])
        out.push({ kind: newKind, target: id, ...attrs })
      }
      void owner
      return out
    }
    function prepareEntity(src: Obj, e: Entry, scope: AppScope | undefined): Obj {
      const data: Obj = rest(src, ['name', 'relationships', 'aggregates', 'emits', 'handles', 'rules', 'detail'])
      for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]
      if (data.fields !== undefined) data.fields = normalizeFieldList(data.fields)
      const rels = list(src, 'relationships'); const emits = strList(src, 'emits'); const handles = strList(src, 'handles'); const rules = get(src, 'rules')
      const label = `entity ${scope ? scope.name + '.' : ''}${e.name}`
      pending.push(() => {
        const kept = convertRelationships(rels, e, scope, label)
        if (kept.length) data.relationships = [...((data.relationships as Obj[]) ?? []), ...kept]
        const em = emits.map(x => scope?.evt.get(x)).filter((x): x is string => !!x); if (em.length) data.emits = em
        const ha = handles.map(x => scope?.evt.get(x)).filter((x): x is string => !!x); if (ha.length) data.handles = ha
        const rs = convertRules(rules, label, scope?.name); if (rs.length) data.rules = rs
        if (typeof data.fields === 'string') report.push(`| ⚠ fields as text | ${label} | ${e.id} (fix: list of \`- name: "Type, desc"\`) |`)
      })
      return data
    }

    // ---------- Pass 2 ----------
    for (const fn of pending) fn()

    // ---------- Emit files ----------
    const edits: FileEdit[] = []
    const emit = (rel: string, text: string) => edits.push({ relativePath: rel, absolutePath: join(ctx.modelRoot, rel), newText: text })
    const dump = (o: unknown) => yaml.dump(o, { lineWidth: 120, noRefs: true, sortKeys: false, quotingType: '"' })
    const entryObj = (e: Entry): Obj => ({ id: e.id, name: e.name, ...e.data })

    // index.yaml via yaml@2 for flow-style leaves
    const indexDoc = new Document({})
    const idxRoot = indexDoc.contents as YAMLMap
    idxRoot.set('schema_version', '7.0')
    idxRoot.set('sequences', ids.counters)
    const toIndexList = (entries: Entry[]): unknown[] => {
      // group by package (single level from 6.0), preserving first-seen order
      const groups = new Map<string | undefined, Entry[]>()
      for (const e of entries) groups.set(e.package, [...(groups.get(e.package) ?? []), e])
      const out: unknown[] = []
      for (const [pkg, es] of groups) {
        const items = es.map(toIndexEntry)
        if (pkg === undefined) out.push(...items)
        else out.push({ package: pkg, [es[0].kind()]: items })
      }
      return out
    }
    const toIndexEntry = (e: Entry): Obj => {
      const o: Obj = { id: e.id, name: e.name }
      const byKind = new Map<string, Entry[]>()
      for (const c of e.children) byKind.set(c.kind(), [...(byKind.get(c.kind()) ?? []), c])
      for (const [k, cs] of byKind) o[k] = toIndexList(cs)
      return o
    }
    const bizMap: Obj = {}
    for (const [k, es] of Object.entries(biz)) if (es.length) bizMap[k] = toIndexList(es)
    idxRoot.set('business', indexDoc.createNode(bizMap))
    idxRoot.set('applications', indexDoc.createNode({ application: toIndexList(apps) }))
    // flow style for leaf entries {id, name}
    const flowify = (n: unknown) => {
      if (isMap(n)) {
        const m = n as YAMLMap
        if (m.items.length === 2 && m.has('id') && m.has('name')) m.flow = true
        for (const p of m.items) flowify(p.value)
      } else if (isSeq(n)) for (const it of (n as YAMLSeq).items) flowify(it)
    }
    flowify(idxRoot.get('business', true)); flowify(idxRoot.get('applications', true))
    emit('index.yaml', indexDoc.toString({ lineWidth: 120, indent: 2 }))

    // business details
    const flat = (entries: Entry[], kind: string): Entry[] => { const out: Entry[] = []; const walk = (e: Entry) => { if (e.kind() === kind) out.push(e); e.children.forEach(walk) }; entries.forEach(walk); return out }
    const section = (kind: string, entries: Entry[]): Obj => entries.length ? { [kind]: entries.map(entryObj) } : {}
    const allBiz = [...biz.organization, ...biz['business-worker'], ...biz['external-party'], ...biz['business-use-case'], ...biz.system, ...biz.entity]
    emit('business/actors.yaml', dump({ ...section('organization', biz.organization), ...section('business-worker', biz['business-worker']), ...section('external-party', biz['external-party']), ...section('participant', flat(allBiz, 'participant')) }))
    emit('business/business-use-cases.yaml', dump(section('business-use-case', biz['business-use-case'])))
    emit('business/systems.yaml', dump({ ...section('system', biz.system), ...section('system-use-case', flat(biz.system, 'system-use-case')) }))
    emit('business/entities.yaml', dump(section('entity', biz.entity)))
    // applications
    const appsFile: Obj = { ...section('application', apps) }
    const topology = get(appsOverview, 'application_topology')
    if (Array.isArray(topology) && topology.length) appsFile.topology = topology
    emit('applications/applications.yaml', dump(appsFile))
    for (const app of apps) {
      const dir = `applications/${app.id}-${slug(app.name)}`
      const kids = (k: string) => flat(app.children, k)
      const uc = section('app-use-case', kids('app-use-case')); if (Object.keys(uc).length) emit(`${dir}/use-cases.yaml`, dump(uc))
      const pg = section('page', kids('page')); if (Object.keys(pg).length) emit(`${dir}/pages.yaml`, dump(pg))
      const domain: Obj = { ...section('entity', kids('entity')), ...section('value-object', kids('value-object')), ...section('enum', kids('enum')), ...section('role', kids('role')), ...section('domain-service', kids('domain-service')), ...section('domain-event', kids('domain-event')) }
      if (Object.keys(domain).length) emit(`${dir}/domain.yaml`, dump(domain))
    }
    // delete 6.0 files
    for (const f of ctx.files) {
      if (f.relativePath === 'deployment.yaml') continue
      if (f.relativePath === 'business.yaml' || f.relativePath === 'applications.yaml' || f.relativePath.startsWith('business/') || f.relativePath.startsWith('applications/')) {
        if (!edits.some(e => e.relativePath === f.relativePath)) edits.push({ relativePath: f.relativePath, absolutePath: f.absolutePath, delete: true })
      }
    }
    // workbenches (kg-web): rewrite node ids kind:handle → kind:id
    try {
      const wbPath = join(ctx.modelRoot, '.dcddp-workbenches.json')
      const wb = JSON.parse(await readFile(wbPath, 'utf-8')) as { workbenches?: Array<{ nodeIds?: string[]; rootNodeId?: string }> }
      const handleMap = new Map<string, string>()
      for (const line of report) { const m = line.match(/^\| ([a-z-]+) \| (.+?) \| ([a-z]+-\d+)/); if (m && m[1] in NODE_KINDS) handleMap.set(`${m[1]}:${m[2].replace(/ \(.*\)$/, '')}`, `${m[1]}:${m[3]}`) }
      let changed = false
      for (const w of wb.workbenches ?? []) {
        if (w.nodeIds) { const next = w.nodeIds.map(x => handleMap.get(x) ?? x); if (next.some((x, i) => x !== w.nodeIds![i])) { w.nodeIds = next; changed = true } }
        if (w.rootNodeId && handleMap.has(w.rootNodeId)) { w.rootNodeId = handleMap.get(w.rootNodeId); changed = true }
      }
      if (changed) emit('.dcddp-workbenches.json', JSON.stringify(wb, null, 2) + '\n')
    } catch { /* no workbench file */ }

    report.push('', '## Dropped references', '')
    if (dropped.length) for (const d of dropped) report.push(`- ${d}`); else report.push('_(none)_')
    report.push('', `Files written: ${edits.filter(e => !e.delete).length}; removed: ${edits.filter(e => e.delete).length}.`)
    return { edits, report: report.join('\n') + '\n' }
  },
}

registerMigration(migration)
export {}
