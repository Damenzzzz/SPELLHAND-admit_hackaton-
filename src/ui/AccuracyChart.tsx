import type { SessionRecord } from '../game/progress';

/** Точность по сессиям: линия + точки, 0–100%. Без библиотек — чистый SVG. */
export function AccuracyChart({ history, width = 420, height = 150 }: { history: SessionRecord[]; width?: number; height?: number }) {
  const data = history.slice(-20);
  if (data.length < 2) return <p className="muted">Сыграй пару боёв — здесь появится график точности.</p>;
  const pad = 24;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (data.length - 1);
  const y = (v: number) => height - pad - v * (height - pad * 2);
  const line = data.map((s, i) => `${x(i)},${y(s.accuracy)}`).join(' ');

  return (
    <svg className="acc-chart" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Точность по сессиям">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={pad} x2={width - pad} y1={y(v)} y2={y(v)} className="acc-grid" />
          <text x={4} y={y(v) + 4} className="acc-axis">
            {v * 100}%
          </text>
        </g>
      ))}
      <polyline points={line} className="acc-line" />
      {data.map((s, i) => (
        <circle key={s.at + i} cx={x(i)} cy={y(s.accuracy)} r={4} className={`acc-dot acc-${s.mode}`}>
          <title>{`${Math.round(s.accuracy * 100)}% · ${s.mode}`}</title>
        </circle>
      ))}
    </svg>
  );
}
