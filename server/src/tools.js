import { createRefundDraft, getUserPurchaseRecords, getUsers, submitRefund } from './store.js';

export { submitRefund };

export const INTENT_META = {
  get_users: {
    intent: 'query_users',
    label: '查询用户',
  },
  get_user_purchase_records: {
    intent: 'query_user_purchase_records',
    label: '查询购买记录',
  },
  create_refund_draft: {
    intent: 'refund_flow',
    label: '退款草稿',
  },
};

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_users',
      description:
        '查询系统中的用户。不传 user_id 时返回全部用户和总数；传入 user_id 时只返回该用户。用户询问有多少用户、有哪些用户时使用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          user_id: {
            type: 'string',
            description: '可选。用户编号，例如 U10086。不传则返回全部用户。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_purchase_records',
      description: '查询某个用户最近的购买记录，按创建时间倒序，最多 50 条。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          user_id: {
            type: 'string',
            description: '用户编号，例如 U10086',
          },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_refund_draft',
      description:
        '为已支付订单创建退款草稿。只生成待人工确认的草稿，不会真正退款。退款金额以订单金额为准。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          order_id: {
            type: 'string',
            description: '订单号，例如 O20261009001',
          },
        },
        required: ['order_id'],
      },
    },
  },
];

const HANDLERS = {
  get_users: (args) => getUsers(args.user_id),
  get_user_purchase_records: (args) => getUserPurchaseRecords(args.user_id),
  create_refund_draft: (args) => createRefundDraft(args.order_id),
};

export async function dispatchTool(name, rawArguments) {
  if (!Object.hasOwn(HANDLERS, name)) {
    return {
      ok: false,
      statements: [],
      parsedArgs: null,
      data: { error: `不允许调用工具 ${name}` },
    };
  }

  let args;
  try {
    args = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return {
      ok: false,
      statements: [],
      parsedArgs: null,
      data: { error: '工具参数不是合法 JSON，已拒绝执行' },
    };
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {
      ok: false,
      statements: [],
      parsedArgs: null,
      data: { error: '工具参数必须是 JSON 对象' },
    };
  }

  const validationError = validateArgs(name, args);
  if (validationError) {
    return {
      ok: false,
      statements: [],
      parsedArgs: null,
      data: { error: validationError },
    };
  }

  const cleaned = pickArgs(name, args);
  const result = await HANDLERS[name](cleaned);
  return { ...result, parsedArgs: cleaned };
}

function validateArgs(name, args) {
  if (name === 'get_users') {
    if (args.user_id != null && (typeof args.user_id !== 'string' || !args.user_id.trim())) {
      return 'user_id 必须是非空字符串；查询全部用户时不要传这个参数';
    }
  }
  if (name === 'get_user_purchase_records') {
    if (typeof args.user_id !== 'string' || !args.user_id.trim()) {
      return '缺少有效的 user_id';
    }
  }
  if (name === 'create_refund_draft') {
    if (typeof args.order_id !== 'string' || !args.order_id.trim()) {
      return '缺少有效的 order_id';
    }
  }
  return null;
}

function pickArgs(name, args) {
  if (name === 'get_users') {
    const userId = typeof args.user_id === 'string' ? args.user_id.trim() : '';
    return userId ? { user_id: userId } : {};
  }
  if (name === 'get_user_purchase_records') {
    return { user_id: args.user_id.trim() };
  }
  return { order_id: args.order_id.trim() };
}
