// 数据层：拓扑 / 版本结构、纯数据操作与持久化。不依赖 React，不做界面判断。

export const STORE_KEY = 'topology-console';

export const NODE_TYPES = [
  ['router', '◉', '路由器'],
  ['switch', '▦', '交换机'],
  ['server', '▣', '服务器'],
  ['device', '▱', '终端设备'],
];

export const BANDWIDTHS = ['100M', '1G', '10G', '40G'];

export const clone = (v) => JSON.parse(JSON.stringify(v));
export const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

const node = (id, name, type, x, y, ip, segment, ports, stp = null) => ({
  id, name, type, x, y, ip, segment, ports, stp,
});

// v1：已归档的初始拓扑（冻结快照）
const v1Topo = () => ({
  nodes: [
    node('gw', '核心路由器', 'router', 470, 150, '10.0.0.1', '10.0.0.0/16', 8, null),
    node('sw1', '交换机 A', 'switch', 230, 285, '10.0.1.1', '10.0.1.0/24', 8, true),
    node('sw2', '交换机 B', 'switch', 690, 285, '10.0.2.1', '10.0.2.0/24', 4, true),
    node('sw3', '交换机 C（备用）', 'switch', 470, 300, '10.0.1.2', '10.0.1.0/24', 4, true),
    node('web', 'Web Server', 'server', 80, 420, '10.0.1.10', '10.0.1.0/24', 2, null),
    node('db', 'Database', 'server', 300, 430, '10.0.1.20', '10.0.1.0/24', 2, null),
    node('user', '办公终端', 'device', 830, 400, '10.0.2.22', '10.0.2.0/24', 1, null),
  ],
  edges: [
    { id: 'e1', from: 'gw', to: 'sw1', fromPort: 'G0/0', toPort: 'G0/0', bandwidth: '1G' },
    { id: 'e2', from: 'gw', to: 'sw2', fromPort: 'G0/1', toPort: 'G0/0', bandwidth: '1G' },
    { id: 'e6', from: 'sw1', to: 'sw3', fromPort: 'G0/5', toPort: 'G0/0', bandwidth: '1G' },
    { id: 'e3', from: 'sw1', to: 'web', fromPort: 'G0/1', toPort: 'eth0', bandwidth: '100M' },
    { id: 'e4', from: 'sw1', to: 'db', fromPort: 'G0/2', toPort: 'eth0', bandwidth: '1G' },
    { id: 'e5', from: 'sw2', to: 'user', fromPort: 'G0/1', toPort: 'eth0', bandwidth: '100M' },
  ],
});

// v2：当前工作版本（从 v1 派生，保留旧值于 v1 中）
const v2Topo = () => {
  const t = v1Topo();
  t.nodes = t.nodes.map((n) => (n.id === 'sw1' ? { ...n, ports: 16 } : n));
  t.edges = t.edges.map((e) => (e.id === 'e1' ? { ...e, bandwidth: '10G' } : e));
  return t;
};

export const seedDoc = () => ({
  versions: [
    {
      id: 'v1',
      label: 'v1 初始建网',
      createdAt: 1780000000000,
      reason: '录入初始机房拓扑',
      parentId: null,
      archived: true,
      archivedAt: 1780002000000,
      topology: v1Topo(),
    },
    {
      id: 'v2',
      label: 'v2 接入扩容',
      createdAt: 1780003600000,
      reason: '交换机 A 端口扩容到 16 口，上联带宽升级到 10G，新增备用交换机 C',
      parentId: 'v1',
      archived: false,
      archivedAt: null,
      topology: v2Topo(),
    },
  ],
});

// 兼容旧版编辑器（只有 {nodes, edges} 数组边）的存档：包成单个工作版本
const migrate = (raw) => {
  const topo = {
    nodes: (raw.nodes || []).map((n) => ({
      ...n,
      segment: n.segment || '',
      ports: typeof n.ports === 'number' ? n.ports : 4,
      stp: n.type === 'switch' ? n.stp ?? false : null,
    })),
    edges: (raw.edges || []).map((e, i) => {
      if (Array.isArray(e)) {
        return { id: 'e' + (i + 1), from: e[0], to: e[1], fromPort: '', toPort: '', bandwidth: '1G' };
      }
      return { ...e, fromPort: e.fromPort || '', toPort: e.toPort || '' };
    }),
  };
  return {
    versions: [
      {
        id: uid('v'),
        label: '旧版拓扑迁入',
        createdAt: Date.now(),
        reason: '从旧版编辑器存档迁移',
        parentId: null,
        archived: false,
        archivedAt: null,
        topology: topo,
      },
    ],
  };
};

export const loadDoc = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!raw) return seedDoc();
    if (!Array.isArray(raw.versions)) return migrate(raw);
    // 全部归档时保持只读：不自动分叉（改动必须由用户带原因另建版本）
    return raw;
  } catch {
    return seedDoc();
  }
};

export const saveDoc = (doc) => localStorage.setItem(STORE_KEY, JSON.stringify(doc));

// ---- 纯数据查询 ----

export const edgesOf = (topo, nodeId) =>
  topo.edges.filter((e) => e.from === nodeId || e.to === nodeId);

// 每个端口标识（port 字段原值，空串按“未填写”单独计数）在节点上只能被一条边占用
export const portUsage = (topo, nodeId) => {
  const map = {};
  for (const e of edgesOf(topo, nodeId)) {
    const p = e.from === nodeId ? e.fromPort : e.toPort;
    (map[p] = map[p] || []).push(e.id);
  }
  return map;
};

export const portsFree = (n, topo) => {
  const used = new Set();
  for (const e of edgesOf(topo, n.id)) {
    const p = e.from === n.id ? e.fromPort : e.toPort;
    if (p) used.add(p);
  }
  return Math.max(0, (n.ports || 0) - used.size);
};

export const usedPortCount = (n, topo) => (n.ports || 0) - portsFree(n, topo);

export const peerOf = (e, nodeId) => (e.from === nodeId ? e.to : e.from === nodeId ? e.to : null);

// 为本端建议一个尚未占用的端口名（交换机/路由器用 G0/k，服务器/终端用 ethk）
export const nextPortName = (topo, n) => {
  const used = new Set(edgesOf(topo, n.id).map((e) => (e.from === n.id ? e.fromPort : e.toPort)));
  const prefix = n.type === 'switch' || n.type === 'router' ? 'G0/' : 'eth';
  for (let k = 0; k < Math.max(n.ports || 0, 1); k++) {
    const name = prefix + k;
    if (!used.has(name)) return name;
  }
  return prefix + '0';
};

export const replaceVersion = (doc, versionId, patch) => ({
  ...doc,
  versions: doc.versions.map((v) => (v.id === versionId ? { ...v, ...patch } : v)),
});

export const archiveVersion = (doc, versionId, reason, at = Date.now()) =>
  replaceVersion(doc, versionId, { archived: true, archivedAt: at, reason: reason || undefined });

// 改动带原因另建版本：归档旧版本（冻结），新工作版本保留旧值快照
export const forkVersion = (doc, versionId, reason, at = Date.now()) => {
  const src = doc.versions.find((v) => v.id === versionId);
  if (!src) return doc;
  const num = doc.versions.length + 1;
  const nv = {
    id: uid('v'),
    label: 'v' + num + ' 变更',
    createdAt: at,
    reason,
    parentId: src.id,
    archived: false,
    archivedAt: null,
    topology: clone(src.topology),
  };
  const versions = doc.versions.map((v) =>
    v.id === versionId ? { ...v, archived: true, archivedAt: at } : v
  );
  return { ...doc, versions: [...versions, nv] };
};

// 比较两个版本的拓扑，返回字段级差异（旧值 / 新值都保留，用于审计展示）
export const diffTopology = (oldTopo, newTopo) => {
  const out = [];
  const NKEYS = ['name', 'type', 'ip', 'segment', 'ports', 'stp'];
  const NAME = (t, id) => t.nodes.find((n) => n.id === id)?.name || id;
  const EKEYS = ['from', 'to', 'fromPort', 'toPort', 'bandwidth'];
  const LABEL = {
    name: '名称', type: '类型', ip: 'IP', segment: '网段', ports: '端口数', stp: '生成树',
    from: '起点', to: '终点', fromPort: '本端端口', toPort: '对端端口', bandwidth: '带宽',
  };

  const on = new Map(oldTopo.nodes.map((n) => [n.id, n]));
  const nn = new Map(newTopo.nodes.map((n) => [n.id, n]));
  for (const [id, a] of on) {
    const b = nn.get(id);
    if (!b) {
      out.push({ kind: '节点删除', target: a.name, field: '', from: '存在', to: '已删除' });
      continue;
    }
    for (const k of NKEYS) {
      if (String(a[k] ?? '') !== String(b[k] ?? '')) {
        out.push({ kind: '节点变更', target: b.name, field: LABEL[k], from: String(a[k] ?? '—'), to: String(b[k] ?? '—') });
      }
    }
  }
  for (const [id, b] of nn) {
    if (!on.has(id)) out.push({ kind: '节点新增', target: b.name, field: '', from: '—', to: '存在' });
  }

  const oe = new Map(oldTopo.edges.map((e) => [e.id, e]));
  const ne = new Map(newTopo.edges.map((e) => [e.id, e]));
  for (const [id, a] of oe) {
    const b = ne.get(id);
    if (!b) {
      out.push({ kind: '连接删除', target: `${NAME(oldTopo, a.from)} ↔ ${NAME(oldTopo, a.to)}`, field: '', from: a.bandwidth || '—', to: '已删除' });
      continue;
    }
    for (const k of EKEYS) {
      // 端点按 ID 比较，节点改名只记在节点变更里，避免噪音
      const av = a[k];
      const bv = b[k];
      if (k === 'from' || k === 'to') {
        if (av === bv) continue;
        out.push({
          kind: '连接变更',
          target: `${NAME(newTopo, b.from)} ↔ ${NAME(newTopo, b.to)}`,
          field: LABEL[k],
          from: NAME(oldTopo, av),
          to: NAME(newTopo, bv),
        });
      } else if (String(av ?? '') !== String(bv ?? '')) {
        out.push({
          kind: '连接变更',
          target: `${NAME(newTopo, b.from)} ↔ ${NAME(newTopo, b.to)}`,
          field: LABEL[k],
          from: String(av ?? '—'),
          to: String(bv ?? '—'),
        });
      }
    }
  }
  for (const [id, b] of ne) {
    if (!oe.has(id)) {
      out.push({ kind: '连接新增', target: `${NAME(newTopo, b.from)} ↔ ${NAME(newTopo, b.to)}`, field: '', from: '—', to: b.bandwidth || '未写带宽' });
    }
  }
  return out;
};
