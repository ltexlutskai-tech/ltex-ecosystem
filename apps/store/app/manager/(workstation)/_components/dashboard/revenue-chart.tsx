/**
 * Стовпчиковий графік виручки за місяцями (inline SVG, без npm-залежностей).
 * Спільний компонент: owner-дашборд + віджет робочого столу. Чиста презентація.
 */
export function RevenueChart({
  data,
}: {
  data: { yearMonth: string; revenueEur: number }[];
}) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">Немає даних для графіка</div>;
  }
  const max = Math.max(...data.map((d) => d.revenueEur), 1);
  const w = 800;
  const h = 220;
  const padding = { l: 40, r: 10, t: 10, b: 30 };
  const barW = (w - padding.l - padding.r) / data.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <line
        x1={padding.l}
        y1={h - padding.b}
        x2={w - padding.r}
        y2={h - padding.b}
        stroke="#e5e7eb"
      />
      <line
        x1={padding.l}
        y1={padding.t}
        x2={padding.l}
        y2={h - padding.b}
        stroke="#e5e7eb"
      />
      {data.map((d, i) => {
        const barH = (d.revenueEur / max) * (h - padding.t - padding.b);
        const x = padding.l + i * barW + 4;
        const y = h - padding.b - barH;
        const [year, month] = d.yearMonth.split("-");
        return (
          <g key={d.yearMonth}>
            <rect
              x={x}
              y={y}
              width={Math.max(barW - 8, 4)}
              height={barH}
              fill="#10b981"
              opacity="0.85"
            >
              <title>
                {d.yearMonth}: {d.revenueEur.toLocaleString("uk-UA")} €
              </title>
            </rect>
            <text
              x={x + (barW - 8) / 2}
              y={h - padding.b + 14}
              fontSize="10"
              textAnchor="middle"
              fill="#6b7280"
            >
              {month}.{year?.slice(2)}
            </text>
          </g>
        );
      })}
      <text
        x={padding.l - 4}
        y={padding.t + 8}
        fontSize="10"
        textAnchor="end"
        fill="#6b7280"
      >
        {max.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} €
      </text>
      <text
        x={padding.l - 4}
        y={h - padding.b - 2}
        fontSize="10"
        textAnchor="end"
        fill="#6b7280"
      >
        0
      </text>
    </svg>
  );
}
