// 数据层：拓扑与版本的数据结构、派生量计算（不含规则与界面）
export const NODE_TYPES=[
  {type:'router',icon:'◉',label:'路由器',ports:8},
  {type:'switch',icon:'▦',label:'交换机',ports:8},
  {type:'server',icon:'▣',label:'服务器',ports:2},
  {type:'device',icon:'▱',label:'终端设备',ports:1},
];
export const BANDWIDTHS=['100M','1G','10G','40G'];
export const iconOf=t=>(NODE_TYPES.find(x=>x.type===t)||NODE_TYPES[3]).icon;
export const labelOf=t=>(NODE_TYPES.find(x=>x.type===t)||NODE_TYPES[3]).label;
export const uid=p=>p+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
export const clone=o=>JSON.parse(JSON.stringify(o));

export function seedTopology(){
  return {
    name:'office-network',
    nodes:[
      {id:'gw',name:'核心路由器',type:'router',x:470,y:200,ip:'10.0.0.1',segment:'10.0.0.0/24',ports:8,stp:false},
      {id:'sw1',name:'交换机 A',type:'switch',x:250,y:360,ip:'10.0.1.1',segment:'10.0.1.0/24',ports:8,stp:true},
      {id:'sw2',name:'交换机 B',type:'switch',x:690,y:360,ip:'10.0.2.1',segment:'10.0.2.0/24',ports:8,stp:true},
      {id:'web',name:'Web Server',type:'server',x:110,y:520,ip:'10.0.1.10',segment:'10.0.1.0/24',ports:2,stp:false},
      {id:'db',name:'Database',type:'server',x:400,y:550,ip:'10.0.1.20',segment:'10.0.1.0/24',ports:2,stp:false},
      {id:'user',name:'办公终端',type:'device',x:830,y:520,ip:'10.0.2.22',segment:'10.0.2.0/24',ports:1,stp:false},
    ],
    links:[
      {id:'l1',a:'gw',b:'sw1',bandwidth:'10G'},
      {id:'l2',a:'gw',b:'sw2',bandwidth:'10G'},
      {id:'l3',a:'sw1',b:'web',bandwidth:'1G'},
      {id:'l4',a:'sw1',b:'db',bandwidth:'1G'},
      {id:'l5',a:'sw2',b:'user',bandwidth:'1G'},
    ],
  };
}
export function seedStore(){
  return {versions:[{id:'v1',no:1,reason:'初始拓扑导入',createdAt:new Date().toISOString(),archived:false,topology:seedTopology()}],activeId:'v1',viewId:'v1'};
}
// 端口占用由连接派生，不单独存储，保证刷新后占用与连接始终一致
export function portUsage(topo){
  const m=new Map(topo.nodes.map(n=>[n.id,0]));
  for(const l of topo.links){if(m.has(l.a))m.set(l.a,m.get(l.a)+1);if(m.has(l.b))m.set(l.b,m.get(l.b)+1);}
  return m;
}
export const linksOf=(topo,id)=>topo.links.filter(l=>l.a===id||l.b===id);
export const peerOf=(link,id)=>link.a===id?link.b:link.a;
// 节点的端口分配：按连接顺序编号 P1..Pn
export function portsOf(topo,id){return linksOf(topo,id).map((l,i)=>({link:l,portNo:i+1,peerId:peerOf(l,id)}));}
export function nextFreeIp(topo){
  const used=new Set(topo.nodes.map(n=>n.ip));
  for(let i=2;i<255;i++){const ip='192.168.0.'+i;if(!used.has(ip))return ip;}
  return '192.168.0.2';
}
