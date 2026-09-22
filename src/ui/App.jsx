import React,{useEffect,useMemo,useState}from'react';
import{NODE_TYPES,BANDWIDTHS,iconOf,portUsage,nextFreeIp,uid}from'../data/model.js';
import{loadStore,saveStore,commitTopology,archiveVersion,forkVersion}from'../data/store.js';
import{validateTopology,RULES}from'../rules/validate.js';
import Canvas from'./Canvas.jsx';
import Inspector from'./Inspector.jsx';
import{ReportPanel,VersionsPanel,NewVersionModal}from'./panels.jsx';

export default function App(){
  const[store,setStore]=useState(loadStore);
  const[selected,setSelected]=useState('gw');
  const[tool,setTool]=useState('select');
  const[connectFrom,setConnectFrom]=useState(null);
  const[bandwidth,setBandwidth]=useState('1G');
  const[notice,setNotice]=useState('');
  const[report,setReport]=useState(null);
  const[showVersions,setShowVersions]=useState(false);
  const[showFork,setShowFork]=useState(false);

  useEffect(()=>saveStore(store),[store]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3600);return()=>clearTimeout(t);},[notice]);

  const viewed=store.versions.find(v=>v.id===store.viewId)||store.versions[store.versions.length-1];
  const topo=viewed.topology;
  const editable=viewed.id===store.activeId&&!viewed.archived;
  const usage=useMemo(()=>portUsage(topo),[topo]);
  const usedSum=[...usage.values()].reduce((a,b)=>a+b,0);
  const totalSum=topo.nodes.reduce((a,n)=>a+n.ports,0);
  const node=topo.nodes.find(n=>n.id===selected)||null;

  const locked=()=>setNotice('当前版本已归档冻结：请带原因另建新版本后再修改');
  // 事务式提交：先对候选拓扑整体校验，任一规则不通过则整次拒绝，不写入任何数据
  const attempt=(nextTopo,okMsg)=>{
    const violations=validateTopology(nextTopo);
    if(violations.length){
      setReport({title:'改动已整次拒绝',rejected:true,violations});
      setNotice(`校验未通过：${violations.length} 条违规，本次改动未生效`);
      return false;
    }
    setReport(null);
    setStore(s=>commitTopology(s,nextTopo));
    if(okMsg)setNotice(okMsg);
    return true;
  };

  const patchNode=(id,patch)=>{
    if(!editable)return locked();
    if(patch.type==='switch'&&topo.nodes.find(n=>n.id===id)?.stp===undefined)patch={...patch,stp:true};
    return attempt({...topo,nodes:topo.nodes.map(n=>n.id===id?{...n,...patch}:n)});
  };
  const addNodeOfType=t=>{
    if(!editable)return locked();
    const def=NODE_TYPES.find(x=>x.type===t);
    const id=uid('n');
    const n={id,name:def.label,type:t,x:420+(topo.nodes.length%5)*34,y:250+(topo.nodes.length%4)*40,ip:nextFreeIp(topo),segment:'192.168.0.0/24',ports:def.ports,stp:t==='switch'};
    if(attempt({...topo,nodes:[...topo.nodes,n]},'已添加'+def.label)){setSelected(id);setTool('select');}
  };
  const removeNode=id=>{
    if(!editable)return locked();
    const next={...topo,nodes:topo.nodes.filter(n=>n.id!==id),links:topo.links.filter(l=>l.a!==id&&l.b!==id)};
    if(attempt(next,'设备已删除，其连接占用的端口已释放')){
      if(selected===id)setSelected(null);
      if(connectFrom===id)setConnectFrom(null);
    }
  };
  const addLink=(a,b)=>{
    if(!editable)return locked();
    if(a===b){setNotice('不能将节点连接到自身');return;}
    if(topo.links.some(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a))){setNotice('两个节点之间已存在连接');return;}
    if(attempt({...topo,links:[...topo.links,{id:uid('l'),a,b,bandwidth}]},`连接已创建（${bandwidth}）：两端各占用 1 个端口`))setSelected(b);
  };
  const patchLink=(id,patch)=>{
    if(!editable)return locked();
    return attempt({...topo,links:topo.links.map(l=>l.id===id?{...l,...patch}:l)});
  };
  const removeLink=id=>{
    if(!editable)return locked();
    return attempt({...topo,links:topo.links.filter(l=>l.id!==id)},'连接已删除，两端端口已释放');
  };
  // 拖动仅改坐标，不触碰规则，直接写入草稿
  const moveNode=(id,x,y)=>setStore(s=>{
    const v=s.versions.find(v=>v.id===s.activeId);
    if(!v||v.archived||s.viewId!==s.activeId)return s;
    const t=v.topology;
    return commitTopology(s,{...t,nodes:t.nodes.map(n=>n.id===id?{...n,x,y}:n)});
  });

  const nodeClick=id=>{
    if(tool==='connect'){
      if(!editable)return locked();
      if(!connectFrom){setConnectFrom(id);setNotice('连接模式：再点击目标节点完成连接');}
      else{addLink(connectFrom,id);setConnectFrom(null);}
    }else setSelected(id);
  };
  const canvasClick=()=>{if(tool==='connect')setConnectFrom(null);else setSelected(null);};
  const startConnect=id=>{
    if(!editable)return locked();
    setTool('connect');setConnectFrom(id);
    setNotice('连接模式：在画布上点击目标节点');
  };

  const runCheck=()=>{
    const violations=validateTopology(topo);
    if(violations.length)setReport({title:'校验结果：未通过',rejected:false,violations});
    else{setReport(null);setNotice('校验通过：地址 / 端口 / 网段 / 生成树 4 条规则均满足');}
  };
  const archive=()=>{
    const violations=validateTopology(topo);
    if(violations.length){setReport({title:'归档前校验未通过',rejected:true,violations});setNotice('存在违规，无法归档');return;}
    setStore(s=>archiveVersion(s,viewed.id));
    setNotice(`版本 v${viewed.no} 已归档冻结，另建新版本才能继续修改`);
  };
  const fork=reason=>{
    setStore(s=>forkVersion(s,viewed.id,reason));
    setShowFork(false);setShowVersions(false);
    setSelected(null);setConnectFrom(null);setTool('select');
    setNotice('已另建新版本并进入编辑，旧版本完整保留');
  };
  const viewVersion=id=>{setStore(s=>({...s,viewId:id}));setSelected(null);setConnectFrom(null);};
  const exportJson=()=>{
    const payload={file:topo.name+'.json',version:'v'+viewed.no,reason:viewed.reason,archived:viewed.archived,exportedAt:new Date().toISOString(),topology:topo};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    a.download=topo.name+'-v'+viewed.no+'.json';a.click();
    setNotice('JSON 已导出');
  };

  return <div className="app">
    <header>
      <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>PORT · SEGMENT VALIDATION</small></div></div>
      <div className="file"><span className="dot"></span><div><strong>{topo.name}.json<span className={'ver-badge '+(viewed.archived?'arch':'')}>v{viewed.no} · {viewed.archived?'已归档':'草稿'}</span></strong><small>改动原因：{viewed.reason}</small></div></div>
      <div className="top-actions">
        <button onClick={runCheck}>✓ 校验</button>
        <button onClick={()=>setShowVersions(true)}>◷ 版本</button>
        <button onClick={exportJson}>↓ 导出</button>
        {editable
          ?<button className="save" onClick={archive}>归档当前版本</button>
          :<button className="save" onClick={()=>setShowFork(true)}>另建新版本</button>}
      </div>
    </header>
    <div className="toolbar">
      <div className="tool-group"><span>工具</span>
        <button className={tool==='select'?'on':''} onClick={()=>{setTool('select');setConnectFrom(null);}}>↖ 选择</button>
        <button className={tool==='connect'?'on':''} onClick={()=>{setTool(tool==='connect'?'select':'connect');setConnectFrom(null);}}>⌁ 连接</button>
        <span>新连接带宽</span>
        <select value={bandwidth} onChange={e=>setBandwidth(e.target.value)}>{BANDWIDTHS.map(b=><option key={b}>{b}</option>)}</select>
        {tool==='connect'&&<em className="hint">{connectFrom?'点击目标节点完成连接':'点击第一个节点开始连接'}</em>}
      </div>
      <div className="tool-group"><span className="status-chip">端口占用 {usedSum}/{totalSum} · {topo.links.length} 条连接 · 规则 {RULES.length} 条</span></div>
    </div>
    {!editable&&<div className="frozen-banner">版本 v{viewed.no} 已归档，拓扑冻结，所有字段只读。<button onClick={()=>setShowFork(true)}>带原因另建新版本</button><button onClick={()=>setShowVersions(true)}>查看版本记录</button></div>}
    <div className="workspace">
      <aside className="inventory">
        <div className="section-title"><span>设备库</span><small>{topo.nodes.length} 个节点</small></div>
        <div className="device-types">{NODE_TYPES.map(t=><button key={t.type} disabled={!editable} onClick={()=>addNodeOfType(t.type)}><i className={t.type}>{t.icon}</i>{t.label}<span>＋</span></button>)}</div>
        <div className="section-title nodes-head"><span>图中节点</span><small>网段 · 端口占用</small></div>
        <div className="node-list">{topo.nodes.map(n=>{const u=usage.get(n.id)||0;return <button key={n.id} className={selected===n.id?'sel':''} onClick={()=>setSelected(n.id)}><i className={n.type}>{iconOf(n.type)}</i><span><strong>{n.name}</strong><small>{n.segment} · 端口 {u}/{n.ports}</small></span><b>›</b></button>;})}</div>
        <div className="rules-block"><b>校验规则</b>{RULES.map(r=><div key={r.code}><span className="rule-code">{r.code}</span><span>{r.name} — {r.desc}</span></div>)}</div>
      </aside>
      <Canvas topo={topo} usage={usage} selected={selected} connectFrom={connectFrom} tool={tool} editable={editable} onNodeClick={nodeClick} onCanvasClick={canvasClick} onMove={moveNode}/>
      <Inspector node={node} topo={topo} usage={usage} editable={editable} onPatchNode={patchNode} onPatchLink={patchLink} onRemoveLink={removeLink} onRemoveNode={removeNode} onConnect={startConnect}/>
    </div>
    {report&&<ReportPanel report={report} onClose={()=>setReport(null)}/>}
    {showVersions&&<VersionsPanel store={store} viewId={viewed.id} onView={id=>{viewVersion(id);setShowVersions(false);}} onFork={()=>{setShowVersions(false);setShowFork(true);}} onClose={()=>setShowVersions(false)}/>}
    {showFork&&<NewVersionModal baseNo={viewed.no} onCancel={()=>setShowFork(false)} onConfirm={fork}/>}
    {notice&&<div className="toast">{notice}</div>}
  </div>;
}
