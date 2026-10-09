# 订单助手：工具调用演示

这是一个本地可运行的教学 demo。用户用中文提要求，DeepSeek 负责识别意图、提取参数，并把结果写成可读回复。查数据和退款都在工具层完成，模型碰不到数据库，也不能自己提交退款。

## 怎么运行

需要 Node.js 20 或以上。

```bash
npm install
npm install --prefix server
npm install --prefix web
```

仓库里的 `.env` 只有占位符。运行前把 `DEEPSEEK_API_KEY` 改成你自己的 DeepSeek 密钥：

```
DEEPSEEK_API_KEY="写你自己的API KEY"
DEEPSEEK_MODEL=deepseek-chat
```

在项目根目录启动页面和接口：

```bash
npm run dev
```

- 页面：http://localhost:5173/
- 接口：http://localhost:5174

页面上的「场景 1」「场景 2」会填入示例问句。底部可以查看当前订单，也可以重置种子数据。

如果页面报 `ECONNREFUSED`，通常是只启动了前端，5174 上的接口没有起来。用根目录的 `npm run dev` 会两边一起启动。

## 两条示例链路

场景 1：只查购买记录。

用户说「帮我找找用户 U10086 的购买记录」。模型调用 `get_user_purchase_records(user_id="U10086")`。工具层按下面的语句从本地 JSON 里取出最近 50 条订单，再由模型整理成中文回复。

```sql
SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
```

场景 2：先查单，再起草退款，最后由人确认。

用户说「查用户 U10086 的购买记录，并帮他退订单 O20261009001」。模型会先后调用：

1. `get_user_purchase_records(user_id="U10086")`
2. `create_refund_draft(order_id="O20261009001")`

退款工具只生成草稿，例如：

```json
{
  "draft_id": "RF-xxx",
  "order_id": "O20261009001",
  "refund_amount": 99,
  "status": "pending_confirm",
  "require_approval": true
}
```

页面会问「是否确认提交退款？」。点确认后，前端调用 `POST /api/refunds/:draftId/submit`。这个提交动作不在模型的工具列表里，模型无法跳过确认。点取消则草稿保留，订单不会退款。

也可以问「这个系统有多少用户」。模型会调用 `get_users()`，不传 `user_id` 时返回全部用户和总数。

## 种子数据

首次运行、或数据文件不存在时，会写入这些用户和订单：

| 用户 | 姓名 | 订单 |
| --- | --- | --- |
| U10086 | 陈晓 | O20261009001 无线耳机 99 元，O20261008012 机械键盘 399 元，O20261007003 鼠标垫 29.90 元 |
| U10010 | 李楠 | O20261006021 显示器支架 159 元 |

订单默认都是已支付。退款金额取订单上的金额，不采用模型填写的金额。同一订单已有待确认草稿，或已经退款时，不能再次起草。

数据写在 `server/data/db.json`。这个文件被 git 忽略，重置后会回到上面的种子数据。

## 代码分别做什么

- `server/src/agent.js`：调用 DeepSeek，最多 4 轮。同一轮里若同时要查单和退款，先查单再起草。
- `server/src/tools.js`：给模型的工具定义，以及参数校验。白名单里只有 `get_users`、`get_user_purchase_records`、`create_refund_draft`。
- `server/src/store.js`：读写 JSON，并在轨迹里带上等价 SQL。
- `server/src/index.js`：`POST /api/chat`、`GET /api/orders`、`POST /api/refunds/:draftId/submit`、`POST /api/reset`。
- `web/src/App.jsx`：对话、两个场景按钮、退款确认卡。
- `web/src/components/TracePanel.jsx`：按「识别意图、提取参数、调用工具、工具层、工具返回、整理回复」展示这一轮发生了什么。

## 接口

`POST /api/chat`

```json
{ "message": "帮我找找用户 U10086 的购买记录", "history": [] }
```

返回回复、逐步轨迹、待确认草稿和 Tracking ID。

`POST /api/refunds/:draftId/submit` 只在用户点确认后调用。成功后草稿变为 `submitted`，订单变为 `refunded`。

## 密钥

仓库里的 `.env` 不含真实密钥。填入自己的 key 之后，不要把真实密钥再推到这个公开仓库。
