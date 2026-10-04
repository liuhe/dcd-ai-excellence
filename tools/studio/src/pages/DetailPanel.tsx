import type { Route } from '../route'
import { useGraph } from '../graph/store'
import { Empty } from '../components/UI'
import { NodePage } from './nodes'
import { BusinessOverview, BusinessModelPage, ApplicationsOverview, OrgRelationsPage, OrgPage, WorkersPage, AppDomainPage } from './overviews'

export function DetailPanel({ route }: { route: Route }) {
  const { ix } = useGraph()
  if (route.type === 'node') return <NodePage id={route.id} />
  const id = route.id
  switch (id) {
    case 'business': case 'root': return <BusinessOverview />
    case 'business-ucs': return <BusinessOverview only="business-uc" />
    case 'business-model': case 'data-models': return <BusinessModelPage />
    case 'applications': return <ApplicationsOverview />
    case 'org-relations': return <OrgRelationsPage />
    case 'org': return ix.org() ? <OrgPage orgId={ix.org()!.id} /> : <Empty />
    case 'workers': return <WorkersPage />
  }
  if (id.startsWith('app-domain:')) return <AppDomainPage appId={id.slice('app-domain:'.length)} />
  // app-pages:* / app-ucs:* / pkg:* — 原设计里这些分组项没有专属页面
  return <Empty />
}
