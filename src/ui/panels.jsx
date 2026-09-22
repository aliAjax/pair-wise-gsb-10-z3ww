import React,{useState}from'react';

// 违规报告：列出规则 / 节点 / 端口 / 网段 / 说明
export function ReportPanel({report,onClose}){
  return <div className={'report '+(report.rejected?'bad':'warn')}>
    <div className="report-head"><strong>{report.title}</strong><span>{report.violations.length} 条违规</span><button onClick={onClose}>✕</button></div>
    <div className="report-body"><table>
      <thead><tr><th>规则</th><th>节点</th><th>端口</th><th>网段</th><th>说明</th></tr></thead>
      <tbody>{report.violations.map((v,i)=><tr key={i}>
        <td><span className="rule-code">{v.code}</span>{v.rule}</td>
        <td>{v.nodes.map(n=>n.name).join('、')}</td>
        <td>{v.ports}</td>
        <td>{v.segments.join('、')}</td>
        <td>{v.detail}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="report-foot">{report.rejected?'本次改动已整体回滚，未写入任何数据，拓扑保持上一致状态。':'请修正以上违规后再次校验。'}</div>
  </div>;
}

export function VersionsPanel({store,viewId,onView,onFork,onClose}){
  const rows=[...store.versions].sort((a,b)=>b.no-a.no);
  return <div className="modal-back" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><strong>版本记录</strong><button onClick={onClose}>✕</button></div>
    <div className="version-list">{rows.map(v=><div key={v.id} className={'version-row'+(v.id===viewId?' viewing':'')}>
      <b>v{v.no}</b>
      <span className="v-reason">{v.reason}<small>{new Date(v.createdAt).toLocaleString()}</small></span>
      <span className={'v-tag '+(v.archived?'arch':'draft')}>{v.archived?'已归档':'草稿'}</span>
      {v.id===viewId&&<span className="v-tag cur">查看中</span>}
      <button onClick={()=>onView(v.id)}>查看</button>
    </div>)}</div>
    <div className="modal-foot"><span className="foot-tip">已归档版本冻结保存，旧值完整保留</span><button className="primary" onClick={onFork}>基于当前查看另建新版本</button></div>
  </div></div>;
}

export function NewVersionModal({baseNo,onCancel,onConfirm}){
  const[reason,setReason]=useState('');
  return <div className="modal-back"><div className="modal">
    <div className="modal-head"><strong>另建新版本</strong><button onClick={onCancel}>✕</button></div>
    <p className="modal-tip">基于版本 v{baseNo} 复制完整拓扑；旧版本将冻结保留，不会丢失任何旧值。</p>
    <label className="reason">改动原因（必填）<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="例如：办公区扩容，新增两台终端并上联交换机 B"/></label>
    <div className="modal-foot"><button onClick={onCancel}>取消</button><button className="primary" disabled={!reason.trim()} onClick={()=>onConfirm(reason.trim())}>创建版本</button></div>
  </div></div>;
}
