"use client";

import { useEffect, useState } from "react";

const SUPABASE_URL = "https://hkomutmuonfntowvdgjc.supabase.co";
const SAMPLE_INTERVAL_MINUTES = 5;
const ALARM_THRESHOLD_MINUTES = 30;

const theme = {
  bg: "#080812", card: "#17172a", card2: "#1f1f3a", border: "#34235f",
  primary: "#7c3aed", primaryLight: "#a78bfa", primaryDark: "#4c1d95",
  text: "#f4f4f5", muted: "#a1a1aa", ok: "#22c55e", warning: "#f59e0b", error: "#ef4444"
};

const sensorColors = ["#a78bfa", "#ef4444", "#ec4899", "#22c55e", "#e5e7eb", "#38bdf8", "#f59e0b", "#14b8a6", "#f97316"];
const sensorDescriptions = [
  "Referência ambiente",
  "M2, provável origem da quebra",
  "M2, região crítica fraturada",
  "M4, origem da trinca",
  "M4, caixa de junção",
  "M3, região associada à trinca",
  "M3, região íntegra de referência",
  "M1, região íntegra de referência",
  "M1, região associada à trinca"
];

const sensorSeries = Array.from({ length: 9 }, (_, i) => ({
  key: "temp_sensor" + (i + 1),
  label: "Sensor " + (i + 1),
  description: sensorDescriptions[i],
  color: sensorColors[i]
}));

function formatDate(v) {
  if (!v) return "-";
  return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function formatTime(v) {
  if (!v) return "-";
  return new Date(v).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(v) {
  if (!v) return "-";
  const d = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 1000));
  if (d < 60) return d + "s atrás";
  if (d < 3600) return Math.floor(d / 60) + " min atrás";
  if (d < 86400) return Math.floor(d / 3600) + " h atrás";
  return Math.floor(d / 86400) + " dia(s) atrás";
}
function todayBrazil() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function isValidTemp(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  if (!Number.isFinite(n) || n === -1 || n === -127) return false;
  return n >= -55 && n <= 125;
}
function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? h + "h " + rest + "min" : h + "h";
}
function sortRowsAsc(rows) {
  return [...(rows || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function analyzeSensor(rows, key) {
  const data = sortRowsAsc(rows);
  let validCount = 0, invalidCount = 0, min = null, max = null, sum = 0, latestValid = null, active = null;
  const occurrences = [];

  data.forEach((row) => {
    if (isValidTemp(row[key])) {
      const value = Number(row[key]);
      validCount += 1;
      sum += value;
      min = min === null ? value : Math.min(min, value);
      max = max === null ? value : Math.max(max, value);
      latestValid = { value, created_at: row.created_at };

      if (active) {
        const durationMinutes = active.invalidCount * SAMPLE_INTERVAL_MINUTES;
        occurrences.push({
          start: active.start,
          end: row.created_at,
          lastInvalid: active.lastInvalid,
          invalidCount: active.invalidCount,
          durationMinutes,
          alarm: durationMinutes > ALARM_THRESHOLD_MINUTES,
          open: false
        });
        active = null;
      }
      return;
    }

    invalidCount += 1;
    if (!active) {
      active = { start: row.created_at, lastInvalid: row.created_at, invalidCount: 1 };
    } else {
      active.lastInvalid = row.created_at;
      active.invalidCount += 1;
    }
  });

  if (active) {
    const durationMinutes = active.invalidCount * SAMPLE_INTERVAL_MINUTES;
    occurrences.push({
      start: active.start,
      end: null,
      lastInvalid: active.lastInvalid,
      invalidCount: active.invalidCount,
      durationMinutes,
      alarm: durationMinutes > ALARM_THRESHOLD_MINUTES,
      open: true
    });
  }

  const total = validCount + invalidCount;
  const totalDowntimeMinutes = invalidCount * SAMPLE_INTERVAL_MINUTES;
  const longestDowntimeMinutes = occurrences.reduce((acc, item) => Math.max(acc, item.durationMinutes), 0);
  const alarms = occurrences.filter((item) => item.alarm);
  const availability = total ? (validCount / total) * 100 : null;
  const latestRow = data.length ? data[data.length - 1] : null;
  const currentFailureMinutes =
    latestRow && !isValidTemp(latestRow[key]) && occurrences.length
      ? occurrences[occurrences.length - 1].durationMinutes
      : 0;

  return {
    validCount, invalidCount, totalDowntimeMinutes, longestDowntimeMinutes,
    availability, occurrences, alarms, latestValid, latestRow, currentFailureMinutes,
    min, max, avg: validCount ? sum / validCount : null
  };
}

function Card({ title, subtitle, children, style = {}, contentStyle = {} }) {
  return (
    <section style={{
      background: "linear-gradient(180deg," + theme.card + "," + theme.card2 + ")",
      border: "1px solid " + theme.border, borderRadius: 18, padding: 20,
      boxShadow: "0 18px 45px rgba(0,0,0,.35)", boxSizing: "border-box",
      ...style
    }}>
      <h2 style={{ margin: 0, color: theme.text, fontSize: 20 }}>{title}</h2>
      {subtitle && <p style={{ marginTop: 6, color: theme.muted, fontSize: 13 }}>{subtitle}</p>}
      <div style={{ marginTop: 14, ...contentStyle }}>{children}</div>
    </section>
  );
}

function Button({ children, onClick, color = theme.primary, danger = false }) {
  return (
    <button onClick={onClick} style={{
      background: danger ? theme.error : color, color: "white", border: "none",
      borderRadius: 10, padding: "11px 15px", marginRight: 10, marginBottom: 10,
      fontWeight: 700, cursor: "pointer"
    }}>{children}</button>
  );
}

function DateInput({ value, onChange }) {
  return <input type="date" value={value} onChange={onChange} style={{
    background: "#0f1020", color: theme.text, border: "1px solid " + theme.border,
    borderRadius: 10, padding: 10, marginRight: 10, marginBottom: 10
  }} />;
}

function StatusDot({ ok, labelOk = "OK", labelFail = "Falha" }) {
  const color = ok ? theme.ok : theme.error;
  return <span style={{ color, fontWeight: 700 }}>
    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color, marginRight: 8 }} />
    {ok ? labelOk : labelFail}
  </span>;
}

function SensorBox({ sensor, latestValue, analysis, selected, onClick }) {
  const latestIsValid = isValidTemp(latestValue);
  const shownValue = latestIsValid
    ? Number(latestValue)
    : analysis && analysis.latestValid
      ? analysis.latestValid.value
      : null;
  const failureMinutes = latestIsValid ? 0 : (analysis ? analysis.currentFailureMinutes : 0);
  const alarm = failureMinutes > ALARM_THRESHOLD_MINUTES;
  const statusColor = latestIsValid ? theme.ok : alarm ? theme.error : theme.warning;
  const statusText = latestIsValid ? "OK" : alarm ? "ALARME" : "Sem leitura";

  return (
    <button type="button" onClick={onClick} title="Clique para selecionar ou remover este sensor da análise" style={{
      textAlign: "left", width: "100%",
      background: selected ? "rgba(124,58,237,.18)" : "rgba(255,255,255,.055)",
      border: "1px solid " + (selected ? sensor.color : theme.border),
      borderRadius: 12, padding: 10, color: theme.text, cursor: "pointer",
      boxShadow: selected ? "0 0 0 1px " + sensor.color : "none",
      minHeight: 0
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ color: theme.muted, fontSize: 12 }}>{sensor.label}</span>
        <span style={{ color: statusColor, fontSize: 11, fontWeight: 800 }}>● {statusText}</span>
      </div>
      <div style={{ marginTop: 4, minHeight: 24, color: "#d4d4dc", fontSize: 9.5, lineHeight: 1.2 }}>
        {sensor.description}
      </div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800 }}>
        {shownValue === null ? "-" : shownValue.toFixed(2)} <span style={{ fontSize: 12, color: theme.muted }}>°C</span>
      </div>
      {!latestIsValid && shownValue !== null && <div style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>última leitura válida</div>}
      <div style={{ marginTop: 5, color: theme.muted, fontSize: 9, lineHeight: 1.3 }}>
        <div>Última válida: {analysis && analysis.latestValid ? formatTime(analysis.latestValid.created_at) : "-"}</div>
        <div>Falha hoje: {analysis ? formatDuration(analysis.totalDowntimeMinutes) : "-"}</div>
        {!latestIsValid && <div style={{ color: statusColor }}>Sem leitura agora: {formatDuration(failureMinutes)}</div>}
      </div>
    </button>
  );
}

function SensorSelector({ selectedKeys, onToggle, onAll, onClear }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
      {sensorSeries.map((sensor) => {
        const selected = selectedKeys.includes(sensor.key);
        return <button type="button" key={sensor.key} onClick={() => onToggle(sensor.key)} style={{
          background: selected ? sensor.color : "#111122",
          color: selected ? "#080812" : theme.text,
          border: "1px solid " + sensor.color, borderRadius: 999,
          padding: "7px 11px", fontWeight: 800, cursor: "pointer"
        }}>{sensor.label}</button>;
      })}
      <button type="button" onClick={onAll} style={{ background: "transparent", color: theme.primaryLight, border: "none", cursor: "pointer", fontWeight: 700 }}>Todos</button>
      <button type="button" onClick={onClear} style={{ background: "transparent", color: theme.muted, border: "none", cursor: "pointer", fontWeight: 700 }}>Limpar</button>
    </div>
  );
}

function TemperatureAnalysisChart({ rows, selectedKeys, analyses, mode }) {
  const data = sortRowsAsc(rows);
  if (!data.length) return <p style={{ color: theme.muted }}>Sem dados para o dia selecionado.</p>;
  if (!selectedKeys.length) return <p style={{ color: theme.muted }}>Selecione pelo menos um sensor.</p>;

  const width = 960, height = 390, paddingLeft = 58, paddingRight = 24, paddingTop = 28, paddingBottom = 62;
  const plotHeight = height - paddingTop - paddingBottom;
  const plotWidth = width - paddingLeft - paddingRight;
  const firstTime = new Date(data[0].created_at).getTime();
  const lastTime = new Date(data[data.length - 1].created_at).getTime();
  const timeRange = Math.max(1, lastTime - firstTime);

  const values = data.flatMap((row) => selectedKeys.map((key) => row[key]).filter(isValidTemp).map(Number));
  if (!values.length) return <p style={{ color: theme.muted }}>Sem temperaturas válidas para os sensores selecionados.</p>;

  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const range = Math.max(1, max - min);
  const xTime = (createdAt) => paddingLeft + ((new Date(createdAt).getTime() - firstTime) * plotWidth) / timeRange;
  const y = (value) => paddingTop + ((max - value) * plotHeight) / range;

  function buildPoints(key) {
    let lastValid = null;
    return data.map((row) => {
      const valid = isValidTemp(row[key]);
      if (valid) lastValid = Number(row[key]);
      return {
        created_at: row.created_at,
        rawValid: valid,
        rawValue: valid ? Number(row[key]) : null,
        displayValue: valid ? Number(row[key]) : lastValid,
        imputed: !valid && lastValid !== null
      };
    });
  }

  function renderSensorSegments(sensor) {
    const points = buildPoints(sensor.key);
    const segments = [];

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const gapMs = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      const gapTooLarge = gapMs > SAMPLE_INTERVAL_MINUTES * 2.5 * 60 * 1000;

      if (mode === "raw") {
        if (!a.rawValid || !b.rawValid || gapTooLarge) continue;
        segments.push(
          <line
            key={sensor.key + "-raw-" + i}
            x1={xTime(a.created_at)} y1={y(a.rawValue)}
            x2={xTime(b.created_at)} y2={y(b.rawValue)}
            stroke={sensor.color} strokeWidth="2.6" strokeLinecap="round"
          />
        );
        continue;
      }

      if (a.displayValue === null || b.displayValue === null) continue;
      const estimated = a.imputed || b.imputed || gapTooLarge;

      segments.push(
        <line
          key={sensor.key + "-treated-" + i}
          x1={xTime(a.created_at)} y1={y(a.displayValue)}
          x2={xTime(b.created_at)} y2={y(b.displayValue)}
          stroke={sensor.color}
          strokeWidth={estimated ? "2.1" : "2.6"}
          strokeOpacity={estimated ? "0.58" : "1"}
          strokeDasharray={estimated ? "6 5" : undefined}
          strokeLinecap="round"
        />
      );
    }

    return segments;
  }

  const selectedSensors = sensorSeries.filter((s) => selectedKeys.includes(s.key));
  const alarmIntervals = selectedSensors.flatMap((sensor) =>
    (analyses[sensor.key] ? analyses[sensor.key].alarms : []).map((occ) => ({ ...occ, sensor }))
  );
  const tickCount = 7;
  const timeTicks = Array.from({ length: tickCount }, (_, i) => new Date(firstTime + (i * timeRange) / (tickCount - 1)));

  return (
    <div style={{ width: "100%", minWidth: 0, overflow: "hidden" }}>
      <svg
        viewBox={"0 0 " + width + " " + height}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          background: "linear-gradient(180deg,#111122,#0b0b14)",
          border: "1px solid " + theme.border,
          borderRadius: 16
        }}
      >
        {alarmIntervals.map((occ, index) => {
          const x1 = xTime(occ.start);
          const endRef = occ.end || occ.lastInvalid || occ.start;
          const x2 = Math.max(x1 + 3, xTime(endRef));
          return <rect key={occ.sensor.key + "-alarm-" + index} x={x1} y={paddingTop} width={Math.max(3, x2 - x1)} height={plotHeight} fill={theme.error} opacity="0.055" />;
        })}

        {[0, .25, .5, .75, 1].map((p) => {
          const yy = paddingTop + p * plotHeight;
          return <line key={p} x1={paddingLeft} y1={yy} x2={width - paddingRight} y2={yy} stroke="#2a2148" />;
        })}

        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={paddingTop + plotHeight} stroke="#4b3b78" />
        <line x1={paddingLeft} y1={paddingTop + plotHeight} x2={width - paddingRight} y2={paddingTop + plotHeight} stroke="#4b3b78" />
        <text x={10} y={paddingTop + 4} fontSize="12" fill={theme.muted}>{max} °C</text>
        <text x={10} y={paddingTop + plotHeight} fontSize="12" fill={theme.muted}>{min} °C</text>

        {timeTicks.map((tick, i) => <text key={i} x={paddingLeft + (i * plotWidth) / (tickCount - 1)} y={height - 18} fontSize="11" textAnchor="middle" fill={theme.muted}>
          {tick.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
        </text>)}

        {selectedSensors.flatMap((sensor) => renderSensorSegments(sensor))}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
        {selectedSensors.map((sensor) => <span key={sensor.key} style={{ fontSize: 12, color: theme.text }}>
          <span style={{ color: sensor.color, fontWeight: 900 }}>●</span> {sensor.label}
        </span>)}
        {mode === "raw"
          ? <span style={{ fontSize: 12, color: theme.muted }}>lacunas = ausência de leitura válida</span>
          : <span style={{ fontSize: 12, color: theme.muted }}>tracejado = último valor válido mantido apenas para visualização</span>}
        <span style={{ fontSize: 12, color: theme.error }}>faixa discreta = falha &gt; 30 min</span>
      </div>
    </div>
  );
}

function IntegrityPanel({ selectedSensors, analyses, date }) {
  const [detailKey, setDetailKey] = useState(null);
  const [showShort, setShowShort] = useState(false);

  useEffect(() => {
    if (detailKey && !selectedSensors.some((sensor) => sensor.key === detailKey)) {
      setDetailKey(null);
      setShowShort(false);
    }
  }, [selectedSensors, detailKey]);

  if (!selectedSensors.length) {
    return <p style={{ color: theme.muted }}>Selecione sensores para visualizar a integridade da aquisição.</p>;
  }

  const detailSensor = selectedSensors.find((sensor) => sensor.key === detailKey) || null;
  const detail = detailSensor ? analyses[detailSensor.key] : null;
  const alarmOccurrences = detail ? detail.occurrences.filter((occ) => occ.alarm) : [];
  const shortOccurrences = detail ? detail.occurrences.filter((occ) => !occ.alarm) : [];

  function statusFor(analysis) {
    if (!analysis) return { label: "Sem dados", color: theme.muted, symbol: "○" };
    if (analysis.alarms.length > 0) return { label: "ALARME", color: theme.error, symbol: "⚠" };
    if (analysis.invalidCount > 0) return { label: "ATENÇÃO", color: theme.warning, symbol: "●" };
    return { label: "OK", color: theme.ok, symbol: "●" };
  }

  function toggleDetails(key) {
    setShowShort(false);
    setDetailKey((current) => current === key ? null : key);
  }

  return <div>
    <div style={{ overflowX: "auto", border: "1px solid " + theme.border, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, fontSize: 10.5 }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,.03)", color: theme.muted, textAlign: "left" }}>
            <th style={{ padding: "7px 10px" }}>Sensor</th>
            <th style={{ padding: "7px 10px" }}>Disponibilidade</th>
            <th style={{ padding: "7px 10px" }}>Falha total</th>
            <th style={{ padding: "7px 10px" }}>Maior falha</th>
            <th style={{ padding: "7px 10px" }}>Alarmes</th>
            <th style={{ padding: "7px 10px" }}>Status</th>
            <th style={{ padding: "7px 10px", width: 82 }}></th>
          </tr>
        </thead>
        <tbody>
          {selectedSensors.map((sensor) => {
            const a = analyses[sensor.key];
            const status = statusFor(a);
            const availability = a && a.availability !== null ? a.availability : 0;
            const expanded = sensor.key === detailKey;

            return <tr key={sensor.key} style={{
              borderTop: "1px solid " + theme.border,
              background: expanded ? "rgba(124,58,237,.07)" : "transparent"
            }}>
              <td style={{ padding: "7px 10px" }}>
                <b style={{ color: sensor.color }}>{sensor.label}</b>
                <span style={{ color: theme.muted, marginLeft: 7, fontSize: 9 }}>{sensor.description}</span>
              </td>
              <td style={{ padding: "7px 10px", minWidth: 120 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <b>{a && a.availability !== null ? a.availability.toFixed(1) + "%" : "-"}</b>
                  <div style={{ width: 58, height: 4, borderRadius: 999, background: "#10101d", overflow: "hidden" }}>
                    <div style={{
                      width: Math.max(0, Math.min(100, availability)) + "%",
                      height: "100%", borderRadius: 999, background: status.color
                    }} />
                  </div>
                </div>
              </td>
              <td style={{ padding: "7px 10px" }}><b>{a ? formatDuration(a.totalDowntimeMinutes) : "-"}</b></td>
              <td style={{ padding: "7px 10px" }}><b>{a ? formatDuration(a.longestDowntimeMinutes) : "-"}</b></td>
              <td style={{ padding: "7px 10px" }}>
                <b style={{ color: a && a.alarms.length ? theme.error : theme.text }}>{a ? a.alarms.length : "-"}</b>
              </td>
              <td style={{ padding: "7px 10px", color: status.color, fontWeight: 800, whiteSpace: "nowrap" }}>{status.symbol} {status.label}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>
                <button type="button" onClick={() => toggleDetails(sensor.key)} style={{
                  background: expanded ? theme.primary : "transparent",
                  color: expanded ? "white" : theme.primaryLight,
                  border: "1px solid " + theme.border, borderRadius: 8,
                  padding: "5px 8px", cursor: "pointer", fontSize: 9, fontWeight: 800
                }}>
                  {expanded ? "Fechar" : "Detalhes"}
                </button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {!detail && <p style={{ color: theme.muted, fontSize: 9.5, margin: "8px 2px 0" }}>
      Clique em “Detalhes” somente quando quiser inspecionar as ocorrências de um sensor.
    </p>}

    {detail && <div style={{
      marginTop: 10, border: "1px solid " + theme.border, borderRadius: 10,
      padding: 11, background: "rgba(255,255,255,.02)"
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div>
          <b style={{ color: detailSensor.color, fontSize: 13 }}>{detailSensor.label}</b>
          <span style={{ color: theme.muted, fontSize: 9, marginLeft: 8 }}>{detailSensor.description}</span>
        </div>
        {(() => {
          const status = statusFor(detail);
          return <span style={{ color: status.color, fontSize: 10, fontWeight: 800 }}>{status.symbol} {status.label}</span>;
        })()}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
        {[
          ["Falha", formatDuration(detail.totalDowntimeMinutes)],
          ["Maior", formatDuration(detail.longestDowntimeMinutes)],
          ["Disp.", detail.availability === null ? "-" : detail.availability.toFixed(1) + "%"],
          ["Inválidas", detail.invalidCount],
          ["Mín/Máx", detail.min === null ? "-" : detail.min.toFixed(1) + "/" + detail.max.toFixed(1) + " °C"],
          ["Média", detail.avg === null ? "-" : detail.avg.toFixed(1) + " °C"]
        ].map(([label, value]) => <span key={label} style={{
          border: "1px solid " + theme.border, borderRadius: 999,
          padding: "5px 8px", background: "rgba(255,255,255,.03)", fontSize: 9.5
        }}>
          <span style={{ color: theme.muted }}>{label}: </span><b>{value}</b>
        </span>)}
      </div>

      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid " + theme.border }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
          <b style={{ fontSize: 10.5 }}>Alarmes &gt; 30 min</b>
          <span style={{ color: alarmOccurrences.length ? theme.error : theme.ok, fontSize: 9.5, fontWeight: 800 }}>
            {alarmOccurrences.length ? alarmOccurrences.length + " ocorrência(s)" : "Nenhum"}
          </span>
        </div>

        {alarmOccurrences.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
          {alarmOccurrences.map((occ, index) => <span key={index} style={{
            border: "1px solid rgba(239,68,68,.5)", background: "rgba(239,68,68,.06)",
            borderRadius: 999, padding: "5px 8px", color: theme.error, fontSize: 9.5, fontWeight: 700
          }}>
            {formatTime(occ.start)}–{occ.end ? formatTime(occ.end) : "fim"} · {formatDuration(occ.durationMinutes)}
          </span>)}
        </div>}
      </div>

      <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid " + theme.border }}>
        <button type="button" onClick={() => setShowShort((v) => !v)} style={{
          background: "transparent", color: theme.muted, border: "none",
          padding: 0, cursor: "pointer", fontSize: 9.5, fontWeight: 700
        }}>
          {showShort ? "Ocultar" : "Ver"} interrupções curtas ({shortOccurrences.length})
        </button>

        {showShort && shortOccurrences.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
          {shortOccurrences.map((occ, index) => <span key={index} style={{
            border: "1px solid " + theme.border, background: "rgba(255,255,255,.025)",
            borderRadius: 999, padding: "4px 7px", color: theme.muted, fontSize: 8.8
          }}>
            {formatTime(occ.start)}–{occ.end ? formatTime(occ.end) : "fim"} · {formatDuration(occ.durationMinutes)}
          </span>)}
        </div>}
      </div>
    </div>}
  </div>;
}

function buildCSV(rows) {
  const headers = ["data", "hora", "created_at", ...sensorSeries.map((s) => s.key), "cam_ok", "sd_ok", "status", "error"];
  const body = rows.map((r) => {
    const dataLocal = new Date(r.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const horaLocal = new Date(r.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const values = [dataLocal, horaLocal, r.created_at || "", ...sensorSeries.map((s) => r[s.key] ?? ""), r.cam_ok ?? "", r.sd_ok ?? "", r.status ?? "", r.error ?? ""];
    return values.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(";");
  });
  return [headers.join(";"), ...body].join("\n");
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [todayHistory, setTodayHistory] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [startDate, setStartDate] = useState(todayBrazil());
  const [endDate, setEndDate] = useState(todayBrazil());
  const [selectedDate, setSelectedDate] = useState(todayBrazil());
  const [chartDate, setChartDate] = useState(todayBrazil());
  const [selectedSensors, setSelectedSensors] = useState(["temp_sensor1"]);
  const [viewMode, setViewMode] = useState("treated");

  async function loadData() {
    try {
      const today = todayBrazil();
      const requests = [
        fetch("/api/latest").then((r) => r.json()),
        fetch("/api/history?start=" + chartDate + "&end=" + chartDate + "&limit=5000").then((r) => r.json()),
        fetch("/api/photos").then((r) => r.json())
      ];

      if (chartDate !== today) {
        requests.push(fetch("/api/history?start=" + today + "&end=" + today + "&limit=5000").then((r) => r.json()));
      }

      const result = await Promise.all(requests);
      setData(result[0].data);
      setHistory(result[1].data || []);
      setPhotos(result[2].data || []);
      setTodayHistory(chartDate === today ? (result[1].data || []) : ((result[3] && result[3].data) || []));
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    }
  }

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, [chartDate]);

  function toggleSensor(key) {
    setSelectedSensors((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  async function createCommand(type, message) {
    try {
      await fetch("/api/create-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command_type: type })
      });
      alert(message || "Comando enviado.");
      setTimeout(loadData, 1500);
    } catch {
      alert("Falha ao enviar comando.");
    }
  }

  async function exportCSV() {
    const json = await fetch("/api/history?start=" + startDate + "&end=" + endDate + "&limit=10000").then((r) => r.json());
    const rows = json.data || [];
    if (!rows.length) return alert("Sem dados nesse período.");

    const blob = new Blob([buildCSV(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "temperaturas_" + startDate + "_a_" + endDate + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!data) return <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, padding: 30, fontFamily: "Arial" }}>Carregando dashboard...</div>;

  const systemOk = data.status === "ok" && data.cam_ok && data.sd_ok;
  const latestPhotos = photos.slice(0, 4);
  const todayAnalyses = Object.fromEntries(sensorSeries.map((s) => [s.key, analyzeSensor(todayHistory, s.key)]));
  const selectedDayAnalyses = Object.fromEntries(sensorSeries.map((s) => [s.key, analyzeSensor(history, s.key)]));
  const selectedSensorObjects = sensorSeries.filter((s) => selectedSensors.includes(s.key));
  const sensorsWithAlarm = selectedSensorObjects.filter((s) => selectedDayAnalyses[s.key].alarms.length > 0).length;

  return <main style={{
    minHeight: "100vh",
    background: "radial-gradient(circle at top left,rgba(124,58,237,.35),transparent 35%)," + theme.bg,
    color: theme.text, padding: 24, fontFamily: "Arial"
  }}>
    <style>{`
      .monitor-top-grid {
        display: grid;
        grid-template-columns: minmax(340px, 0.95fr) minmax(0, 2.05fr);
        gap: 16px;
        align-items: start;
      }
      .monitor-status-column {
        display: grid;
        grid-template-rows: 1fr 1fr;
        gap: 16px;
        min-width: 0;
      }
      .sensor-grid-3x3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-rows: repeat(3, auto);
        gap: 8px;
        height: auto;
        min-height: 0;
      }
      @media (max-width: 1050px) {
        .monitor-top-grid {
          grid-template-columns: 1fr;
        }
        .monitor-status-column {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto;
        }
        .sensor-grid-3x3 {
          min-height: 0;
          height: auto;
        }
      }
      @media (max-width: 700px) {
        .monitor-status-column {
          grid-template-columns: 1fr;
        }
        .sensor-grid-3x3 {
          grid-template-columns: 1fr;
          grid-template-rows: auto;
        }
      }
    `}</style>
    <header style={{
      background: "linear-gradient(135deg,rgba(124,58,237,.32),rgba(17,17,34,.95))",
      border: "1px solid " + theme.border, borderRadius: 22, padding: 24, marginBottom: 20
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <p style={{ margin: 0, color: theme.primaryLight, fontWeight: 700 }}>Sistema IoT de monitoramento fotovoltaico</p>
        <span style={{ border: "1px solid " + theme.primaryLight, color: theme.primaryLight, borderRadius: 999, padding: "4px 9px", fontSize: 10, fontWeight: 800 }}>VERSÃO EXPERIMENTAL</span>
      </div>
      <h1 style={{ margin: "8px 0", fontSize: 36 }}>Monitoramento Fotovoltaico</h1>
      <p style={{ margin: 0, color: theme.muted }}>Temperaturas, imagens, nuvem e controle remoto do experimento.</p>
    </header>

    <div className="monitor-top-grid" style={{ marginBottom: 16 }}>
      <div className="monitor-status-column">
        <Card
          title="Status geral"
          subtitle="Último estado recebido do ESP32 principal"
          style={{ height: "100%" }}
        >
          <p style={{ color: systemOk ? theme.ok : theme.warning, fontWeight: 800 }}>{systemOk ? "● Operacional" : "● Parcial / Atenção"}</p>
          <p><b>Última leitura:</b> {formatDate(data.created_at)}</p>
          <p><b>Atualizado:</b> {timeAgo(data.created_at)}</p>
          <p><b>Última captura:</b> {formatDate(data.last_capture)}</p>
          <p><b>Erro:</b> {data.error || "-"}</p>
        </Card>

        <Card
          title="ESP32-CAM"
          subtitle="Status repassado pelo ESP32 principal"
          style={{ height: "100%" }}
        >
          <p><b>CAM:</b> <StatusDot ok={Boolean(data.cam_ok)} labelOk="Online" labelFail="Offline" /></p>
          <p><b>SD:</b> <StatusDot ok={Boolean(data.sd_ok)} labelOk="OK" labelFail="Falha" /></p>
          <p><b>Última foto no CAM:</b><br /><span style={{ color: theme.muted, wordBreak: "break-all" }}>{data.cam_last_photo || "Nenhuma foto registrada"}</span></p>
          <p><b>Timestamp CAM:</b> <span style={{ color: theme.muted }}>{data.cam_timestamp || "-"}</span></p>
        </Card>
      </div>

      <Card
        title="Temperaturas"
        subtitle="Clique nos sensores para incluí-los ou removê-los da análise"
      >
        <div className="sensor-grid-3x3">
          {sensorSeries.map((sensor) => <SensorBox
            key={sensor.key}
            sensor={sensor}
            latestValue={data[sensor.key]}
            analysis={todayAnalyses[sensor.key]}
            selected={selectedSensors.includes(sensor.key)}
            onClick={() => toggleSensor(sensor.key)}
          />)}
        </div>
      </Card>
    </div>

    <Card title="Análise dos sensores" subtitle={viewMode === "raw" ? "Modo bruto: exibe somente as leituras válidas e mantém as falhas como lacunas." : "Modo tratado: mantém o último valor válido durante falhas apenas para facilitar a visualização, sem alterar o banco de dados."}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <DateInput value={chartDate} onChange={(e) => setChartDate(e.target.value)} />

        <div style={{ display: "inline-flex", border: "1px solid " + theme.border, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
          <button type="button" onClick={() => setViewMode("raw")} style={{
            border: "none", cursor: "pointer", padding: "9px 13px", fontWeight: 800,
            background: viewMode === "raw" ? theme.primary : "#111122",
            color: viewMode === "raw" ? "white" : theme.muted
          }}>Brutos</button>
          <button type="button" onClick={() => setViewMode("treated")} style={{
            border: "none", cursor: "pointer", padding: "9px 13px", fontWeight: 800,
            background: viewMode === "treated" ? theme.primary : "#111122",
            color: viewMode === "treated" ? "white" : theme.muted
          }}>Tratados</button>
        </div>

        <span style={{ color: sensorsWithAlarm ? theme.error : theme.ok, fontSize: 12, fontWeight: 800 }}>
          {sensorsWithAlarm ? "⚠ " + sensorsWithAlarm + " sensor(es) com falha > 30 min" : "● Nenhum alarme > 30 min nos sensores selecionados"}
        </span>
      </div>

      <SensorSelector
        selectedKeys={selectedSensors}
        onToggle={toggleSensor}
        onAll={() => setSelectedSensors(sensorSeries.map((s) => s.key))}
        onClear={() => setSelectedSensors([])}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, alignItems: "start", width: "100%", minWidth: 0 }}>
        <div>
          <TemperatureAnalysisChart rows={history} selectedKeys={selectedSensors} analyses={selectedDayAnalyses} mode={viewMode} />
          <p style={{ marginBottom: 0, color: theme.muted, fontSize: 11 }}>
            {viewMode === "raw"
              ? "No modo bruto, as falhas aparecem como lacunas na curva. Valores inválidos, como -1 °C e -127 °C, permanecem preservados no banco e no CSV."
              : "No modo tratado, trechos tracejados representam períodos em que o último valor válido foi mantido somente para visualização. Os dados brutos armazenados no Supabase não são modificados."}
          </p>
        </div>

        <div style={{ border: "1px solid " + theme.border, borderRadius: 14, padding: 14, background: "rgba(255,255,255,.025)" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Integridade da aquisição</h3>
          <p style={{ color: theme.muted, fontSize: 11, marginTop: 0 }}>
            Falhas são calculadas retroativamente a partir dos registros do dia selecionado. Alarme quando a interrupção ultrapassa 30 minutos.
          </p>
          <IntegrityPanel selectedSensors={selectedSensorObjects} analyses={selectedDayAnalyses} date={chartDate} />
        </div>
      </div>
    </Card>

    <br />

    <Card title="Controle remoto" subtitle="Comandos enviados para execução pelo ESP32 principal">
      <Button onClick={() => createCommand("read_temps_now", "Leitura de temperatura solicitada.")}>Atualizar temperaturas</Button>
      <Button onClick={() => createCommand("capture_now", "Captura de foto solicitada.")} color={theme.primaryLight}>Capturar foto agora</Button>
      <Button onClick={loadData} color={theme.ok}>Atualizar dashboard</Button>
      <Button onClick={() => confirm("Deseja reiniciar o ESP32 principal?") && createCommand("restart_normal", "Comando para reiniciar ESP32 enviado.")} color="#334155">Reiniciar ESP32</Button>
      <Button onClick={() => confirm("Deseja reiniciar a ESP32-CAM?") && createCommand("restart_cam", "Comando para reiniciar CAM enviado.")} color={theme.primaryDark}>Reiniciar CAM</Button>
      <Button onClick={() => confirm("Limpar fotos já enviadas do SD da ESP32-CAM?") && createCommand("clear_uploaded_photos", "Comando para limpar SD enviado.")} danger>Limpar SD do ESP32-CAM</Button>
    </Card>

    <br />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 16, marginBottom: 16 }}>
      <Card title="Exportar dados de temperatura" subtitle="CSV bruto com Sensor 1 a Sensor 9">
        <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <Button onClick={exportCSV}>Baixar CSV do período</Button>
      </Card>

      <Card title="Baixar fotos por dia" subtitle="Baixa ZIP das fotos enviadas à nuvem">
        <DateInput value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        <Button onClick={() => window.open("/api/download-day?date=" + selectedDate, "_blank")} color={theme.primaryDark}>Baixar fotos do dia</Button>
      </Card>
    </div>

    <Card title="Últimas 4 fotos enviadas para a nuvem">
      {!latestPhotos.length && <p style={{ color: theme.muted }}>Nenhuma foto enviada ainda.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        {latestPhotos.map((p) => {
          const imageUrl = SUPABASE_URL + "/storage/v1/object/public/esp32-photos/" + p.storage_path;
          return <div key={p.id} style={{ background: "#f8fafc", color: "#111827", borderRadius: 14, padding: 12 }}>
            <img src={imageUrl} alt="Foto do experimento" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10 }} />
            <p style={{ wordBreak: "break-all", fontSize: 13 }}><b>Arquivo:</b> {p.storage_path}</p>
            <p style={{ fontSize: 13 }}><b>Enviado em:</b> {formatDate(p.uploaded_at)}</p>
            <a href={imageUrl} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontWeight: 700 }}>Abrir imagem</a>
          </div>;
        })}
      </div>
    </Card>
  </main>;
}
