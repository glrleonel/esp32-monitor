"use client";

import { useMemo, useRef, useState } from "react";

const theme = {
  bg: "#080812", card: "#17172a", card2: "#1f1f3a", border: "#34235f",
  primary: "#7c3aed", primaryLight: "#a78bfa", text: "#f4f4f5",
  muted: "#a1a1aa", ok: "#22c55e", warning: "#f59e0b", error: "#ef4444"
};

const sensorColors = ["#6d28d9", "#dc2626", "#db2777", "#16a34a", "#6b7280", "#0284c7", "#d97706", "#0f766e", "#ea580c"];
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
const sensors = Array.from({ length: 9 }, (_, i) => ({
  key: "temp_sensor" + (i + 1),
  short: "S" + (i + 1),
  label: "Sensor " + (i + 1),
  description: sensorDescriptions[i],
  color: sensorColors[i]
}));

function todayBrazil() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function isValidTemp(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n) && n !== -1 && n !== -127 && n >= -55 && n <= 125;
}
function localMinutes(iso) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return h * 60 + m;
}
function localTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"
  });
}
function hhmmToMinutes(v) {
  const [h, m] = String(v || "00:00").split(":").map(Number);
  return h * 60 + m;
}
function sanitizeFileName(v) {
  return String(v || "grafico_temperaturas")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "grafico_temperaturas";
}
function formatNumber(v) {
  return Number(v).toFixed(1).replace(".", ",");
}

export default function GraficosTemperatura() {
  const svgRef = useRef(null);
  const [date, setDate] = useState(todayBrazil());
  const [startTime, setStartTime] = useState("05:30");
  const [endTime, setEndTime] = useState("18:30");
  const [selectedKeys, setSelectedKeys] = useState(["temp_sensor6", "temp_sensor7"]);
  const [mode, setMode] = useState("raw");
  const [title, setTitle] = useState("Temperatura dos sensores selecionados");
  const [legendMode, setLegendMode] = useState("detailed");
  const [axisMode, setAxisMode] = useState("auto");
  const [yMinManual, setYMinManual] = useState("15");
  const [yMaxManual, setYMaxManual] = useState("70");
  const [showGrid, setShowGrid] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Selecione os parâmetros e clique em Carregar dados.");
  const [hover, setHover] = useState(null);

  async function loadData() {
    setLoading(true);
    setMessage("Carregando...");
    try {
      const response = await fetch("/api/history?start=" + date + "&end=" + date + "&limit=5000");
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "Falha ao carregar os dados");
      const ordered = [...(json.data || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setRows(ordered);
      setMessage(ordered.length ? ordered.length + " registros carregados para " + date : "Nenhum registro encontrado para a data.");
    } catch (e) {
      setRows([]);
      setMessage("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSensor(key) {
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]
    );
  }

  const processed = useMemo(() => {
    const start = hhmmToMinutes(startTime);
    const end = hhmmToMinutes(endTime);
    if (end <= start) return { filteredRows: [], series: {}, stats: {}, failures: [] };

    const series = {};
    const stats = {};
    const failures = [];

    selectedKeys.forEach((key) => {
      let lastValid = null;
      let activeFailure = null;
      const full = rows.map((row) => {
        const valid = isValidTemp(row[key]);
        if (valid) lastValid = Number(row[key]);
        const minute = localMinutes(row.created_at);

        if (!valid) {
          if (!activeFailure) activeFailure = { start: row.created_at, count: 1 };
          else activeFailure.count += 1;
        } else if (activeFailure) {
          const duration = activeFailure.count * 5;
          failures.push({ key, start: activeFailure.start, end: row.created_at, duration });
          activeFailure = null;
        }

        return {
          created_at: row.created_at,
          minute,
          rawValid: valid,
          rawValue: valid ? Number(row[key]) : null,
          treatedValue: valid ? Number(row[key]) : lastValid,
          imputed: !valid && lastValid !== null
        };
      });

      if (activeFailure) {
        failures.push({ key, start: activeFailure.start, end: null, duration: activeFailure.count * 5 });
      }

      const clipped = full.filter((p) => p.minute >= start && p.minute <= end);
      series[key] = clipped;

      const validValues = clipped.filter((p) => p.rawValid).map((p) => p.rawValue);
      const invalidCount = clipped.length - validValues.length;
      stats[key] = {
        valid: validValues.length,
        invalid: invalidCount,
        availability: clipped.length ? (validValues.length / clipped.length) * 100 : null,
        min: validValues.length ? Math.min(...validValues) : null,
        max: validValues.length ? Math.max(...validValues) : null,
        avg: validValues.length ? validValues.reduce((a, b) => a + b, 0) / validValues.length : null
      };
    });

    return {
      filteredRows: rows.filter((row) => {
        const m = localMinutes(row.created_at);
        return m >= start && m <= end;
      }),
      series,
      stats,
      failures: failures.filter((f) => {
        const s = localMinutes(f.start);
        const e = f.end ? localMinutes(f.end) : s + f.duration;
        return e >= start && s <= end;
      })
    };
  }, [rows, selectedKeys, startTime, endTime]);

  const chart = useMemo(() => {
    const width = 1200, height = 700;
    const left = 82, right = 42, top = 100, bottom = 95;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const startMin = hhmmToMinutes(startTime);
    const endMin = hhmmToMinutes(endTime);
    const timeRange = Math.max(1, endMin - startMin);

    const values = [];
    selectedKeys.forEach((key) => {
      (processed.series[key] || []).forEach((p) => {
        const v = mode === "raw" ? p.rawValue : p.treatedValue;
        if (v !== null && v !== undefined) values.push(v);
      });
    });

    let yMin = 0, yMax = 1;
    if (axisMode === "manual") {
      yMin = Number(yMinManual);
      yMax = Number(yMaxManual);
      if (!Number.isFinite(yMin)) yMin = 0;
      if (!Number.isFinite(yMax) || yMax <= yMin) yMax = yMin + 10;
    } else if (values.length) {
      yMin = Math.floor(Math.min(...values) - 2);
      yMax = Math.ceil(Math.max(...values) + 2);
      if (yMax <= yMin) yMax = yMin + 1;
    }

    const x = (minute) => left + ((minute - startMin) / timeRange) * plotWidth;
    const y = (value) => top + ((yMax - value) / (yMax - yMin)) * plotHeight;

    return { width, height, left, right, top, bottom, plotWidth, plotHeight, startMin, endMin, yMin, yMax, x, y };
  }, [processed, selectedKeys, startTime, endTime, mode, axisMode, yMinManual, yMaxManual]);

  function makeSegments(sensor) {
    const points = processed.series[sensor.key] || [];
    const segments = [];
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];

      if (mode === "raw") {
        if (!a.rawValid || !b.rawValid) continue;
        segments.push({ a: a.rawValue, b: b.rawValue, xa: a.minute, xb: b.minute, dashed: false, key: i });
      } else {
        if (a.treatedValue === null || b.treatedValue === null) continue;
        segments.push({
          a: a.treatedValue, b: b.treatedValue, xa: a.minute, xb: b.minute,
          dashed: a.imputed || b.imputed, key: i
        });
      }
    }
    return segments;
  }

  const xTicks = useMemo(() => {
    const range = Math.max(1, chart.endMin - chart.startMin);
    const approxStep = range <= 180 ? 30 : range <= 480 ? 60 : 120;
    const first = Math.ceil(chart.startMin / approxStep) * approxStep;
    const ticks = [];
    for (let m = first; m <= chart.endMin; m += approxStep) ticks.push(m);
    if (!ticks.length || ticks[0] !== chart.startMin) ticks.unshift(chart.startMin);
    if (ticks[ticks.length - 1] !== chart.endMin) ticks.push(chart.endMin);
    return ticks;
  }, [chart.startMin, chart.endMin]);

  const yTicks = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => chart.yMin + ((chart.yMax - chart.yMin) * i) / 5);
  }, [chart.yMin, chart.yMax]);

  function minuteLabel(minute) {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function handleMouseMove(event) {
    if (!processed.filteredRows.length) {
      setHover(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * (chart.width / rect.width);
    if (svgX < chart.left || svgX > chart.left + chart.plotWidth) {
      setHover(null);
      return;
    }
    const minute = chart.startMin + ((svgX - chart.left) / chart.plotWidth) * (chart.endMin - chart.startMin);
    let nearest = null;
    let distance = Infinity;
    processed.filteredRows.forEach((row) => {
      const m = localMinutes(row.created_at);
      const d = Math.abs(m - minute);
      if (d < distance) {
        nearest = row;
        distance = d;
      }
    });
    if (!nearest) return setHover(null);

    const readings = selectedKeys.map((key) => {
      const sensor = sensors.find((s) => s.key === key);
      const point = (processed.series[key] || []).find((p) => p.created_at === nearest.created_at);
      const value = point ? (mode === "raw" ? point.rawValue : point.treatedValue) : null;
      return { sensor, value, imputed: point?.imputed || false, valid: point?.rawValid || false };
    });
    setHover({ row: nearest, minute: localMinutes(nearest.created_at), readings });
  }

  function exportSVG() {
    const source = svgRef.current;
    if (!source) return;
    const clone = source.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", chart.width);
    clone.setAttribute("height", chart.height);
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFileName(title) + "_" + date + ".svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPNG() {
    const source = svgRef.current;
    if (!source) return;
    const clone = source.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", chart.width);
    clone.setAttribute("height", chart.height);
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2.5;
      const canvas = document.createElement("canvas");
      canvas.width = chart.width * scale;
      canvas.height = chart.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.drawImage(img, 0, 0, chart.width, chart.height);
      URL.revokeObjectURL(url);
      const png = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = png;
      a.download = sanitizeFileName(title) + "_" + date + ".png";
      a.click();
    };
    img.src = url;
  }

  function exportCSV() {
    if (!processed.filteredRows.length) return;
    const header = ["created_at", "hora", ...selectedKeys];
    const body = processed.filteredRows.map((row) => {
      const values = [row.created_at, localTime(row.created_at), ...selectedKeys.map((key) => row[key] ?? "")];
      return values.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(";");
    });
    const blob = new Blob([[header.join(";"), ...body].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dados_" + date + "_" + startTime.replace(":", "") + "_" + endTime.replace(":", "") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <main style={{ minHeight: "100vh", background: theme.bg, color: theme.text, padding: 24, fontFamily: "Arial" }}>
    <style>{`
      @media print {
        body { background: white !important; }
        .no-print { display: none !important; }
        .print-area { border: none !important; box-shadow: none !important; padding: 0 !important; background: white !important; }
      }
    `}</style>

    <header className="no-print" style={{
      background: "linear-gradient(135deg,rgba(124,58,237,.32),rgba(17,17,34,.95))",
      border: "1px solid " + theme.border, borderRadius: 22, padding: 22, marginBottom: 18
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, color: theme.primaryLight, fontWeight: 700 }}>Ferramenta de análise térmica</p>
          <h1 style={{ margin: "7px 0", fontSize: 30 }}>Gráficos personalizados para o TFC</h1>
          <p style={{ margin: 0, color: theme.muted }}>Selecione sensores, período e apresentação. Exporte o gráfico pronto em PNG ou SVG.</p>
        </div>
        <a href="/dashboard-v2" style={{
          color: "white", textDecoration: "none", border: "1px solid " + theme.primaryLight,
          borderRadius: 10, padding: "9px 12px", fontWeight: 700
        }}>Voltar ao dashboard</a>
      </div>
    </header>

    <section className="no-print" style={{
      background: theme.card, border: "1px solid " + theme.border, borderRadius: 16,
      padding: 16, marginBottom: 16
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <label style={{ fontSize: 12 }}>Data<br /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></label>
        <label style={{ fontSize: 12 }}>Hora inicial<br /><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} /></label>
        <label style={{ fontSize: 12 }}>Hora final<br /><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} /></label>
        <label style={{ fontSize: 12 }}>Dados<br /><select value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}><option value="raw">Brutos</option><option value="treated">Tratados</option></select></label>
        <label style={{ fontSize: 12 }}>Legenda<br /><select value={legendMode} onChange={(e) => setLegendMode(e.target.value)} style={inputStyle}><option value="detailed">Sensor + posição</option><option value="short">Somente S1, S2...</option></select></label>
        <label style={{ fontSize: 12 }}>Eixo Y<br /><select value={axisMode} onChange={(e) => setAxisMode(e.target.value)} style={inputStyle}><option value="auto">Automático</option><option value="manual">Manual</option></select></label>
      </div>

      {axisMode === "manual" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <label style={{ fontSize: 12 }}>Y mín. <input type="number" value={yMinManual} onChange={(e) => setYMinManual(e.target.value)} style={{ ...inputStyle, width: 90 }} /></label>
        <label style={{ fontSize: 12 }}>Y máx. <input type="number" value={yMaxManual} onChange={(e) => setYMaxManual(e.target.value)} style={{ ...inputStyle, width: 90 }} /></label>
      </div>}

      <div style={{ marginTop: 13 }}>
        <div style={{ color: theme.muted, fontSize: 11, marginBottom: 7 }}>Curvas a plotar</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {sensors.map((sensor) => {
            const active = selectedKeys.includes(sensor.key);
            return <button key={sensor.key} type="button" onClick={() => toggleSensor(sensor.key)} style={{
              border: "1px solid " + sensor.color, borderRadius: 999, padding: "6px 9px",
              background: active ? sensor.color : "#111122", color: active ? "white" : theme.text,
              cursor: "pointer", fontWeight: 700, fontSize: 11
            }}>{sensor.short} · {sensor.description}</button>;
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(260px,1fr)", gap: 12, marginTop: 13 }}>
        <label style={{ fontSize: 12 }}>Título do gráfico<br /><input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} /></label>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, paddingBottom: 2 }}>
          <label style={checkStyle}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grade</label>
          <label style={checkStyle}><input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} /> Pontos</label>
          <label style={checkStyle}><input type="checkbox" checked={showFailures} onChange={(e) => setShowFailures(e.target.checked)} /> Destacar falhas &gt;30 min</label>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={loadData} disabled={loading || !selectedKeys.length} style={primaryButton}>{loading ? "Carregando..." : "Carregar dados"}</button>
        <button type="button" onClick={exportPNG} disabled={!processed.filteredRows.length} style={secondaryButton}>Baixar PNG</button>
        <button type="button" onClick={exportSVG} disabled={!processed.filteredRows.length} style={secondaryButton}>Baixar SVG</button>
        <button type="button" onClick={exportCSV} disabled={!processed.filteredRows.length} style={secondaryButton}>CSV do recorte</button>
        <button type="button" onClick={() => window.print()} disabled={!processed.filteredRows.length} style={secondaryButton}>Imprimir</button>
        <span style={{ color: theme.muted, fontSize: 11 }}>{message}</span>
      </div>
    </section>

    <section className="print-area" style={{
      background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 14,
      padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,.22)"
    }}>
      {!processed.filteredRows.length && <div style={{ color: "#4b5563", padding: 40, textAlign: "center" }}>Carregue os dados para visualizar o gráfico.</div>}

      {processed.filteredRows.length > 0 && <svg
        id="tfc-chart"
        ref={svgRef}
        viewBox={"0 0 " + chart.width + " " + chart.height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ width: "100%", height: "auto", display: "block", background: "#fff", cursor: "crosshair" }}
      >
        <rect x="0" y="0" width={chart.width} height={chart.height} fill="#ffffff" />

        <text x={chart.width / 2} y="38" textAnchor="middle" fontSize="24" fontWeight="700" fill="#111827">{title}</text>
        <text x={chart.width / 2} y="64" textAnchor="middle" fontSize="13" fill="#4b5563">
          {date.split("-").reverse().join("/")} · {startTime}–{endTime} · {mode === "raw" ? "dados brutos" : "dados tratados"}
        </text>

        {showFailures && processed.failures.filter((f) => f.duration > 30 && selectedKeys.includes(f.key)).map((f, index) => {
          const x1 = chart.x(Math.max(chart.startMin, localMinutes(f.start)));
          const endMinute = f.end ? localMinutes(f.end) : Math.min(chart.endMin, localMinutes(f.start) + f.duration);
          const x2 = chart.x(Math.min(chart.endMin, endMinute));
          return <rect key={"fail-" + index} x={x1} y={chart.top} width={Math.max(2, x2 - x1)} height={chart.plotHeight} fill="#fee2e2" opacity="0.55" />;
        })}

        {showGrid && yTicks.map((v, i) => <line key={"yg-" + i} x1={chart.left} x2={chart.left + chart.plotWidth} y1={chart.y(v)} y2={chart.y(v)} stroke="#e5e7eb" strokeWidth="1" />)}
        {showGrid && xTicks.map((m, i) => <line key={"xg-" + i} y1={chart.top} y2={chart.top + chart.plotHeight} x1={chart.x(m)} x2={chart.x(m)} stroke="#f0f0f0" strokeWidth="1" />)}

        <line x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.top + chart.plotHeight} stroke="#111827" strokeWidth="1.5" />
        <line x1={chart.left} x2={chart.left + chart.plotWidth} y1={chart.top + chart.plotHeight} y2={chart.top + chart.plotHeight} stroke="#111827" strokeWidth="1.5" />

        {yTicks.map((v, i) => <g key={"yt-" + i}>
          <text x={chart.left - 12} y={chart.y(v) + 4} textAnchor="end" fontSize="12" fill="#374151">{formatNumber(v)}</text>
        </g>)}
        {xTicks.map((m, i) => <text key={"xt-" + i} x={chart.x(m)} y={chart.top + chart.plotHeight + 28} textAnchor="middle" fontSize="12" fill="#374151">{minuteLabel(m)}</text>)}

        <text x={chart.width / 2} y={chart.height - 24} textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">Horário</text>
        <text transform={"translate(22 " + (chart.top + chart.plotHeight / 2) + ") rotate(-90)"} textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">Temperatura (°C)</text>

        {selectedKeys.map((key) => {
          const sensor = sensors.find((s) => s.key === key);
          return <g key={key}>
            {makeSegments(sensor).map((seg) => <line
              key={seg.key}
              x1={chart.x(seg.xa)} y1={chart.y(seg.a)}
              x2={chart.x(seg.xb)} y2={chart.y(seg.b)}
              stroke={sensor.color} strokeWidth="2.8"
              strokeDasharray={seg.dashed ? "7 6" : undefined}
              strokeOpacity={seg.dashed ? "0.62" : "1"}
              strokeLinecap="round"
            />)}
            {showPoints && (processed.series[key] || []).map((p, idx) => {
              const value = mode === "raw" ? p.rawValue : p.treatedValue;
              if (value === null || value === undefined) return null;
              return <circle key={idx} cx={chart.x(p.minute)} cy={chart.y(value)} r="2.4" fill={sensor.color} />;
            })}
          </g>;
        })}

        <g>
          {selectedKeys.map((key, i) => {
            const sensor = sensors.find((s) => s.key === key);
            const cols = selectedKeys.length > 4 ? 2 : 1;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const baseX = chart.left + col * (chart.plotWidth / cols);
            const baseY = chart.height - 60 - (Math.ceil(selectedKeys.length / cols) - 1 - row) * 20;
            const label = legendMode === "detailed" ? sensor.short + " – " + sensor.description : sensor.short;
            return <g key={"legend-" + key}>
              <line x1={baseX} x2={baseX + 26} y1={baseY} y2={baseY} stroke={sensor.color} strokeWidth="3" />
              <text x={baseX + 34} y={baseY + 4} fontSize="11" fill="#1f2937">{label}</text>
            </g>;
          })}
        </g>

        {hover && <g pointerEvents="none">
          <line x1={chart.x(hover.minute)} x2={chart.x(hover.minute)} y1={chart.top} y2={chart.top + chart.plotHeight} stroke="#111827" strokeDasharray="4 4" opacity="0.5" />
          {hover.readings.map(({ sensor, value }) => value === null || value === undefined ? null :
            <circle key={"hover-" + sensor.key} cx={chart.x(hover.minute)} cy={chart.y(value)} r="4.5" fill={sensor.color} stroke="#ffffff" strokeWidth="2" />
          )}
          <rect x={Math.min(chart.width - 230, chart.x(hover.minute) + 10)} y={chart.top + 10} width="220" height={38 + hover.readings.length * 18} rx="8" fill="#ffffff" stroke="#9ca3af" />
          <text x={Math.min(chart.width - 220, chart.x(hover.minute) + 20)} y={chart.top + 30} fontSize="11" fontWeight="700" fill="#111827">{localTime(hover.row.created_at)}</text>
          {hover.readings.map(({ sensor, value, imputed }, i) => <text key={"hv-" + sensor.key} x={Math.min(chart.width - 220, chart.x(hover.minute) + 20)} y={chart.top + 51 + i * 18} fontSize="10.5" fill={sensor.color}>
            {sensor.short}: {value === null || value === undefined ? "sem leitura" : value.toFixed(2) + " °C" + (mode === "treated" && imputed ? " (mantido)" : "")}
          </text>)}
        </g>}
      </svg>}
    </section>

    {processed.filteredRows.length > 0 && <section className="no-print" style={{
      marginTop: 14, background: theme.card, border: "1px solid " + theme.border,
      borderRadius: 14, padding: 14
    }}>
      <b style={{ fontSize: 13 }}>Resumo do recorte selecionado</b>
      <div style={{ overflowX: "auto", marginTop: 9 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650, fontSize: 11 }}>
          <thead><tr style={{ color: theme.muted, textAlign: "left" }}>
            <th style={th}>Sensor</th><th style={th}>Válidas</th><th style={th}>Inválidas</th><th style={th}>Disponibilidade</th><th style={th}>Mín.</th><th style={th}>Máx.</th><th style={th}>Média</th>
          </tr></thead>
          <tbody>{selectedKeys.map((key) => {
            const sensor = sensors.find((s) => s.key === key);
            const s = processed.stats[key];
            return <tr key={key} style={{ borderTop: "1px solid " + theme.border }}>
              <td style={td}><b style={{ color: sensor.color }}>{sensor.short}</b> · {sensor.description}</td>
              <td style={td}>{s?.valid ?? "-"}</td>
              <td style={td}>{s?.invalid ?? "-"}</td>
              <td style={td}>{s?.availability == null ? "-" : s.availability.toFixed(1) + "%"}</td>
              <td style={td}>{s?.min == null ? "-" : s.min.toFixed(2) + " °C"}</td>
              <td style={td}>{s?.max == null ? "-" : s.max.toFixed(2) + " °C"}</td>
              <td style={td}>{s?.avg == null ? "-" : s.avg.toFixed(2) + " °C"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
  </main>;
}

const inputStyle = {
  marginTop: 5, width: "100%", boxSizing: "border-box", background: "#0f1020",
  color: "#f4f4f5", border: "1px solid #34235f", borderRadius: 9, padding: "9px 10px"
};
const checkStyle = { color: "#d4d4d8", fontSize: 11, display: "flex", alignItems: "center", gap: 5 };
const primaryButton = { background: "#7c3aed", color: "white", border: "none", borderRadius: 9, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const secondaryButton = { background: "#20203a", color: "white", border: "1px solid #4c3a78", borderRadius: 9, padding: "9px 12px", fontWeight: 700, cursor: "pointer" };
const th = { padding: "7px 9px" };
const td = { padding: "8px 9px" };
