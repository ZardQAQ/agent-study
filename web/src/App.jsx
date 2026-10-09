import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmCard from './components/ConfirmCard.jsx';
import OrderPanel from './components/OrderPanel.jsx';
import TracePanel from './components/TracePanel.jsx';

const TRACKING_ID = '208ebd5c-ab4e-4915-86bb-bd003a5d372f';

const SCENARIOS = [
  {
    id: 'query',
    label: '场景 1 · 查询购买记录',
    text: '帮我找找用户 U10086 的购买记录',
  },
  {
    id: 'refund',
    label: '场景 2 · 查询并退款',
    text: '查用户 U10086 的购买记录，并帮他退订单 O20261009001',
  },
];

let messageSeq = 0;

function nextId() {
  messageSeq += 1;
  return `m${messageSeq}`;
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}）`);
  }
  return data;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [userId, setUserId] = useState('U10086');
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [resetting, setResetting] = useState(false);
  const [banner, setBanner] = useState('');
  const listRef = useRef(null);
  const sendingRef = useRef(false);

  const selected = useMemo(
    () => messages.find((item) => item.id === selectedId && item.trace) || null,
    [messages, selectedId],
  );

  useEffect(() => {
    loadOrders(userId);
  }, [userId]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  async function loadOrders(nextUserId) {
    try {
      const query = nextUserId ? `?userId=${encodeURIComponent(nextUserId)}` : '';
      const data = await readJson(await fetch(`/api/orders${query}`));
      setOrders(data.orders || []);
      setRefunds(data.refunds || []);
    } catch (error) {
      setBanner(error.message);
    }
  }

  async function send(text) {
    const message = text.trim();
    if (!message || loading || sendingRef.current) return;
    sendingRef.current = true;
    setBanner('');
    setInput('');
    const history = messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({ role: item.role, content: item.content }));
    const userMessage = { id: nextId(), role: 'user', content: message };
    setMessages((current) => [...current, userMessage]);
    setLoading(true);
    try {
      const data = await readJson(
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history }),
        }),
      );
      const approvals = {};
      for (const draft of data.pendingApprovals || []) {
        approvals[draft.draft_id] = 'pending';
      }
      const assistant = {
        id: nextId(),
        role: 'assistant',
        content: data.reply,
        trace: data.trace || [],
        pendingApprovals: data.pendingApprovals || [],
        approvals,
      };
      setMessages((current) => [...current, assistant]);
      setSelectedId(assistant.id);
      await loadOrders(userId);
    } catch (error) {
      setBanner(error.message);
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  }

  function setApproval(messageId, draftId, state) {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? { ...item, approvals: { ...item.approvals, [draftId]: state } }
          : item,
      ),
    );
  }

  async function confirmRefund(messageId, draft) {
    setApproval(messageId, draft.draft_id, 'submitting');
    setBanner('');
    try {
      const data = await readJson(
        await fetch(`/api/refunds/${encodeURIComponent(draft.draft_id)}/submit`, { method: 'POST' }),
      );
      setApproval(messageId, draft.draft_id, 'submitted');
      const note = {
        id: nextId(),
        role: 'assistant',
        content: `退款已提交。草稿 ${data.data.draft.draft_id}，订单 ${data.data.order.order_id}，金额 ¥${Number(data.data.draft.refund_amount).toFixed(2)}。`,
        trace: [
          {
            kicker: '人工确认',
            stage: 'tool',
            title: '调用工具',
            text: `submit_refund(draft_id="${draft.draft_id}")`,
          },
          {
            kicker: '人工确认',
            stage: 'sql',
            title: '工具层',
            statements: data.statements || [],
          },
          {
            kicker: '人工确认',
            stage: 'result',
            title: '工具返回',
            data: data.data,
          },
        ],
      };
      setMessages((current) => [...current, note]);
      setSelectedId(note.id);
      await loadOrders(userId);
    } catch (error) {
      setApproval(messageId, draft.draft_id, 'error');
      setBanner(error.message);
    }
  }

  async function resetData() {
    if (!window.confirm('重置会清空退款草稿，并把订单恢复成初始种子数据。')) return;
    setResetting(true);
    setBanner('');
    try {
      await readJson(await fetch('/api/reset', { method: 'POST' }));
      setMessages([]);
      setSelectedId(null);
      await loadOrders(userId);
    } catch (error) {
      setBanner(error.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Agent 工具调用</p>
          <h1>订单助手</h1>
        </div>
        <p className="lede">
          模型只负责选工具和写回复。查单与退款草稿在工具层完成，真正提交退款必须由你点确认。
        </p>
      </header>

      <main className="workspace">
        <section className="chat">
          <div className="scenarios">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => send(scenario.text)}
                disabled={loading}
              >
                {scenario.label}
              </button>
            ))}
          </div>
          {banner ? <p className="banner">{banner}</p> : null}
          <div className="messages" ref={listRef}>
            {messages.length === 0 ? (
              <p className="empty">
                试场景 1：只查 U10086 的购买记录。试场景 2：先查出订单，再为 O20261009001 生成退款草稿。
              </p>
            ) : null}
            {messages.map((item) => (
              <article
                key={item.id}
                className={`bubble ${item.role} ${item.id === selectedId ? 'selected' : ''}`}
              >
                <button
                  type="button"
                  className="bubble-body"
                  onClick={() => item.trace && setSelectedId(item.id)}
                >
                  <span>{item.role === 'user' ? '用户' : 'Agent'}</span>
                  <p>{item.content}</p>
                </button>
                {item.pendingApprovals?.map((draft) => (
                  <ConfirmCard
                    key={draft.draft_id}
                    draft={draft}
                    state={item.approvals?.[draft.draft_id] || 'pending'}
                    onConfirm={() => confirmRefund(item.id, draft)}
                    onCancel={() => setApproval(item.id, draft.draft_id, 'cancelled')}
                  />
                ))}
              </article>
            ))}
            {loading ? <p className="pending">正在识别意图并调用工具…</p> : null}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <textarea
              value={input}
              placeholder="例如：帮我找找用户 U10086 的购买记录"
              rows={2}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              发送
            </button>
          </form>
        </section>
        <TracePanel trace={selected?.trace || []} trackingId={TRACKING_ID} />
      </main>

      <OrderPanel
        userId={userId}
        onUserId={setUserId}
        orders={orders}
        refunds={refunds}
        onReset={resetData}
        resetting={resetting}
      />
    </div>
  );
}
