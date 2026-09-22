import React, { useEffect, useState } from 'react';
import { BANDWIDTHS, edgesOf, portUsage, portsFree, usedPortCount } from '../model/topology';

const TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端设备' };

// 草稿输入：本地可临时输入非法中间态，失焦/回车才整单提交；被规则拒绝时恢复旧值
function DraftInput({ value, disabled, onChange, ...rest }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft !== null && draft !== String(value)) onChange(draft);
    setDraft(null);
  };
  return (
    <input
      {...rest}
      disabled={disabled}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function FrozenTip({ onFork }) {
  return (
    <div className="frozen-tip">
      <b>该版本已归档冻结</b>
      <p>属性只读。需要改动时请填写原因另建版本，旧值完整保留。</p>
      <button className="primary" onClick={onFork}>改动 · 另建版本</button>
    </div>
  );
}

function Hints({ ids, issues, edgeIds = [] }) {
  const hits = issues.filter((i) => i.nodeIds.some((x) => ids.includes(x)) || i.edgeIds.some((x) => edgeIds.includes(x)));
  if (!hits.length) return null;
  return (
    <div className="hints">
      {hits.map((h, i) => (
        <div key={i} className={'hint ' + h.level}><b>{h.ruleId}</b>{h.message}</div>
      ))}
    </div>
  );
}

// 右栏属性台：节点网段 / 端口容量 / 生成树，以及连接的端口占用与带宽
export default function Inspector({ version, topo, selection, issues, onPatchNode, onRemoveNode, onOpenConnect, onPatchEdge, onRemoveEdge, onFork }) {
  const frozen = version.archived;

  if (!selection || selection.startsWith('edge:')) {
    const eid = selection && selection.slice(5);
    const edge = topo.edges.find((e) => e.id === eid);
    if (!edge) return <aside className="inspector"><div className="section-title"><span>属性</span></div><p className="muted">选择节点或点击连线上的带宽标签查看占用详情</p></aside>;
    const a = topo.nodes.find((n) => n.id === edge.from);
    const b = topo.nodes.find((n) => n.id === edge.to);
    return (
      <aside className="inspector">
        <div className="section-title"><span>连接占用</span><small>两端各占 1 口</small></div>
        {frozen && <FrozenTip onFork={onFork} />}
        <div className="edge-detail">
          <div className="ep"><b>{a?.name || edge.from}</b><small>{a?.ip}</small></div>
          <div className="ep-link">⌁</div>
          <div className="ep"><b>{b?.name || edge.to}</b><small>{b?.ip}</small></div>
        </div>
        <Hints issues={issues} ids={[edge.from, edge.to]} edgeIds={[edge.id]} />
        <label>本端端口（{a?.name}）
          <DraftInput disabled={frozen} value={edge.fromPort} onChange={(v) => onPatchEdge(edge.id, { fromPort: v })} placeholder="如 G0/0"/>
        </label>
        <label>对端端口（{b?.name}）
          <DraftInput disabled={frozen} value={edge.toPort} onChange={(v) => onPatchEdge(edge.id, { toPort: v })} placeholder="如 eth0"/>
        </label>
        <label>链路带宽
          <select disabled={frozen} value={edge.bandwidth} onChange={(e) => onPatchEdge(edge.id, { bandwidth: e.target.value })}>
            <option value="">未写明</option>
            {BANDWIDTHS.map((bw) => <option key={bw} value={bw}>{bw}</option>)}
          </select>
        </label>
        <div className="inspector-actions">
          <button className="danger" disabled={frozen} onClick={() => { onRemoveEdge(edge.id); }}>断开并释放两端端口</button>
        </div>
      </aside>
    );
  }

  const n = topo.nodes.find((x) => x.id === selection);
  if (!n) return <aside className="inspector"><div className="section-title"><span>属性</span></div><p className="muted">选择一个节点</p></aside>;

  const free = portsFree(n, topo);
  const used = usedPortCount(n, topo);
  const usage = portUsage(topo, n.id);
  const cons = edgesOf(topo, n.id);

  return (
    <aside className="inspector">
      <div className="section-title"><span>节点属性</span><small>{TYPE_LABEL[n.type]}</small></div>
      {frozen && <FrozenTip onFork={onFork} />}
      <Hints issues={issues} ids={[n.id]} />
      <label>设备名称<DraftInput disabled={frozen} value={n.name} onChange={(v) => onPatchNode(n.id, { name: v })}/></label>
      <label>IP 地址<DraftInput disabled={frozen} value={n.ip} onChange={(v) => onPatchNode(n.id, { ip: v })}/></label>
      <label>所属网段（CIDR）
        <DraftInput disabled={frozen} value={n.segment} onChange={(v) => onPatchNode(n.id, { segment: v })} placeholder="如 10.0.1.0/24"/>
      </label>
      <label>设备类型
        <select disabled={frozen} value={n.type} onChange={(e) => onPatchNode(n.id, { type: e.target.value })}>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>端口总数（容量）
        <DraftInput type="number" min="0" disabled={frozen} value={n.ports} onChange={(v) => onPatchNode(n.id, { ports: Math.max(0, Number(v) || 0) })}/>
      </label>
      <div className={'cap-bar' + (free <= 0 ? ' full' : '')}>
        <span>占用 {used} / {n.ports} · <b>余量 {free}</b></span>
        <div className="cap-track"><i style={{ width: `${n.ports ? Math.min(100, (used / n.ports) * 100) : 0}%` }}/></div>
      </div>
      {n.type === 'switch' && (
        <label className="checkline">
          <input type="checkbox" disabled={frozen} checked={!!n.stp} onChange={(e) => onPatchNode(n.id, { stp: e.target.checked })}/>
          已启用生成树 STP（成环时必须开启，否则连接整单拒绝）
        </label>
      )}

      <div className="inspector-actions">
        <button disabled={frozen} onClick={() => onOpenConnect(n.id)}>⌁ 新建连接</button>
        <button className="danger" disabled={frozen} onClick={() => onRemoveNode(n.id)}>删除节点</button>
      </div>

      <div className="connections">
        <div className="section-title"><span>端口占用明细</span><small>{cons.length} 条连接</small></div>
        {cons.length === 0 && <p className="muted small">尚无连接</p>}
        {cons.map((e) => {
          const otherId = e.from === n.id ? e.to : e.from;
          const other = topo.nodes.find((x) => x.id === otherId);
          const localPort = e.from === n.id ? e.fromPort : e.toPort;
          const conflict = localPort && usage[localPort] && usage[localPort].length > 1;
          return (
            <div className={'connection' + (conflict ? ' clash' : '')} key={e.id}>
              <span className={'mini ' + (other?.type || 'device')}></span>
              <span className="conn-text">
                <strong>{other?.name || otherId}</strong>
                <small>本端 {localPort || <i>未填端口</i>} · {e.bandwidth || <i>未写带宽</i>}</small>
              </span>
              {conflict && <b className="clash-tag">端口冲突</b>}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
