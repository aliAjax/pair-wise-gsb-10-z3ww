import React,{useEffect,useState}from'react';
import{NODE_TYPES,BANDWIDTHS,labelOf,portsOf}from'../data/model.js';

// 文本字段：本地编辑，失焦/回车才提交；提交被规则拒绝时回退为旧值
function Field({label,value,onCommit,disabled}){
  const[v,setV]=useState(value);
  useEffect(()=>setV(value),[value]);
  const commit=()=>{if(v!==value&&onCommit(v)===false)setV(value);};
  return <label>{label}<input value={v} disabled={disabled} onChange={e=>setV(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}/></label>;
}

export default function Inspector({node,topo,usage,editable,onPatchNode,onPatchLink,onRemoveLink,onRemoveNode,onConnect}){
  if(!node)return <aside className="inspector"><div className="section-title"><span>属性</span><small>未选择</small></div><p className="empty-tip">在画布或节点列表中选择一个设备。</p></aside>;
  const used=usage.get(node.id)||0;
  const over=used>node.ports;
  const conns=portsOf(topo,node.id);
  return <aside className="inspector">
    <div className="section-title"><span>属性</span><small>{editable?labelOf(node.type):'已归档 · 只读'}</small></div>
    {!editable&&<div className="locked-tip">当前版本已归档冻结，字段不可修改；可带原因另建新版本。</div>}
    <Field label="设备名称" value={node.name} disabled={!editable} onCommit={v=>onPatchNode(node.id,{name:v})}/>
    <Field label="IP 地址" value={node.ip} disabled={!editable} onCommit={v=>onPatchNode(node.id,{ip:v.trim()})}/>
    <Field label="网段" value={node.segment} disabled={!editable} onCommit={v=>onPatchNode(node.id,{segment:v.trim()})}/>
    <label>设备类型<select value={node.type} disabled={!editable} onChange={e=>onPatchNode(node.id,{type:e.target.value})}>{NODE_TYPES.map(t=><option key={t.type} value={t.type}>{t.label}</option>)}</select></label>
    <Field label="端口总数" value={String(node.ports)} disabled={!editable} onCommit={v=>{const p=parseInt(v,10);if(!Number.isFinite(p)||p<0)return false;return onPatchNode(node.id,{ports:p});}}/>
    {node.type==='switch'&&<label className="chk-row"><input type="checkbox" checked={!!node.stp} disabled={!editable} onChange={e=>onPatchNode(node.id,{stp:e.target.checked})}/>启用生成树（STP）</label>}
    <div className="port-usage">
      <div className="section-title"><span>端口占用</span><small>{used}/{node.ports} 已用</small></div>
      <div className="port-bar"><i className={over?'over':''} style={{width:Math.min(100,node.ports?used/node.ports*100:(used?100:0))+'%'}}></i></div>
    </div>
    <div className="inspector-actions">
      <button disabled={!editable} onClick={()=>onConnect(node.id)}>⌁ 添加连接</button>
      <button className="danger" disabled={!editable} onClick={()=>onRemoveNode(node.id)}>删除设备</button>
    </div>
    <div className="connections">
      <div className="section-title"><span>连接</span><small>{conns.length} 条</small></div>
      {conns.map(({link,portNo,peerId})=>{
        const peer=topo.nodes.find(n=>n.id===peerId);
        return <div className="connection" key={link.id}>
          <span className="portno">{'P'+portNo}</span>
          <span className={'mini '+(peer?peer.type:'')}></span>
          <strong>{peer?peer.name:'未知'}</strong>
          <select value={link.bandwidth} disabled={!editable} onChange={e=>onPatchLink(link.id,{bandwidth:e.target.value})}>{BANDWIDTHS.map(b=><option key={b}>{b}</option>)}</select>
          <button className="lnk-del" title="删除连接" disabled={!editable} onClick={()=>onRemoveLink(link.id)}>✕</button>
        </div>;
      })}
      {!conns.length&&<p className="empty-tip">暂无连接。</p>}
    </div>
  </aside>;
}
