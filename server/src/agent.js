import OpenAI from 'openai';
import { TRACKING_ID } from './config.js';
import { dispatchTool, INTENT_META, TOOL_DEFINITIONS } from './tools.js';

const SYSTEM_PROMPT = `你是订单助手。
规则：
- 用户询问有多少用户、有哪些用户，或按编号查某个用户时，调用 get_users。问总数或名单时不要传 user_id。
- 查询购买记录时调用 get_user_purchase_records，user_id 从用户原话提取。
- 用户明确要求退款时调用 create_refund_draft。这只创建待确认草稿，不要声称退款已经成功。
- 同一句话里既要查询又要退款时，两个工具都要调用。
- 查询购买记录或退款时，如果缺少 user_id 或 order_id，先向用户追问，不要编造编号。
- 拿到工具结果后，用简短中文整理回复。用户请写清编号和姓名。订单请写清订单号、商品、金额和状态。`;

const MAX_ROUNDS = 4;

const TOOL_PRIORITY = {
  get_users: 0,
  get_user_purchase_records: 1,
  create_refund_draft: 2,
};

let client;

function getClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error('未配置 DEEPSEEK_API_KEY');
    error.status = 500;
    throw error;
  }
  if (!client) {
    client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
  }
  return client;
}

export async function runAgent({ message, history }) {
  const openai = getClient();
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeHistory(history),
    { role: 'user', content: message },
  ];
  const trace = [];
  const pendingApprovals = [];
  let group = 0;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      temperature: 0,
      thinking: { type: 'disabled' },
    });
    const assistant = completion.choices[0]?.message;
    if (!assistant) {
      throw new Error('模型没有返回消息');
    }

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply = assistant.content?.trim() || '没有生成回复。';
      trace.push({ stage: 'reply', title: '整理回复', text: reply });
      return { reply, trace, pendingApprovals, trackingId: TRACKING_ID };
    }

    messages.push({
      role: 'assistant',
      content: assistant.content ?? null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      })),
    });

    const ordered = [...toolCalls].sort(
      (a, b) => (TOOL_PRIORITY[a.function.name] ?? 9) - (TOOL_PRIORITY[b.function.name] ?? 9),
    );
    const results = new Map();
    for (const call of ordered) {
      group += 1;
      results.set(call.id, await executeCall(call, group, trace, pendingApprovals));
    }
    for (const call of toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(results.get(call.id).data),
      });
    }
  }

  const reply = '工具调用轮次已达上限，请把问题说得更具体一些。';
  trace.push({ stage: 'reply', title: '整理回复', text: reply });
  return { reply, trace, pendingApprovals, trackingId: TRACKING_ID };
}

async function executeCall(call, group, trace, pendingApprovals) {
  const name = call.function?.name ?? '';
  const meta = INTENT_META[name];
  const parsedPreview = parseArgs(call.function?.arguments);

  trace.push({
    group,
    stage: 'intent',
    title: '识别意图',
    text: meta ? `${meta.intent}（${meta.label}）` : `未知工具 ${name || '（空）'}`,
  });
  trace.push({
    group,
    stage: 'params',
    title: '提取参数',
    text: formatParams(parsedPreview),
  });
  trace.push({
    group,
    stage: 'tool',
    title: '调用工具',
    text: formatCall(name, parsedPreview),
  });

  const outcome = await dispatchTool(name, call.function?.arguments);
  trace.push({
    group,
    stage: 'sql',
    title: '工具层',
    statements: outcome.statements ?? [],
  });
  trace.push({
    group,
    stage: 'result',
    title: '工具返回',
    data: outcome.data,
  });
  if (outcome.pendingApproval && outcome.ok) {
    pendingApprovals.push(outcome.data);
  }
  return outcome;
}

function parseArgs(raw) {
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function formatParams(args) {
  if (!args) return '参数无法解析';
  const entries = Object.entries(args);
  if (entries.length === 0) return '（无参数）';
  return entries.map(([key, value]) => `${key} = ${String(value)}`).join('\n');
}

function formatCall(name, args) {
  if (!args) return `${name}()`;
  const parts = Object.entries(args).map(([key, value]) => `${key}="${String(value)}"`);
  return `${name || 'unknown'}(${parts.join(', ')})`;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (item) =>
        item &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim(),
    )
    .slice(-12)
    .map((item) => ({ role: item.role, content: item.content }));
}
