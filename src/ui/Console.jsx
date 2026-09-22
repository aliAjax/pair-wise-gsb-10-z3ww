import React, { useMemo, useState } from 'react';
import { BANDWIDTHS, diffTopology, edgesOf, portsFree, usedPortCount } from '../model/topology';
import { RULES } from '../rules/validator';

const TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端' };
const fmt = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false });

// 底部校验台：节点、端口、网段、规则、版本五类清单集中展示（只读视图，编辑在右侧属性台）
export default function Console({ doc, version, topo, issues, tab, onTab, onSelectNode, onSwitchVersion, onRenameVersion, onArchive, onFork }) {
  const errCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warn').length;
  const tabs = [
    ['nodes', `节点 ${topo.nodes.length}`],
    ['ports', `端口 ${topo.edges.length}`],
    ['segments', '网段'],
    ['rules', `规则 ${RULES.length}`],
    ['versions', `版本 ${doc.versions.length}`],
  ];

  return (
    <div className="console">
      <div className="console-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>
            {label}
            {id === 'rules' && errCount > 0 && <i className="tab-badge bad">{errCount}</i>}
            {id === 'rules' && errCount === 0 && <i className="tab-badge ok">✓</i>}
          </button>
        ))}
        <span className="console-status">
          {errCount ? <b className="st-bad">{errCount} 条阻断 · 提交将整次拒绝</b> : <b className="st-ok">规则全部通过</b>}
          {warnCount > 0 && <i> · {warnCount} 条提示</i>}
        </span>
      </div>
      <div className="console-body">
        {tab === 'nodes' && <NodesTab topo={topo} issues={issues} onSelectNode={onSelectNode} />}
        {tab === 'ports' && <PortsTab topo={topo} onSelectNode={onSelectNode} />}
        {tab === 'segments' && <SegmentsTab topo={topo} issues={issues} onSelectNode={onSelectNode} />}
        {tab === 'rules' && <RulesTab issues={issues} />}
        {tab === 'versions' && (
          <VersionsTab
            doc={doc} version={version} onSwitchVersion={onSwitchVersion}
            onRenameVersion={onRenameVersion} onArchive={onArchive} onFork={onFork}
          />
        )}
      </div>
    </div>
  );
}

function RowError({ ids, issues }) {
  const hits = issues.filter((i) => i.level === 'error' && ids.some((x) => i.nodeIds.includes(x) || i.edgeIds.includes(x)));
  if (!hits.length) return <b className="pass">通过</b>;
  return (
    <span className="cell-err">
      {hits.map((h, i) => <em key={i}>{h.ruleId}</em>)}
    </span>
  );
}

function NodesTab({ topo, issues, onSelectNode }) {
  return (
    <table>
      <thead><tr><th>ID</th><th>名称</th><th>类型</th><th>IP 地址</th><th>网段</th><th>端口余量</th><th>生成树</th><th>校验</th></tr></thead>
      <tbody>
        {topo.nodes.map((n) => (
          <tr key={n.id} onClick={() => onSelectNode(n.id)}>
            <td className="mono">{n.id}</td>
            <td>{n.name}</td>
            <td>{TYPE_LABEL[n.type]}</td>
            <td className="mono">{n.ip}</td>
            <td className="mono">{n.segment || '—'}</td>
            <td className={portsFree(n, topo) <= 0 ? 'num-bad mono' : 'num-ok mono'}>{usedPortCount(n, topo)}/{n.ports}（余 {portsFree(n, topo)}）</td>
            <td>{n.type === 'switch' ? (n.stp ? '已启用' : '未启用') : '—'}</td>
            <td><RowError ids={[n.id]} issues={issues} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PortsTab({ topo, onSelectNode }) {
  return (
    <table>
      <thead><tr><th>连接</th><th>本端节点</th><th>占用端口</th><th>对端节点</th><th>占用端口</th><th>带宽</th></tr></thead>
      <tbody>
        {topo.edges.map((e) => {
          const a = topo.nodes.find((n) => n.id === e.from);
          const b = topo.nodes.find((n) => n.id === e.to);
          return (
            <tr key={e.id} onClick={() => onSelectNode(e.from)}>
              <td className="mono">{e.id}</td>
              <td>{a?.name || e.from}</td>
              <td className="mono">{e.fromPort || <i>未填</i>}</td>
              <td>{b?.name || e.to}</td>
              <td className="mono">{e.toPort || <i>未填</i>}</td>
              <td className="mono">{e.bandwidth || <i>未写</i>}</td>
            </tr>
          );
        })}
        {topo.edges.length === 0 && <tr><td colSpan="6" className="empty">尚无连接</td></tr>}
      </tbody>
    </table>
  );
}

function SegmentsTab({ topo, issues, onSelectNode }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const n of topo.nodes) {
      const k = n.segment || '（未登记网段）';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(n);
    }
    return [...m.entries()];
  }, [topo]);

  // 跨网段直连（无路由器）清单
  const cross = [];
  for (const e of topo.edges) {
    const a = topo.nodes.find((n) => n.id === e.from);
    const b = topo.nodes.find((n) => n.id === e.to);
    if (a && b && a.segment && b.segment && a.segment !== b.segment && a.type !== 'router' && b.type !== 'router') {
      cross.push(e);
    }
  }

  return (
    <div className="seg-grid">
      <div>
        <h4>网段登记</h4>
        {groups.map(([seg, ns]) => {
          const segErr = issues.some((i) => i.level === 'error' && (i.ruleId === 'R-SEG-CIDR' || i.ruleId === 'R-SEG-MEMBER') && ns.some((n) => i.nodeIds.includes(n.id)));
          return (
            <div className={'seg-card' + (segErr ? ' bad' : '')} key={seg}>
              <div className="seg-head"><b className="mono">{seg}</b><span>{ns.length} 个节点</span></div>
              <ul>
                {ns.map((n) => (
                  <li key={n.id} onClick={() => onSelectNode(n.id)}>
                    <i className={'dot-type ' + n.type}></i>{n.name}<span className="mono">{n.ip}</span>
                    {n.type === 'router' && <em>跨网段网关</em>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div>
        <h4>网段隔离检查</h4>
        <div className="iso-box">
          {cross.length === 0
            ? <p className="st-ok">✓ 没有发现绕过路由器的跨网段直连</p>
            : cross.map((e) => {
                const a = topo.nodes.find((n) => n.id === e.from);
                const b = topo.nodes.find((n) => n.id === e.to);
                return (
                  <div key={e.id} className="iso-bad" onClick={() => onSelectNode(e.from)}>
                    <b>R-ISOLATION</b> {a.name}({a.segment}) ↔ {b.name}({b.segment}) 未经过路由器
                  </div>
                );
              })}
          <p className="rule-note">规则：同网段可自由互联；跨网段连接至少一端必须是路由器，否则整次拒绝。</p>
        </div>
      </div>
    </div>
  );
}

function RulesTab({ issues }) {
  return (
    <table>
      <thead><tr><th>编号</th><th>规则</th><th>说明</th><th>级别</th><th>当前状态</th></tr></thead>
      <tbody>
        {RULES.map((r) => {
          const hits = issues.filter((i) => i.ruleId === r.id);
          return (
            <tr key={r.id} className={hits.some((h) => h.level === 'error') ? 'row-bad' : ''}>
              <td className="mono">{r.id}</td>
              <td>{r.title}</td>
              <td className="rule-desc">{r.desc}</td>
              <td>{r.level === 'error' ? <span className="lv err">阻断</span> : <span className="lv warn">提示</span>}</td>
              <td>
                {hits.length === 0
                  ? <b className="pass">通过</b>
                  : <span className="msg-list">{hits.map((h, i) => <em key={i}>{h.message}</em>)}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VersionsTab({ doc, version, onSwitchVersion, onRenameVersion, onArchive, onFork }) {
  const [editing, setEditing] = useState(null);
  return (
    <div className="ver-wrap">
      {doc.versions.map((v) => {
        const parent = doc.versions.find((p) => p.id === v.parentId);
        const diff = parent ? diffTopology(parent.topology, v.topology) : [];
        const active = v.id === version.id;
        return (
          <div key={v.id} className={'ver-card' + (v.archived ? ' arch' : '') + (active ? ' cur' : '')}>
            <div className="ver-top">
              {editing === v.id ? (
                <input
                  autoFocus
                  defaultValue={v.label}
                  onBlur={(e) => { onRenameVersion(v.id, e.target.value || v.label); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onRenameVersion(v.id, e.target.value || v.label); setEditing(null); } }}
                />
              ) : (
                <b onDoubleClick={() => !v.archived && setEditing(v.id)}>{v.label}</b>
              )}
              <span className={'ver-badge ' + (v.archived ? 'archived' : 'work')}>{v.archived ? '已归档 · 冻结' : '工作版本'}</span>
              {active && <span className="ver-cur-tag">正在查看</span>}
            </div>
            <div className="ver-meta mono">
              创建 {fmt(v.createdAt)}{v.archivedAt ? ` · 冻结 ${fmt(v.archivedAt)}` : ''}{parent ? ` · 派生自 ${parent.label}` : ' · 初始版本'}
            </div>
            <p className="ver-reason">变更原因：{v.reason || '—'}</p>
            {diff.length > 0 && (
              <details className="ver-diff">
                <summary>相对上一版保留的旧值差异（{diff.length} 项）</summary>
                <table>
                  <tbody>
                    {diff.map((d, i) => (
                      <tr key={i}>
                        <td>{d.kind}</td><td>{d.target}</td><td>{d.field}</td>
                        <td className="mono old">{d.from}</td>
                        <td>→</td>
                        <td className="mono new">{d.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            <div className="ver-actions">
              {!active && <button onClick={() => onSwitchVersion(v.id)}>查看此版本</button>}
              {!v.archived && <button className="primary" onClick={() => onArchive(v.id)}>归档冻结</button>}
              {v.archived && <button onClick={() => onFork(v.id)}>改动 · 另建版本（保留旧值）</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
