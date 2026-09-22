import React, { useEffect, useMemo, useState } from 'react';
import Inventory from './ui/Inventory';
import Canvas from './ui/Canvas';
import Inspector from './ui/Inspector';
import Console from './ui/Console';
import ConnectModal from './ui/ConnectModal';
import ReasonModal from './ui/ReasonModal';
import {
  archiveVersion, forkVersion, loadDoc, replaceVersion, saveDoc, uid,
} from './model/topology';
import { validateTopology } from './rules/validator';

// 编排层：保存整份数据（版本数组），每次改动都作为一次事务提交给规则引擎
export default function App() {
  const [boot] = useState(loadDoc);
  const [doc, setDoc] = useState(boot);
  const [currentId, setCurrentId] = useState(
    () => (boot.versions.find((v) => !v.archived) || boot.versions[0]).id
  );  const [selection, setSelection] = useState('gw');
  const [tab, setTab] = useState('rules');
  const [notice, setNotice] = useState('');
  const [reject, setReject] = useState(null);
  const [connectFor, setConnectFor] = useState(null);
  const [reason, setReason] = useState(null); // {mode:'archive'|'fork', id}

  useEffect(() => saveDoc(doc), [doc]);

  const version = doc.versions.find((v) => v.id === currentId) || doc.versions[0];
  const topo = version.topology;
  const result = useMemo(() => validateTopology(topo), [topo]);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2600); };

  // 整单提交：先在候选拓扑上跑全部规则，任一阻断规则不过则整次拒绝、不改动已持久化数据
  const commit = (nextTopo, okMsg) => {
    if (version.archived) {
      setReject({ errors: [{ ruleId: 'FROZEN', message: `版本「${version.label}」已归档冻结，改动必须带原因另建版本` }] });
      return false;
    }
    const r = validateTopology(nextTopo);
    if (!r.pass) {
      setReject(r);
      setTab('rules');
      return false;
    }
    setDoc(replaceVersion(doc, version.id, { topology: nextTopo }));
    setReject(null);
    if (okMsg) flash(okMsg);
    return true;
  };

  const guardFrozen = () => {
    if (!version.archived) return false;
    setReason({ mode: 'fork', id: version.id });
    return true;
  };

  // ---- 节点登记 ----
  const addNode = (type) => {
    if (guardFrozen()) return;
    const id = uid('node');
    const names = { router: '新路由器', switch: '新交换机', server: '新服务器', device: '新终端' };
    const usedIps = new Set(topo.nodes.map((n) => n.ip));
    let host = 10;
    while (usedIps.has('192.168.0.' + host)) host++;
    const n = {
      id, name: names[type] || '新设备', type,
      x: 120 + Math.random() * 620, y: 110 + Math.random() * 320,
      ip: '192.168.0.' + host, segment: '192.168.0.0/24',
      ports: type === 'switch' ? 8 : type === 'router' ? 4 : type === 'server' ? 2 : 1,
      stp: type === 'switch' ? false : null,
    };
    if (commit({ nodes: [...topo.nodes, n], edges: topo.edges }, '节点已登记')) {
      setSelection(id);
      setTab('nodes');
    }
  };

  const patchNode = (id, patch) => {
    const nodes = topo.nodes.map((n) => {
      if (n.id !== id) return n;
      const merged = { ...n, ...patch };
      if (patch.type && patch.type !== 'switch') merged.stp = null;
      if (patch.type === 'switch' && n.type !== 'switch' && !('stp' in patch)) merged.stp = false;
      return merged;
    });
    commit({ ...topo, nodes }, null);
  };

  const removeNode = (id) => {
    if (guardFrozen()) return;
    const next = {
      nodes: topo.nodes.filter((n) => n.id !== id),
      edges: topo.edges.filter((e) => e.from !== id && e.to !== id),
    };
    if (commit(next, '节点及其连接已删除，端口已释放')) {
      if (selection === id) setSelection(null);
    }
  };

  const dragNode = (id, x, y) => {
    // 位置不影响规则，直接落盘；冻结版本不允许（由画布层拦截）
    setDoc(replaceVersion(doc, version.id, {
      topology: { ...topo, nodes: topo.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) },
    }));
  };

  // ---- 连接：占用两端端口并写明带宽 ----
  const addEdge = ({ from, to, fromPort, toPort, bandwidth }) => {
    const e = { id: uid('e'), from, to, fromPort: fromPort.trim(), toPort: toPort.trim(), bandwidth };
    setConnectFor(null);
    commit({ ...topo, edges: [...topo.edges, e] }, '连接已创建，两端端口已占用');
  };

  const patchEdge = (id, patch) => {
    commit({ ...topo, edges: topo.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }, null);
  };

  const removeEdge = (id) => {
    if (guardFrozen()) return;
    const next = { ...topo, edges: topo.edges.filter((e) => e.id !== id) };
    if (commit(next, '连接已断开，两端端口已释放')) setSelection(null);
  };

  // ---- 版本管理 ----
  const switchVersion = (id) => {
    setCurrentId(id);
    setSelection(null);
    setReject(null);
    const v = doc.versions.find((x) => x.id === id);
    flash(v.archived ? `正在查看归档版本「${v.label}」（只读）` : `已切换到工作版本「${v.label}」`);
  };

  const renameVersion = (id, label) => {
    const v = doc.versions.find((x) => x.id === id);
    if (v.archived) return;
    setDoc(replaceVersion(doc, id, { label }));
  };

  const submitReason = (reasonText) => {
    const { mode, id } = reason;
    setReason(null);
    if (mode === 'archive') {
      setDoc(archiveVersion(doc, id, reasonText));
      flash('版本已归档冻结');
    } else {
      const next = forkVersion(doc, id, reasonText);
      const nv = next.versions.find((v) => !v.archived && v.parentId === id);
      setDoc(next);
      setCurrentId(nv.id);
      setSelection(null);
      setReject(null);
      flash('已基于归档版本创建新工作版本，旧值完整保留');
    }
  };

  const runCheck = () => {
    setTab('rules');
    setReject(result.pass ? null : result);
    flash(result.pass ? '拓扑校验通过：地址、端口、网段与生成树规则全部满足' : `校验未通过：${result.errors.length} 条阻断规则被触发`);
  };

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    a.download = 'topology-versions.json';
    a.click();
    flash('已导出全部版本（含归档旧值）');
  };

  const errNodes = result.byNode;
  const errEdges = result.byEdge;

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div><strong>NETSCAPE</strong><small>PORT &amp; SEGMENT CONSOLE</small></div>
        </div>
        <div className="file">
          <span className={'dot ' + (version.archived ? 'frozen' : 'live')}></span>
          <div>
            <strong>{version.label}{version.archived ? '（冻结）' : ''}</strong>
            <small>{version.archived ? `已归档 ${new Date(version.archivedAt).toLocaleDateString('zh-CN')}` : '工作版本 · 自动保存到本地'}</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={runCheck}>✓ 校验整图</button>
          <button onClick={() => setTab('versions')}>版本 {doc.versions.length}</button>
          <button onClick={exportJson}>↓ 导出</button>
          {version.archived
            ? <button className="save" onClick={() => setReason({ mode: 'fork', id: version.id })}>改动 · 另建版本</button>
            : <button className="save" onClick={() => setReason({ mode: 'archive', id: version.id })}>归档冻结</button>}
        </div>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <span>状态</span>
          <button className={'stat-pill ' + (result.pass ? 'ok' : 'bad')}>
            {result.pass ? `规则通过 · ${result.warnings.length} 提示` : `${result.errors.length} 条阻断`}
          </button>
          <span className="tb-sep"></span>
          <span>节点 {topo.nodes.length} · 连接 {topo.edges.length}</span>
          {version.archived && <button className="fork-inline" onClick={() => setReason({ mode: 'fork', id: version.id })}>改动请另建版本</button>}
        </div>
        <div className="tool-group zoom">
          <button title="装饰">−</button><span>100%</span><button title="装饰">＋</button>
        </div>
      </div>

      {reject && (
        <div className="reject-banner">
          <b>整次拒绝：</b> 本次改动未写入，数据保持提交前状态。
          <ul>
            {reject.errors.slice(0, 4).map((e, i) => <li key={i}><i>{e.ruleId}</i>{e.message}</li>)}
            {reject.errors.length > 4 && <li>……另有 {reject.errors.length - 4} 条，见底部“规则”页签</li>}
          </ul>
          <button onClick={() => setReject(null)}>×</button>
        </div>
      )}

      <div className="workspace">
        <Inventory topo={topo} selected={selection} frozen={version.archived} onSelect={setSelection} onAddNode={addNode} />
        <Canvas
          topo={topo} selected={selection} errNodes={errNodes} errEdges={errEdges}
          frozen={version.archived} onSelect={setSelection} onDrag={dragNode}
        />
        <Inspector
          version={version} topo={topo} selection={selection} issues={result.issues}
          onPatchNode={patchNode} onRemoveNode={removeNode}
          onOpenConnect={(id) => setConnectFor(topo.nodes.find((n) => n.id === id))}
          onPatchEdge={patchEdge} onRemoveEdge={removeEdge}
          onFork={() => setReason({ mode: 'fork', id: version.id })}
        />
      </div>

      <Console
        doc={doc} version={version} topo={topo} issues={result.issues} tab={tab} onTab={setTab}
        onSelectNode={setSelection} onSwitchVersion={switchVersion} onRenameVersion={renameVersion}
        onArchive={(id) => setReason({ mode: 'archive', id })}
        onFork={(id) => setReason({ mode: 'fork', id })}
      />

      {connectFor && (
        <ConnectModal topo={topo} source={connectFor} onClose={() => setConnectFor(null)} onSubmit={addEdge} />
      )}
      {reason && (
        <ReasonModal
          mode={reason.mode}
          sourceLabel={doc.versions.find((v) => v.id === reason.id)?.label}
          onClose={() => setReason(null)} onSubmit={submitReason}
        />
      )}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
