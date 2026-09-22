import React,{useRef,useState}from'react';
import{iconOf}from'../data/model.js';

export default function Canvas({topo,usage,selected,connectFrom,tool,editable,onNodeClick,onCanvasClick,onMove}){
  const board=useRef(null);
  const[drag,setDrag]=useState(null);
  const move=e=>{
    if(!drag)return;
    const r=board.current.getBoundingClientRect();
    onMove(drag,Math.max(35,e.clientX-r.left),Math.max(35,e.clientY-r.top));
  };
  const usedSum=[...usage.values()].reduce((a,b)=>a+b,0);
  const totalSum=topo.nodes.reduce((a,n)=>a+n.ports,0);
  return <section className="canvas-wrap">
    <div className="canvas" ref={board} onMouseMove={move} onMouseUp={()=>setDrag(null)} onClick={onCanvasClick}>
      {topo.links.map(l=>{
        const n1=topo.nodes.find(n=>n.id===l.a),n2=topo.nodes.find(n=>n.id===l.b);
        if(!n1||!n2)return null;
        const dx=n2.x-n1.x,dy=n2.y-n1.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;
        return <React.Fragment key={l.id}>
          <div className="edge" style={{left:n1.x,top:n1.y,width:len,transform:`rotate(${ang}deg)`}}><span></span></div>
          <div className="edge-label" style={{left:(n1.x+n2.x)/2,top:(n1.y+n2.y)/2}}>{l.bandwidth}</div>
        </React.Fragment>;
      })}
      {topo.nodes.map(n=>{
        const u=usage.get(n.id)||0,full=u>=n.ports;
        return <button key={n.id}
          className={'node '+n.type+(selected===n.id?' picked':'')+(connectFrom===n.id?' src':'')+(full?' full':'')}
          style={{left:n.x-42,top:n.y-31}}
          onMouseDown={e=>{e.stopPropagation();if(editable&&tool==='select')setDrag(n.id);}}
          onClick={e=>{e.stopPropagation();onNodeClick(n.id);}}>
          <i>{iconOf(n.type)}</i><strong>{n.name}</strong><small>{n.ip}</small>
          <em className="pbadge">{u}/{n.ports} 口</em>
        </button>;
      })}
      <div className="legend"><span><i className="router"></i>路由器</span><span><i className="switch"></i>交换机</span><span><i className="server"></i>服务器</span><span><i className="device"></i>终端</span></div>
    </div>
    <div className="canvas-footer"><span>拖动节点调整位置 · {topo.links.length} 条连接 · 端口占用 {usedSum}/{totalSum}</span><span>{editable?'草稿可编辑':'已归档 · 只读'}</span></div>
  </section>;
}
