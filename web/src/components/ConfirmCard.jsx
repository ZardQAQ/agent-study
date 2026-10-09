export default function ConfirmCard({ draft, state, onConfirm, onCancel }) {
  return (
    <section className="confirm-card">
      <p className="confirm-kicker">需要人工确认</p>
      <h3>是否确认提交退款？</h3>
      <pre>{JSON.stringify(draft, null, 2)}</pre>
      {state === 'pending' || state === 'submitting' || state === 'error' ? (
        <div className="confirm-actions">
          <button type="button" onClick={onConfirm} disabled={state === 'submitting'}>
            {state === 'submitting' ? '提交中…' : '确认提交'}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={state === 'submitting'}>
            取消
          </button>
        </div>
      ) : null}
      {state === 'submitted' ? <p className="confirm-note">已确认。submit_refund 已执行，订单状态改为 refunded。</p> : null}
      {state === 'cancelled' ? <p className="confirm-note">已取消。草稿仍保留，订单没有退款。</p> : null}
      {state === 'error' ? <p className="confirm-note danger">提交没有成功，可以再试一次。</p> : null}
    </section>
  );
}
