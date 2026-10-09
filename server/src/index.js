import cors from 'cors';
import express from 'express';
import { runAgent } from './agent.js';
import { TRACKING_ID } from './config.js';
import { listOrders, resetDatabase } from './store.js';
import { submitRefund } from './tools.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/orders', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const data = await listOrders(userId);
    res.json({ trackingId: TRACKING_ID, ...data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = req.body?.message;
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: '请输入要查询的内容' });
      return;
    }
    if (message.length > 2000) {
      res.status(400).json({ error: '输入过长' });
      return;
    }
    const result = await runAgent({
      message: message.trim(),
      history: req.body?.history,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/refunds/:draftId/submit', async (req, res) => {
  try {
    const result = await submitRefund(req.params.draftId);
    res.status(result.ok ? 200 : 400).json({
      trackingId: TRACKING_ID,
      ...result,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/reset', async (_req, res) => {
  try {
    await resetDatabase();
    res.json({ ok: true, trackingId: TRACKING_ID });
  } catch (error) {
    sendError(res, error);
  }
});

function sendError(res, error) {
  const status = Number(error.status) || 500;
  const message = publicMessage(error);
  console.error(message);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
}

function publicMessage(error) {
  if (error?.status === 401) {
    return 'DeepSeek 拒绝了密钥，请检查 .env 里的 DEEPSEEK_API_KEY';
  }
  const raw = error?.message || '服务暂时不可用';
  const secret = process.env.DEEPSEEK_API_KEY;
  const redacted = secret ? raw.replaceAll(secret, '[redacted]') : raw;
  return redacted.slice(0, 500);
}

const port = Number(process.env.PORT) || 5174;
app.listen(port, () => {
  console.log(`api http://localhost:${port}`);
});
