// 规则层：全部校验规则集中在这里，纯函数，不读写界面与存储。
// level=error 的问题会阻断整次提交（事务拒绝，数据回滚到提交前）；warn 仅提示。

export const RULES = [
  { id: 'R-IP-FORMAT', title: '地址格式', desc: '每个节点必须登记合法的 IPv4 地址', level: 'error' },
  { id: 'R-IP-UNIQUE', title: '地址不重复', desc: '全网节点 IP 地址重复时整次拒绝', level: 'error' },
  { id: 'R-SEG-CIDR', title: '网段格式', desc: '节点登记的网段必须是合法 CIDR，如 10.0.1.0/24', level: 'error' },
  { id: 'R-SEG-MEMBER', title: '地址归属网段', desc: '节点 IP 必须落在自己登记的网段范围内', level: 'error' },
  { id: 'R-ISOLATION', title: '网段隔离', desc: '不同网段之间的连接必须经过路由器（至少一端为路由器）', level: 'error' },
  { id: 'R-PORT-CAP', title: '端口容量', desc: '连接占用两端各一个端口，占用数超过节点端口余量时整次拒绝', level: 'error' },
  { id: 'R-PORT-UNIQUE', title: '端口独占', desc: '同一节点的同一个端口不能被两条连接同时占用', level: 'error' },
  { id: 'R-BANDWIDTH', title: '带宽登记', desc: '每条连接必须写明带宽（100M / 1G / 10G / 40G）', level: 'error' },
  { id: 'R-EDGE-REF', title: '端点有效', desc: '连接两端必须是存在且不同的两个节点；除交换机冗余链路外禁止重复连线', level: 'error' },
  { id: 'R-STP', title: '生成树', desc: '交换机成环时环上所有交换机必须启用生成树（STP），否则整次拒绝', level: 'error' },
  { id: 'R-ISOLATED', title: '无孤立节点', desc: '节点应当至少有一条连接（提示，不阻断）', level: 'warn' },
];

const ipToInt = (ip) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((ip || '').trim());
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};

const parseCidr = (s) => {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec((s || '').trim());
  if (!m) return null;
  const base = ipToInt(m[1]);
  const bits = Number(m[2]);
  if (base === null || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask, bits };
};

const inCidr = (ipInt, c) => (ipInt & c.mask) >>> 0 === c.base;

// 在“仅交换机”子图中找出所有简单环（DFS 回溯边），并兼容两节点间双线形成的 2 环
const findSwitchCycles = (topo) => {
  const isSw = (id) => topo.nodes.find((n) => n.id === id)?.type === 'switch';
  const adj = new Map();
  const pairCount = new Map();
  for (const e of topo.edges) {
    if (!isSw(e.from) || !isSw(e.to)) continue;
    if (e.from === e.to) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push({ to: e.to, edge: e.id });
    adj.get(e.to).push({ to: e.from, edge: e.id });
    const key = [e.from, e.to].sort().join('~');
    pairCount.set(key, (pairCount.get(key) || 0) + 1);
  }

  const cycles = [];
  const seenCycle = (ids) => {
    const key = [...ids].sort().join('~');
    if (cycles.some((c) => [...c].sort().join('~') === key)) return;
    cycles.push(ids);
  };

  // 平行边 = 2 节点环
  for (const [key, count] of pairCount) {
    if (count > 1) seenCycle(key.split('~'));
  }

  const parent = new Map();
  const depth = new Map();
  const visited = new Set();
  const dfs = (u) => {
    visited.add(u);
    for (const { to: v, edge } of adj.get(u) || []) {
      if (!visited.has(v)) {
        parent.set(v, { u, edge });
        depth.set(v, (depth.get(u) || 0) + 1);
        dfs(v);
      } else if (parent.get(u)?.u !== v) {
        // 回溯边 u-v：沿父指针取出 v 到 u 的路径
        const path = [u];
        let cur = u;
        let guard = 0;
        while (cur !== v && guard++ < 1000) {
          const p = parent.get(cur);
          if (!p) break;
          path.push(p.u);
          cur = p.u;
        }
        if (cur === v && path.length >= 3) seenCycle(path);
      }
    }
  };
  for (const id of adj.keys()) if (!visited.has(id)) dfs(id);
  return cycles;
};

export function validateTopology(topo) {
  const issues = [];
  const push = (ruleId, message, nodeIds = [], edgeIds = []) =>
    issues.push({ ruleId, level: RULES.find((r) => r.id === ruleId).level, message, nodeIds, edgeIds });

  const nodeById = new Map(topo.nodes.map((n) => [n.id, n]));

  // R-IP-FORMAT / R-IP-UNIQUE
  const ipOwners = new Map();
  for (const n of topo.nodes) {
    if (ipToInt(n.ip) === null) {
      push('R-IP-FORMAT', `节点「${n.name}」的 IP ${n.ip || '(空)'} 不是合法 IPv4 地址`, [n.id]);
    } else {
      const key = n.ip.trim();
      if (!ipOwners.has(key)) ipOwners.set(key, []);
      ipOwners.get(key).push(n);
    }
  }
  for (const [ip, ns] of ipOwners) {
    if (ns.length > 1) {
      push('R-IP-UNIQUE', `IP 地址 ${ip} 被 ${ns.length} 个节点重复登记：${ns.map((n) => n.name).join('、')}`, ns.map((n) => n.id));
    }
  }

  // R-SEG-CIDR / R-SEG-MEMBER
  const cidrCache = new Map();
  for (const n of topo.nodes) {
    const c = parseCidr(n.segment);
    cidrCache.set(n.id, c);
    if (!c) {
      push('R-SEG-CIDR', `节点「${n.name}」登记的网段 ${n.segment || '(空)'} 不是合法 CIDR`, [n.id]);
    } else {
      const ip = ipToInt(n.ip);
      if (ip !== null && !inCidr(ip, c)) {
        push('R-SEG-MEMBER', `节点「${n.name}」的 ${n.ip} 不在登记网段 ${n.segment} 内`, [n.id]);
      }
    }
  }

  // 连接相关
  const seenPair = new Set();
  const linked = new Set();
  const localUsed = new Map(); // nodeId -> Map(port -> [edgeIds])
  for (const e of topo.edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    let refBad = false;
    if (!a || !b) {
      push('R-EDGE-REF', `连接 ${e.id} 引用了不存在的节点`, [], [e.id]);
      refBad = true;
    }
    if (a && b && e.from === e.to) {
      push('R-EDGE-REF', `连接 ${e.id} 的两端是同一个节点「${a.name}」`, [e.from], [e.id]);
      refBad = true;
    }
    if (a && b && e.from !== e.to) {
      const key = [e.from, e.to].sort().join('~');
      if (seenPair.has(key)) {
        // 仅允许交换机之间出现平行链路（生成树冗余场景），其余设备之间重复连线拒绝
        if (a.type !== 'switch' || b.type !== 'switch') {
          push('R-EDGE-REF', `「${a.name}」与「${b.name}」之间存在重复连接`, [e.from, e.to], [e.id]);
        }
      }
      seenPair.add(key);
      linked.add(e.from);
      linked.add(e.to);
    }
    if (refBad) continue;

    // R-BANDWIDTH
    if (!e.bandwidth) push('R-BANDWIDTH', `连接「${a.name} ↔ ${b.name}」未写明带宽`, [e.from, e.to], [e.id]);

    // R-ISOLATION
    const ca = cidrCache.get(a.id);
    const cb = cidrCache.get(b.id);
    if (ca && cb && ca.base !== cb.base) {
      if (a.type !== 'router' && b.type !== 'router') {
        push(
          'R-ISOLATION',
          `连接「${a.name}(${a.segment}) ↔ ${b.name}(${b.segment})」跨网段但两端都不是路由器，违反网段隔离`,
          [a.id, b.id],
          [e.id]
        );
      }
    }

    // 端口占用登记
    for (const [n, port] of [[a, e.fromPort], [b, e.toPort]]) {
      if (!localUsed.has(n.id)) localUsed.set(n.id, new Map());
      const mp = localUsed.get(n.id);
      if (!mp.has(port)) mp.set(port, []);
      mp.get(port).push(e.id);
    }
  }

  // R-PORT-CAP
  for (const n of topo.nodes) {
    const mp = localUsed.get(n.id);
    const used = mp ? mp.size : 0;
    if (used > (n.ports || 0)) {
      push('R-PORT-CAP', `节点「${n.name}」端口不足：登记 ${n.ports} 个端口，已有 ${used} 条连接占用`, [n.id]);
    }
  }

  // R-PORT-UNIQUE（空白端口按未填写处理，提示在端口容量台补登）
  for (const n of topo.nodes) {
    const mp = localUsed.get(n.id);
    if (!mp) continue;
    for (const [port, eids] of mp) {
      if (port && eids.length > 1) {
        push('R-PORT-UNIQUE', `节点「${n.name}」的端口 ${port} 被 ${eids.length} 条连接同时占用`, [n.id], eids);
      }
    }
  }

  // R-STP
  for (const cycle of findSwitchCycles(topo)) {
    const off = cycle
      .map((id) => nodeById.get(id))
      .filter((n) => n && n.stp !== true);
    if (off.length) {
      push(
        'R-STP',
        `交换机成环（${cycle.map((id) => nodeById.get(id)?.name).join(' → ')}）但 ${off
          .map((n) => `「${n.name}」`)
          .join('、')} 未启用生成树`,
        cycle,
        topo.edges.filter((e) => cycle.includes(e.from) && cycle.includes(e.to)).map((e) => e.id)
      );
    }
  }

  // R-ISOLATED（warn）
  for (const n of topo.nodes) {
    if (!linked.has(n.id)) {
      push('R-ISOLATED', `节点「${n.name}」没有任何连接，处于孤立状态`, [n.id]);
    }
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warn');
  return {
    issues,
    errors,
    warnings,
    pass: errors.length === 0,
    byNode: new Set(errors.flatMap((i) => i.nodeIds)),
    byEdge: new Set(errors.flatMap((i) => i.edgeIds)),
  };
}
