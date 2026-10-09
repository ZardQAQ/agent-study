const STATUS_LABEL = {
  paid: '已支付',
  refunded: '已退款',
  pending_confirm: '待确认',
  submitted: '已提交',
};

function money(amount) {
  return `¥${Number(amount).toFixed(2)}`;
}

export default function OrderPanel({ userId, onUserId, orders, refunds, onReset, resetting }) {
  return (
    <section className="orders">
      <div className="orders-head">
        <div>
          <p className="eyebrow">当前数据</p>
          <h2>本地 JSON 里的订单</h2>
        </div>
        <div className="orders-tools">
          <label>
            用户
            <select value={userId} onChange={(event) => onUserId(event.target.value)}>
              <option value="U10086">U10086</option>
              <option value="U10010">U10010</option>
              <option value="">全部</option>
            </select>
          </label>
          <button type="button" className="ghost" onClick={onReset} disabled={resetting}>
            {resetting ? '重置中…' : '重置数据'}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>订单号</th>
              <th>用户</th>
              <th>商品</th>
              <th>金额</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan="5">没有订单</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.order_id}>
                  <td>{order.order_id}</td>
                  <td>{order.user_id}</td>
                  <td>{order.product}</td>
                  <td>{money(order.amount)}</td>
                  <td>
                    <span className={`pill status-${order.status}`}>
                      {STATUS_LABEL[order.status] || order.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {refunds.length > 0 ? (
        <ul className="refund-list">
          {refunds.map((refund) => (
            <li key={refund.draft_id}>
              <strong>{refund.draft_id}</strong>
              <span>{refund.order_id}</span>
              <span>{money(refund.refund_amount)}</span>
              <span>{STATUS_LABEL[refund.status] || refund.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="refund-empty">还没有退款草稿。</p>
      )}
    </section>
  );
}
