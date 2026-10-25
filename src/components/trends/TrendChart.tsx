import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint, ChartRow } from "../../lib/trends";
import { toChartRows } from "../../lib/trends";
import { formatDate, formatNumber, formatShortDate } from "../../lib/format";
import { VERIFICATION_LABEL } from "../../lib/journey";
import type { VerificationStatus } from "../../types/health";

/**
 * Line chart of RECORDED values (Phase 6). Presentation only.
 *  - one line per series (e.g. systolic + diastolic, or each glucose context)
 *  - dot colour shows where a value came from (entered / from report / calculated)
 *  - optional shaded bands come from the EXISTING reference ranges
 *  - an accessible data table is always available below the chart
 * No extrapolation: lines only connect recorded points.
 */

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: TrendPoint[];
}

export interface ChartBand {
  from: number;
  to?: number;
  color: string;
  label: string;
}

/** Values that came from a reviewed report get a light ring around the dot. */
const FROM_REPORT: Record<VerificationStatus, boolean> = {
  manual: false,
  calculated: false,
  report_confirmed: true,
  report_edited: true,
  report_added: true,
};

export default function TrendChart({
  title,
  unit,
  series,
  bands = [],
}: {
  title: string;
  unit: string;
  series: ChartSeries[];
  bands?: ChartBand[];
}) {
  const rows: ChartRow[] = toChartRows(Object.fromEntries(series.map((s) => [s.key, s.points])));
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.25);
  const domain: [number, number] = [Math.floor(min - pad), Math.ceil(max + pad)];

  return (
    <figure className="mt-4">
      <div aria-hidden="true" className="h-52 -ml-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            {bands.map((b) => (
              <ReferenceArea
                key={b.label}
                y1={b.from}
                y2={b.to ?? domain[1]}
                fill={b.color}
                fillOpacity={0.08}
                ifOverflow="hidden"
              />
            ))}
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="rgba(255,255,255,0.1)"
              minTickGap={16}
            />
            <YAxis
              domain={domain}
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="rgba(255,255,255,0.1)"
              width={44}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-white/10 bg-[#0b1d19] px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold text-white">{formatDate(String(label))}</p>
                    {payload.map((item) => {
                      const s = series.find((x) => x.key === item.dataKey);
                      const v = (item.payload as ChartRow)[`${String(item.dataKey)}__v`] as VerificationStatus | undefined;
                      return (
                        <p key={String(item.dataKey)} className="text-slate-300 mt-1">
                          {s?.label}: <span className="font-semibold">{formatNumber(Number(item.value))} {unit}</span>
                          {v && <span className="block text-slate-500">{VERIFICATION_LABEL[v]}</span>}
                        </p>
                      );
                    })}
                  </div>
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload, index } = props as { cx?: number; cy?: number; payload: ChartRow; index: number };
                  if (cx === undefined || cy === undefined || payload[s.key] === undefined) {
                    return <g key={`${s.key}-${index}`} />;
                  }
                  const fromReport = FROM_REPORT[payload[`${s.key}__v`] as VerificationStatus];
                  return (
                    <circle
                      key={`${s.key}-${index}`}
                      cx={cx}
                      cy={cy}
                      r={fromReport ? 5.5 : 4.5}
                      fill={s.color}
                      stroke={fromReport ? "#e0f2fe" : "#071512"}
                      strokeWidth={fromReport ? 2.5 : 1.5}
                    />
                  );
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" /> Entered by you</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-sky-100" /> From a report (reviewed)</span>
        {bands.length > 0 && <span>Shaded: reference ranges</span>}
      </figcaption>

      <details className="mt-3">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
          Show recorded values as a table
        </summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <caption className="sr-only">{title} - recorded values</caption>
            <thead>
              <tr className="text-left text-slate-500">
                <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-1 pr-3 font-medium">{s.label} ({unit})</th>
                ))}
                <th scope="col" className="py-1 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5 text-slate-300">
                  <td className="py-1 pr-3">{formatDate(r.date)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3">
                      {r[s.key] === undefined ? "--" : formatNumber(Number(r[s.key]))}
                    </td>
                  ))}
                  <td className="py-1 text-slate-500">
                    {[...new Set(series.map((s) => r[`${s.key}__v`]).filter(Boolean))]
                      .map((v) => VERIFICATION_LABEL[v as VerificationStatus])
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
