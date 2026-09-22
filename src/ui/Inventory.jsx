import React from 'react';
import { NODE_TYPES, portsFree, usedPortCount } from '../model/topology';

const ICON = { router: '◉', switch: '▦', server: '▣', device: '▱' };

// 左栏：设备登记入口 + 节点清单（显示端口余量与所属网段）
export default function Inventory({ topo, selected, frozen, onSelect, onAddNode }) {
  return (
    <aside className="inventory">
      <div className="section-title"><span>设备库</span><small>点击登记节点</small></div>
      <div className="device-types">
        {NODE_TYPES.map(([t, icon, label]) => (
          <button key={t} disabled={frozen} onClick={() => onAddNode(t)} title={frozen ? '版本已冻结，请先另建版本' : `登记${label}`}>
            <i className={t}>{icon}</i>{label}<span>＋</span>
          </button>
        ))}
      </div>

      <div className="section-title nodes-head"><span>图中节点</span><small>{topo.nodes.length} 个</small></div>
      <div className="node-list">
        {topo.nodes.map((n) => {
          const free = portsFree(n, topo);
          const used = usedPortCount(n, topo);
          return (
            <button key={n.id} className={selected === n.id ? 'sel' : ''} onClick={() => onSelect(n.id)}>
              <i className={n.type}>{ICON[n.type]}</i>
              <span className="nl-text">
                <strong>{n.name}</strong>
                <small>{n.ip} · {n.segment || '未登记网段'}</small>
                <small className={free <= 0 ? 'cap-bad' : 'cap-ok'}>端口 {used}/{n.ports}（余 {free}）{n.type === 'switch' ? ` · ${n.stp ? 'STP 开' : 'STP 关'}` : ''}</small>
              </span>
              <b>›</b>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
