// 规则层：只依赖拓扑数据，返回违规清单（节点 / 端口 / 网段 / 规则）
import{portUsage,linksOf}from'../data/model.js';

export const RULES=[
  {code:'R1',name:'地址唯一',desc:'任意两个节点不得登记相同 IP 地址'},
  {code:'R2',name:'端口容量',desc:'连接占用的端口数不得超过节点登记的端口总数'},
  {code:'R3',name:'网段隔离',desc:'不同网段的节点不得直连，须经由路由器互联'},
  {code:'R4',name:'生成树',desc:'交换机成环时，环上所有交换机必须启用生成树（STP）'},
];
const brief=n=>({id:n.id,name:n.name});
const byId=(topo,id)=>topo.nodes.find(n=>n.id===id);
const portNoOf=(topo,nodeId,linkId)=>{const i=linksOf(topo,nodeId).findIndex(l=>l.id===linkId);return i<0?'?':'P'+(i+1);};

// R1 地址唯一
function checkDupIp(topo){
  const groups=new Map();
  for(const n of topo.nodes){
    const ip=(n.ip||'').trim();if(!ip)continue;
    if(!groups.has(ip))groups.set(ip,[]);
    groups.get(ip).push(n);
  }
  const out=[];
  for(const[ip,list]of groups){
    if(list.length>1)out.push({code:'R1',rule:'地址唯一',nodes:list.map(brief),ports:'—',segments:[...new Set(list.map(n=>n.segment))],detail:`IP ${ip} 被 ${list.map(n=>n.name).join('、')} 同时登记`});
  }
  return out;
}
// R2 端口容量
function checkPorts(topo){
  const usage=portUsage(topo);
  return topo.nodes.filter(n=>(usage.get(n.id)||0)>n.ports).map(n=>({code:'R2',rule:'端口容量',nodes:[brief(n)],ports:`${usage.get(n.id)}/${n.ports}`,segments:[n.segment],detail:`${n.name} 需占用 ${usage.get(n.id)} 个端口，登记总数仅 ${n.ports} 个`}));
}
// R3 网段隔离
function checkSegment(topo){
  const out=[];
  for(const l of topo.links){
    const a=byId(topo,l.a),b=byId(topo,l.b);
    if(!a||!b||a.segment===b.segment)continue;
    if(a.type==='router'||b.type==='router')continue;
    out.push({code:'R3',rule:'网段隔离',nodes:[brief(a),brief(b)],ports:`${portNoOf(topo,a.id,l.id)}↔${portNoOf(topo,b.id,l.id)}`,segments:[a.segment,b.segment],detail:`${a.name}（${a.segment}）与 ${b.name}（${b.segment}）跨网段直连，未经过路由器`});
  }
  return out;
}
// 无向图找环（去重后的基本环）
function findCycles(topo){
  const adj=new Map(topo.nodes.map(n=>[n.id,[]]));
  for(const l of topo.links){if(adj.has(l.a)&&adj.has(l.b)&&l.a!==l.b){adj.get(l.a).push(l.b);adj.get(l.b).push(l.a);}}
  const state=new Map(),stack=[],seen=new Set(),cycles=[];
  const dfs=(u,parent)=>{
    state.set(u,1);stack.push(u);
    for(const v of adj.get(u)){
      if(v===parent)continue;
      if(state.get(v)===1){
        const cyc=stack.slice(stack.indexOf(v));
        const k=[...cyc].sort().join('|');
        if(!seen.has(k)){seen.add(k);cycles.push(cyc);}
      }else if(!state.get(v))dfs(v,u);
    }
    stack.pop();state.set(u,2);
  };
  for(const n of topo.nodes)if(!state.get(n.id))dfs(n.id,null);
  return cycles;
}
// R4 生成树：环上存在未启用 STP 的交换机即违规
function checkStp(topo){
  const out=[];
  for(const cyc of findCycles(topo)){
    const nodes=cyc.map(id=>byId(topo,id)).filter(Boolean);
    const offenders=nodes.filter(n=>n.type==='switch'&&!n.stp);
    if(offenders.length)out.push({code:'R4',rule:'生成树',nodes:nodes.map(brief),ports:'—',segments:[...new Set(nodes.map(n=>n.segment))],detail:`环路 ${nodes.map(n=>n.name).join(' → ')} 中，${offenders.map(n=>n.name).join('、')} 未启用生成树`});
  }
  return out;
}
export function validateTopology(topo){
  return[...checkDupIp(topo),...checkPorts(topo),...checkSegment(topo),...checkStp(topo)];
}
