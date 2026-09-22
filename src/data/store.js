// 数据层：版本库持久化与版本操作（纯函数，不依赖界面）
import{seedStore,clone}from'./model.js';
const KEY='topology-console-v1';

export function loadStore(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY));
    if(s&&Array.isArray(s.versions)&&s.versions.length&&s.versions.every(v=>v.topology&&Array.isArray(v.topology.nodes)&&Array.isArray(v.topology.links))){
      if(!s.versions.some(v=>v.id===s.activeId))s.activeId=s.versions[s.versions.length-1].id;
      if(!s.versions.some(v=>v.id===s.viewId))s.viewId=s.activeId;
      // 不变量：至多一个未归档草稿，且为 activeId
      const drafts=s.versions.filter(v=>!v.archived);
      if(drafts.length>1)s.versions=s.versions.map(v=>v.archived||v.id===s.activeId?v:{...v,archived:true});
      return s;
    }
  }catch{}
  return seedStore();
}
export function saveStore(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}}

// 提交拓扑：只允许写入未归档的当前草稿版本
export function commitTopology(store,topo){
  return {...store,versions:store.versions.map(v=>v.id===store.activeId&&!v.archived?{...v,topology:topo}:v)};
}
// 归档：冻结指定版本，之后不可再写
export function archiveVersion(store,id){
  return {...store,versions:store.versions.map(v=>v.id===id?{...v,archived:true}:v)};
}
// 另建版本：从指定版本复制拓扑，旧版本全部冻结保留，新版本成为唯一草稿
export function forkVersion(store,fromId,reason){
  const from=store.versions.find(v=>v.id===fromId)||store.versions.find(v=>v.id===store.activeId);
  const no=Math.max(...store.versions.map(v=>v.no))+1;
  const id='v'+no+'-'+Date.now().toString(36);
  const nv={id,no,reason:reason||'未填写原因',createdAt:new Date().toISOString(),archived:false,topology:clone(from.topology)};
  const versions=store.versions.map(v=>v.archived?v:{...v,archived:true}).concat(nv);
  return {...store,versions,activeId:id,viewId:id};
}
