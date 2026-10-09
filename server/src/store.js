import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

const PURCHASE_SQL =
  'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50';
const USERS_SQL = 'SELECT user_id, name FROM users ORDER BY user_id';
const USER_SQL = 'SELECT user_id, name FROM users WHERE user_id = ?';

let chain = Promise.resolve();

function locked(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function seedData() {
  return {
    orders: [
      {
        order_id: 'O20261009001',
        user_id: 'U10086',
        product: '无线耳机',
        amount: 99,
        status: 'paid',
        created_at: '2026-10-09T01:20:00.000Z',
      },
      {
        order_id: 'O20261008012',
        user_id: 'U10086',
        product: '机械键盘',
        amount: 399,
        status: 'paid',
        created_at: '2026-10-08T09:00:00.000Z',
      },
      {
        order_id: 'O20261007003',
        user_id: 'U10086',
        product: '鼠标垫',
        amount: 29.9,
        status: 'paid',
        created_at: '2026-10-07T14:30:00.000Z',
      },
      {
        order_id: 'O20261006021',
        user_id: 'U10010',
        product: '显示器支架',
        amount: 159,
        status: 'paid',
        created_at: '2026-10-06T11:00:00.000Z',
      },
    ],
    refunds: [],
    users: [
      { user_id: 'U10086', name: '陈晓' },
      { user_id: 'U10010', name: '李楠' },
    ],
  };
}

async function writeDb(db) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}

async function ensureDb() {
  try {
    await fs.access(dbPath);
  } catch {
    await writeDb(seedData());
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, 'utf8');
  const db = JSON.parse(raw);
  if (!Array.isArray(db.users)) {
    db.users = seedData().users;
  }
  if (!Array.isArray(db.refunds)) {
    db.refunds = [];
  }
  return db;
}

function roundMoney(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

function publicDraft(draft) {
  return {
    draft_id: draft.draft_id,
    order_id: draft.order_id,
    refund_amount: roundMoney(draft.refund_amount),
    status: draft.status,
    require_approval: Boolean(draft.require_approval),
  };
}

function sortOrders(orders) {
  return orders.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function resetDatabase() {
  return locked(async () => {
    const db = seedData();
    await writeDb(db);
    return db;
  });
}

export function listOrders(userId) {
  return locked(async () => {
    const db = await readDb();
    const orders = sortOrders(
      userId ? db.orders.filter((order) => order.user_id === userId) : db.orders,
    );
    const orderIds = new Set(orders.map((order) => order.order_id));
    return {
      orders,
      refunds: db.refunds.filter((refund) => orderIds.has(refund.order_id)),
    };
  });
}

function publicUser(user) {
  return { user_id: user.user_id, name: user.name };
}

export function getUsers(userId) {
  return locked(async () => {
    const db = await readDb();
    const users = db.users.slice().sort((a, b) => a.user_id.localeCompare(b.user_id));
    if (!userId) {
      return {
        ok: true,
        statements: [{ statement: USERS_SQL, params: [] }],
        data: {
          count: users.length,
          users: users.map(publicUser),
        },
      };
    }
    const statement = { statement: USER_SQL, params: [userId] };
    const user = users.find((item) => item.user_id === userId);
    if (!user) {
      return {
        ok: false,
        statements: [statement],
        data: { error: `用户 ${userId} 不存在` },
      };
    }
    return {
      ok: true,
      statements: [statement],
      data: { count: 1, users: [publicUser(user)] },
    };
  });
}

export function getUserPurchaseRecords(userId) {
  return locked(async () => {
    const statement = { statement: PURCHASE_SQL, params: [userId] };
    const db = await readDb();
    const orders = sortOrders(db.orders.filter((order) => order.user_id === userId)).slice(0, 50);
    return {
      ok: true,
      statements: [statement],
      data: {
        user_id: userId,
        count: orders.length,
        orders,
      },
    };
  });
}

export function createRefundDraft(orderId) {
  return locked(async () => {
    const select = {
      statement: 'SELECT * FROM orders WHERE order_id = ?',
      params: [orderId],
    };
    const db = await readDb();
    const order = db.orders.find((item) => item.order_id === orderId);
    if (!order) {
      return {
        ok: false,
        statements: [select],
        data: { error: `订单 ${orderId} 不存在` },
      };
    }
    if (order.status === 'refunded') {
      return {
        ok: false,
        statements: [select],
        data: { error: `订单 ${orderId} 已退款，不能再次起草` },
      };
    }
    const openDraft = db.refunds.find(
      (refund) => refund.order_id === orderId && refund.status === 'pending_confirm',
    );
    if (openDraft) {
      return {
        ok: false,
        statements: [select],
        data: {
          error: `订单 ${orderId} 已有待确认草稿 ${openDraft.draft_id}`,
          draft: publicDraft(openDraft),
        },
      };
    }

    const draft = {
      draft_id: `RF-${crypto.randomBytes(4).toString('hex')}`,
      order_id: order.order_id,
      refund_amount: roundMoney(order.amount),
      status: 'pending_confirm',
      require_approval: true,
      created_at: new Date().toISOString(),
    };
    db.refunds.push(draft);
    await writeDb(db);
    return {
      ok: true,
      pendingApproval: true,
      statements: [
        select,
        {
          statement:
            "INSERT INTO refunds (draft_id, order_id, refund_amount, status, require_approval) VALUES (?, ?, ?, 'pending_confirm', true)",
          params: [draft.draft_id, draft.order_id, draft.refund_amount],
        },
      ],
      data: publicDraft(draft),
    };
  });
}

export function submitRefund(draftId) {
  return locked(async () => {
    const select = {
      statement: 'SELECT * FROM refunds WHERE draft_id = ?',
      params: [draftId],
    };
    const db = await readDb();
    const draft = db.refunds.find((item) => item.draft_id === draftId);
    if (!draft) {
      return {
        ok: false,
        statements: [select],
        data: { error: `草稿 ${draftId} 不存在` },
      };
    }
    if (draft.status !== 'pending_confirm') {
      return {
        ok: false,
        statements: [select],
        data: { error: `草稿 ${draftId} 当前状态为 ${draft.status}，不能提交` },
      };
    }
    const order = db.orders.find((item) => item.order_id === draft.order_id);
    if (!order) {
      return {
        ok: false,
        statements: [select],
        data: { error: `草稿对应的订单 ${draft.order_id} 不存在` },
      };
    }
    if (order.status === 'refunded') {
      return {
        ok: false,
        statements: [select],
        data: { error: `订单 ${draft.order_id} 已退款` },
      };
    }

    draft.status = 'submitted';
    draft.require_approval = false;
    draft.submitted_at = new Date().toISOString();
    order.status = 'refunded';
    await writeDb(db);
    return {
      ok: true,
      statements: [
        select,
        {
          statement: "UPDATE refunds SET status = 'submitted' WHERE draft_id = ?",
          params: [draftId],
        },
        {
          statement: "UPDATE orders SET status = 'refunded' WHERE order_id = ?",
          params: [order.order_id],
        },
      ],
      data: {
        draft: publicDraft(draft),
        order,
      },
    };
  });
}
