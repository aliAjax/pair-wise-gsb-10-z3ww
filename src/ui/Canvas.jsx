import React, { useRef } from 'react';

const ICON = { router: '◉', switch: '▦', server: '▣', device: '▱' };

// 画布层：只负责渲染节点 / 连接及位置交互，所有数据变更经 onDrag 回调上交
export default function Canvas({ topo, selected, errNodes, errEdges, frozen, onSelect, onDrag }) {
  const board = useRef();
  const dragId = useRef(null);

  const move = (e) => {
    if (!dragId.current || frozen) return;
    const r = board.current.getBoundingClientRect();
    onDrag(dragId.current, Math.max(40, e.clientX - r.left), Math.max(34, e.clientY - r.top));
  };

  return (
    <section className="canvas-wrap">
      <div
        className="canvas"
        ref={board}
        onMouseMove={move}
        onMouseUp={() => (dragId.current = null)}
        onMouseLeave={() => (dragId.current = null)}
      >
        {topo.edges.map((e) => {
          const n1 = topo.nodes.find((n) => n.id === e.from);
          const n2 = topo.nodes.find((n) => n.id === e.to);
          if (!n1 || !n2) return null;
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const len = Math.hypot(dx, dy);
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          const bad = errEdges.has(e.id);
          return (
            <div className={'edge' + (bad ? ' bad' : '')} key={e.id} style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}>
              <span className="edge-line"></span>
              <button
                className={'edge-chip' + (selected === 'edge:' + e.id ? ' picked' : '')}
                style={{ left: len / 2 }}
                onMouseDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => { ev.stopPropagation(); onSelect('edge:' + e.id); }}
                title={`${e.fromPort || '?'} ↔ ${e.toPort || '?'}`}
              >{e.bandwidth || '未写带宽'}</button>
            </div>
          );
        })}

        {topo.nodes.map((n) => {
          const bad = errNodes.has(n.id);
          return (
            <button
              key={n.id}
              className={'node ' + n.type + (selected === n.id ? ' picked' : '') + (bad ? ' bad' : '')}
              style={{ left: n.x - 46, top: n.y - 33 }}
              onMouseDown={(e) => {
                if (frozen) return;
                e.stopPropagation();
                dragId.current = n.id;
                onSelect(n.id);
              }}
              onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
              title={n.segment}
            >
              <i>{ICON[n.type] || '▱'}</i>
              <strong>{n.name}</strong>
              <small>{n.ip}</small>
              <em className="seg-tag">{n.segment}</em>
              {n.type === 'switch' && <b className={'stp ' + (n.stp ? 'on' : 'off')}>{n.stp ? 'STP' : '无STP'}</b>}
            </button>
          );
        })}

        <div className="legend">
          <span><i className="router"></i>路由器</span>
          <span><i className="switch"></i>交换机</span>
          <span><i className="server"></i>服务器</span>
          <span><i className="device"></i>终端</span>
        </div>
        {frozen && <div className="frozen-stamp">已归档 · 冻结</div>}
      </div>
      <div className="canvas-footer">
        <span>拖动节点调整位置 · 连接中点标签为带宽 · 红框为规则拒绝项</span>
        <span>{topo.nodes.length} 个节点 · {topo.edges.length} 条连接</span>
      </div>
    </section>
  );
}
