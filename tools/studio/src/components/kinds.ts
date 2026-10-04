// Display labels / icons per node kind (same glyphs as the sidebar).
export const KIND_LABELS: Record<string, string> = {
  organization: '组织', 'business-worker': '业务工人', 'external-party': '外部参与方', participant: '参与者',
  'business-use-case': '业务用例', system: '系统', 'system-use-case': '系统用例',
  application: '应用', 'app-use-case': '应用用例', page: '页面', resource: '资源', metric: '指标',
  entity: '实体', 'value-object': '值对象', enum: '枚举', role: '角色', 'domain-service': '领域服务', 'domain-event': '领域事件', rule: '规则',
}
export const KIND_ICONS: Record<string, string> = {
  organization: '🏢', 'business-worker': '🧑‍💼', 'external-party': '👥', participant: '👤',
  'business-use-case': '🎯', system: '⚙️', 'system-use-case': '◎',
  application: '▸', 'app-use-case': '◦', page: '📄', resource: '🔌', metric: '📈',
  entity: '▪', 'value-object': '◇', enum: '≡', role: '🎭', 'domain-service': '⚙', 'domain-event': '⚡', rule: '§',
}
