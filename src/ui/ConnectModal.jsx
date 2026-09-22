import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { BANDWIDTHS, nextPortName } from '../model/topology';

// 新建连接：选择对端节点、两端占用端口与带宽。提交由父组件走规则引擎整单校验。
export default function ConnectModal({ topo, source, onClose, onSubmit }) {
  const candidates = useMemo(
    () => topo.nodes.filter((n) => n.id !== source.id && !topo.edges.some(
      (e) => (e.from === source.id && e.to === n.id) || (e.to === source.id && e.from === n.id)
    )),
    [topo, source]
  );
  const [targetId, setTargetId] = useState(candidates[0]?.id || '');
  const [fromPort, setFromPort] = useState(nextPortName(topo, source));
  const [toPort, setToPort] = useState(() => (candidates[0] ? nextPortName(topo, candidates[0]) : ''));
  const [bandwidth, setBandwidth] = useState('1G');

  const target = topo.nodes.find((n) => n.id === targetId);
  const updateTarget = (id) => {
    setTargetId(id);
    const t = topo.nodes.find((n) => n.id === id);
    if (t) setToPort(nextPortName(topo, t));
  };

  return (
    <Modal title={`新建连接 · 从「${source.name}」出发`} onClose={onClose}>
      <div className="modal-body">
        <label>
          对端节点
          <select value={targetId} onChange={(e) => updateTarget(e.target.value)}>
            {candidates.length === 0 && <option value="">（已与所有节点相连）</option>}
            {candidates.map((n) => (
              <option key={n.id} value={n.id}>{n.name}（{n.type === 'switch' ? '交换机' : n.type === 'router' ? '路由器' : n.type === 'server' ? '服务器' : '终端'} · {n.ip}）</option>
            ))}
          </select>
        </label>
        <div className="port-row">
          <label>
            本端端口（{source.name}）
            <input value={fromPort} onChange={(e) => setFromPort(e.target.value)} placeholder="如 G0/1"/>
          </label>
          <label>
            对端端口{target ? `（${target.name}）` : ''}
            <input value={toPort} onChange={(e) => setToPort(e.target.value)} placeholder="如 eth0"/>
          </label>
        </div>
        <label>
          链路带宽
          <select value={bandwidth} onChange={(e) => setBandwidth(e.target.value)}>
            {BANDWIDTHS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </div>
      <div className="modal-foot">
        <button onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={!targetId}
          onClick={() => onSubmit({ from: source.id, to: targetId, fromPort, toPort, bandwidth })}
        >占用两端端口并创建</button>
      </div>
    </Modal>
  );
}
