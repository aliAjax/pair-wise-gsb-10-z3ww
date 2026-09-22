import React, { useState } from 'react';
import Modal from './Modal';

// 改动带原因另建版本：必须填写变更原因，旧版本冻结、旧值完整保留
export default function ReasonModal({ mode, sourceLabel, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={mode === 'fork' ? '改动归档拓扑 · 另建版本' : '归档冻结当前版本'} onClose={onClose} width={460}>
      <div className="modal-body">
        <p className="modal-note">
          {mode === 'fork'
            ? <>版本 <b>{sourceLabel}</b> 已归档冻结，不能直接改动。将创建一个携带其完整快照的新工作版本，旧版本原样保留。</>
            : <>将把 <b>{sourceLabel}</b> 标记为已归档冻结，之后任何改动都需要填写原因另建版本。</>}
        </p>
        <label>
          变更原因（必填）
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：核心上联带宽从 1G 升级到 10G"/>
        </label>
      </div>
      <div className="modal-foot">
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>
          {mode === 'fork' ? '保留旧值并创建新版本' : '确认归档冻结'}
        </button>
      </div>
    </Modal>
  );
}
