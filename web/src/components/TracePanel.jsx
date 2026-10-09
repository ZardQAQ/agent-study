const STAGE_HINT = {
  intent: '模型选定的意图',
  params: '从原话里抽出的参数',
  tool: '实际发起的函数调用',
  sql: '工具层执行的等价语句',
  result: '工具返回给模型的数据',
  reply: '模型根据工具结果写成的回复',
};

export default function TracePanel({ trace, trackingId }) {
  return (
    <aside className="trace">
      <header className="trace-head">
        <p className="eyebrow">执行轨迹</p>
        <h2>这一轮 Agent 做了什么</h2>
        <p className="tracking">Tracking ID {trackingId}</p>
      </header>
      {trace.length === 0 ? (
        <p className="trace-empty">
          发送一句话后，这里会按顺序展示：识别意图、提取参数、调用工具、工具层语句、整理回复。
        </p>
      ) : (
        <ol className="trace-list">
          {trace.map((step, index) => (
            <li key={`${step.stage}-${index}`} className={`trace-step stage-${step.stage}`}>
              <div className="trace-kicker">
                <span>{step.kicker || (step.group ? `意图 ${step.group}` : '收尾')}</span>
                <strong>{step.title}</strong>
              </div>
              <p className="trace-hint">{STAGE_HINT[step.stage]}</p>
              {step.text ? <pre>{step.text}</pre> : null}
              {step.statements?.map((item, statementIndex) => (
                <pre key={statementIndex}>
                  {item.statement}
                  {item.params?.length ? `\n-- params: ${JSON.stringify(item.params)}` : ''}
                </pre>
              ))}
              {step.data ? <pre>{JSON.stringify(step.data, null, 2)}</pre> : null}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
