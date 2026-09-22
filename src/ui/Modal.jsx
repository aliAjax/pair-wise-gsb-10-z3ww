import React, { useEffect } from 'react';

// 通用弹窗：纯展示 + 关闭回调，内容由 children 决定
export default function Modal({ title, onClose, children, width = 420 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
