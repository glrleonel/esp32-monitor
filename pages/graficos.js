"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function downloadSvgGraphic(source, baseName, format = "png") {
  if (!source) return;
  const clone = source.cloneNode(true);
  clone.querySelectorAll('[data-export-ignore="true"]').forEach((node) => node.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const viewBox = (clone.getAttribute("viewBox") || "0 0 1200 700").split(/\s+/).map(Number);
  const width = Number.isFinite(viewBox[2]) ? viewBox[2] : 1200;
  const height = Number.isFinite(viewBox[3]) ? viewBox[3] : 700;
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const safeName = sanitizeFileName(baseName || "grafico");

  if (format === "svg") {
    const a = document.createElement("a");
    a.href = svgUrl;
    a.download = safeName + ".svg";
    a.click();
    URL.revokeObjectURL(svgUrl);
    return;
  }

  const img = new Image();
  img.onload = () => {
    const scale = 2.5;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = safeName + ".png";
    a.click();
  };
  img.src = svgUrl;
}
function formatNumber(v) {
  return Number(v).toFixed(1).replace(".", ",");
}


const analysisPalette = [
  "#7c3aed","#0284c7","#16a34a","#ea580c","#dc2626","#0f766e","#d97706","#db2777",
  "#4f46e5","#0891b2","#65a30d","#c2410c","#be123c","#0d9488","#a16207","#9333ea"
];

const analysisGroups = [
  {
    title: "Temperaturas",
    items: Array.from({ length: 9 }, (_, i) => ({
      key: "temp_sensor" + (i + 1),
      label: "S" + (i + 1) + " · " + sensorDescriptions[i],
      unit: "°C",
      kind: "temperature"
    }))
  },
  {
    title: "Potências",
    items: [
      { key: "pv1Power", label: "PV1 · potência CC", unit: "kW", kind: "power" },
      { key: "pv2Power", label: "PV2 · potência CC", unit: "kW", kind: "power" },
      { key: "pv3Power", label: "PV3 · potência CC", unit: "kW", kind: "power" },
      { key: "pv4Power", label: "PV4 · potência CC", unit: "kW", kind: "power" },
      { key: "pvPower", label: "Potência CC total", unit: "kW", kind: "power" },
      { key: "generationPower", label: "Potência CA do inversor", unit: "kW", kind: "power" },
      { key: "estimatedModulePower", label: "Potência estimada por irradiância · 1 módulo", unit: "kW", kind: "power" }
    ]
  },
  {
    title: "Tensões e correntes",
    items: [
      { key: "pv1Volt", label: "PV1 · tensão", unit: "V", kind: "voltage" },
      { key: "pv2Volt", label: "PV2 · tensão", unit: "V", kind: "voltage" },
      { key: "pv3Volt", label: "PV3 · tensão", unit: "V", kind: "voltage" },
      { key: "pv4Volt", label: "PV4 · tensão", unit: "V", kind: "voltage" },
      { key: "pv1Current", label: "PV1 · corrente", unit: "A", kind: "current" },
      { key: "pv2Current", label: "PV2 · corrente", unit: "A", kind: "current" },
      { key: "pv3Current", label: "PV3 · corrente", unit: "A", kind: "current" },
      { key: "pv4Current", label: "PV4 · corrente", unit: "A", kind: "current" },
      { key: "RVolt", label: "Tensão CA", unit: "V", kind: "voltage" },
      { key: "RCurrent", label: "Corrente CA", unit: "A", kind: "current" },
      { key: "RFreq", label: "Frequência CA", unit: "Hz", kind: "frequency" }
    ]
  },
  {
    title: "Meteorologia e inversor",
    items: [
      { key: "irradiance", label: "Irradiância INMET A514", unit: "W/m²", kind: "irradiance" },
      { key: "invTemperation", label: "Temperatura do inversor", unit: "°C", kind: "temperature" },
      { key: "invEfficiency", label: "Eficiência instantânea CC → CA", unit: "%", kind: "efficiency" }
    ]
  },
  {
    title: "Energia por integração",
    items: [
      { key: "pv1EnergyInt", label: "Integral PV1", unit: "kWh", kind: "energy" },
      { key: "pv2EnergyInt", label: "Integral PV2", unit: "kWh", kind: "energy" },
      { key: "pv3EnergyInt", label: "Integral PV3", unit: "kWh", kind: "energy" },
      { key: "pv4EnergyInt", label: "Integral PV4", unit: "kWh", kind: "energy" },
      { key: "pvTotalEnergyInt", label: "Integral CC total", unit: "kWh", kind: "energy" },
      { key: "acEnergyInt", label: "Integral CA", unit: "kWh", kind: "energy" },
      { key: "estimatedEnergyInt", label: "Integral estimada por irradiância · 1 módulo", unit: "kWh", kind: "energy" }
    ]
  }
];

const analysisMeta = Object.fromEntries(
  analysisGroups.flatMap((group) => group.items).map((item) => [item.key, item])
);

function analysisTimeMinutes(iso) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return h * 60 + m;
}

function analysisTimeToMinutes(v) {
  const parts = String(v || "00:00").split(":").map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function analysisIntegrate(points, maxGapMinutes = 30) {
  const src = [...(points || [])]
    .filter((p) => Number.isFinite(Number(p.value)) && Number.isFinite(Number(p.timestamp)))
    .sort((a, b) => a.timestamp - b.timestamp);
  let energy = 0;
  for (let i = 1; i < src.length; i += 1) {
    const dt = (src[i].timestamp - src[i - 1].timestamp) / 3600000;
    if (dt <= 0 || dt > maxGapMinutes / 60) continue;
    energy += ((Number(src[i - 1].value) + Number(src[i].value)) / 2) * dt;
  }
  return energy;
}

function cumulativeIntegral(points, maxGapMinutes = 30) {
  const src = [...(points || [])]
    .filter((p) => Number.isFinite(Number(p.value)) && Number.isFinite(Number(p.timestamp)))
    .sort((a, b) => a.timestamp - b.timestamp);
  let energy = 0;
  return src.map((p, i) => {
    if (i > 0) {
      const dt = (p.timestamp - src[i - 1].timestamp) / 3600000;
      if (dt > 0 && dt <= maxGapMinutes / 60) {
        energy += ((Number(src[i - 1].value) + Number(p.value)) / 2) * dt;
      }
    }
    return { timestamp: p.timestamp, time: p.time, value: energy };
  });
}

function nearestValue(points, timestamp, maxGapMinutes = 35) {
  if (!points?.length) return null;
  let best = null;
  let bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(Number(p.timestamp) - Number(timestamp));
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return bestGap <= maxGapMinutes * 60000 ? Number(best.value) : null;
}

function pearsonCorrelation(aPoints, bPoints) {
  const pairs = [];
  for (const a of aPoints || []) {
    const b = nearestValue(bPoints, a.timestamp, 35);
    if (Number.isFinite(Number(a.value)) && Number.isFinite(b)) pairs.push([Number(a.value), b]);
  }
  if (pairs.length < 3) return null;
  const avgA = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const avgB = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let num = 0, da = 0, db = 0;
  for (const [x, y] of pairs) {
    num += (x - avgA) * (y - avgB);
    da += (x - avgA) ** 2;
    db += (y - avgB) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : null;
}

function seriesStats(points) {
  const values = (points || []).map((p) => Number(p.value)).filter(Number.isFinite);
  if (!values.length) return { count: 0, min: null, max: null, avg: null };
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length
  };
}

function AnalysisLineChart({ seriesMap, selected, startTime, endTime, scaleMode, date }) {
  const [hoverMinute, setHoverMinute] = useState(null);
  const svgRef = useRef(null);
  const width = 1100, height = 500, left = 92, right = 28, top = 34, bottom = 82;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const start = analysisTimeToMinutes(startTime);
  const end = analysisTimeToMinutes(endTime);

  const prepared = selected.map((key, index) => {
    const raw = (seriesMap[key] || []).filter((p) => {
      const min = analysisTimeMinutes(p.time);
      return min >= start && min <= end && Number.isFinite(Number(p.value));
    });
    const values = raw.map((p) => Number(p.value));
    const max = values.length ? Math.max(...values.map((v) => Math.abs(v))) : 0;
    return {
      key,
      color: analysisPalette[index % analysisPalette.length],
      points: raw,
      scaleMax: max || 1,
      meta: analysisMeta[key] || { label: key, unit: "", kind: "" }
    };
  }).filter((s) => s.points.length);

  if (end <= start) return <p style={{ color: theme.warning }}>A hora final deve ser posterior à hora inicial.</p>;
  if (!prepared.length) return <p style={{ color: theme.muted }}>Nenhuma série selecionada possui dados neste intervalo.</p>;

  const units = [...new Set(prepared.map((s) => s.meta.unit).filter(Boolean))];

  if (scaleMode === "real" && units.length > 1) {
    return <div style={{
      border: "1px solid " + theme.warning, borderRadius: 12, padding: 14,
      background: "rgba(245,158,11,.08)", color: theme.text
    }}>
      <b>As séries selecionadas usam unidades diferentes: {units.join(", ")}.</b>
      <p style={{ margin: "6px 0 0", color: theme.muted, fontSize: 11 }}>
        Para manter o eixo Y fisicamente correto, selecione variáveis com a mesma unidade ou escolha a escala normalizada para comparar apenas o formato das curvas.
      </p>
    </div>;
  }

  const axisUnit = scaleMode === "normalized" ? "%" : (units[0] || "");
  const unitAxisNames = {
    "kW": "Potência",
    "V": "Tensão",
    "A": "Corrente",
    "Hz": "Frequência",
    "°C": "Temperatura",
    "W/m²": "Irradiância",
    "%": "Eficiência",
    "kWh": "Energia"
  };
  const axisTitle = scaleMode === "normalized"
    ? "Valor normalizado (%)"
    : ((unitAxisNames[axisUnit] || "Valor") + (axisUnit ? " (" + axisUnit + ")" : ""));

  const displayValues = prepared.flatMap((s) => s.points.map((p) =>
    scaleMode === "normalized" ? (Number(p.value) / s.scaleMax) * 100 : Number(p.value)
  ));

  let globalMin;
  let globalMax;

  if (scaleMode === "normalized") {
    globalMin = 0;
    globalMax = 100;
  } else {
    const dataMin = Math.min(...displayValues);
    const dataMax = Math.max(...displayValues);
    const dataRange = Math.max(0.0001, dataMax - dataMin);
    const padding = dataRange * 0.08;
    const zeroBaselineUnits = ["kW", "A", "W/m²", "kWh"];
    globalMin = zeroBaselineUnits.includes(axisUnit) && dataMin >= 0 ? 0 : dataMin - padding;
    globalMax = dataMax + padding;
    if (globalMax <= globalMin) globalMax = globalMin + 1;
  }

  const range = Math.max(0.0001, globalMax - globalMin);
  const x = (iso) => left + ((analysisTimeMinutes(iso) - start) / Math.max(1, end - start)) * plotWidth;
  const y = (displayValue) => top + ((globalMax - displayValue) / range) * plotHeight;

  function pathFor(s) {
    return s.points.map((p, i) => {
      const display = scaleMode === "normalized" ? (Number(p.value) / s.scaleMax) * 100 : Number(p.value);
      return (i ? "L " : "M ") + x(p.time) + " " + y(display);
    }).join(" ");
  }

  function formatAxisValue(value) {
    if (scaleMode === "normalized") return value.toFixed(0) + "%";
    const abs = Math.abs(value);
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return value.toFixed(decimals) + (axisUnit ? " " + axisUnit : "");
  }

  function nearestPreparedPoint(series, targetMinute) {
    let best = null;
    let bestGap = Infinity;
    series.points.forEach((p) => {
      const gap = Math.abs(analysisTimeMinutes(p.time) - targetMinute);
      if (gap < bestGap) {
        best = p;
        bestGap = gap;
      }
    });
    const maxGap = series.meta.kind === "irradiance" ? 60 : 20;
    return best && bestGap <= maxGap ? best : null;
  }

  function handleAnalysisMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * (width / rect.width);
    if (svgX < left || svgX > width - right) {
      setHoverMinute(null);
      return;
    }
    const minute = start + ((svgX - left) / plotWidth) * Math.max(1, end - start);
    setHoverMinute(minute);
  }

  const hoverReadings = hoverMinute === null
    ? []
    : prepared.map((series) => {
        const point = nearestPreparedPoint(series, hoverMinute);
        if (!point) return null;
        const rawValue = Number(point.value);
        const displayValue = scaleMode === "normalized"
          ? (rawValue / series.scaleMax) * 100
          : rawValue;
        return { series, point, rawValue, displayValue };
      }).filter(Boolean);

  const hoverX = hoverMinute === null
    ? null
    : left + ((hoverMinute - start) / Math.max(1, end - start)) * plotWidth;
  const hoverLabel = hoverMinute === null
    ? ""
    : String(Math.floor(hoverMinute / 60)).padStart(2, "0") + ":" +
      String(Math.round(hoverMinute % 60)).padStart(2, "0");
  const tooltipWidth = 290;
  const tooltipHeight = 36 + hoverReadings.length * 20;
  const tooltipX = hoverX === null
    ? 0
    : (hoverX + tooltipWidth + 18 > width - right
      ? Math.max(left + 4, hoverX - tooltipWidth - 12)
      : hoverX + 12);

  return <div style={{ overflowX: "auto" }}>
    <svg
      ref={svgRef}
      viewBox={"0 0 " + width + " " + height}
      onMouseMove={handleAnalysisMouseMove}
      onMouseLeave={() => setHoverMinute(null)}
      style={{ width: "100%", minWidth: 820, background: "#ffffff", borderRadius: 12, border: "1px solid #d1d5db", cursor: "crosshair" }}
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" rx="12" />

      <text
        x="18"
        y={top + plotHeight / 2}
        transform={"rotate(-90 18 " + (top + plotHeight / 2) + ")"}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#374151"
      >
        {axisTitle}
      </text>

      {[0, .25, .5, .75, 1].map((p) => {
        const yy = top + p * plotHeight;
        const val = globalMax - p * range;
        return <g key={p}>
          <line x1={left} y1={yy} x2={width - right} y2={yy} stroke="#e5e7eb" />
          <text x={left - 8} y={yy + 4} textAnchor="end" fontSize="11" fill="#6b7280">
            {formatAxisValue(val)}
          </text>
        </g>;
      })}

      {Array.from({ length: 8 }, (_, i) => {
        const min = start + ((end - start) * i) / 7;
        const hh = String(Math.floor(min / 60)).padStart(2, "0");
        const mm = String(Math.round(min % 60)).padStart(2, "0");
        const xx = left + (i * plotWidth) / 7;
        return <text key={i} x={xx} y={height - 52} textAnchor="middle" fill="#6b7280" fontSize="11">{hh}:{mm}</text>;
      })}

      {prepared.map((s) => <path key={s.key} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />)}

      {prepared.map((s, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const xx = left + col * 320;
        const yy = height - 26 + row * 18;
        return <g key={"legend-" + s.key}>
          <line x1={xx} x2={xx + 22} y1={yy} y2={yy} stroke={s.color} strokeWidth="3" />
          <text x={xx + 28} y={yy + 4} fill="#1f2937" fontSize="10">{s.meta.label} [{s.meta.unit}]</text>
        </g>;
      })}

      {hoverMinute !== null && hoverX !== null && <g pointerEvents="none" data-export-ignore="true">
        <line
          x1={hoverX} x2={hoverX}
          y1={top} y2={top + plotHeight}
          stroke="#111827" strokeWidth="1" strokeDasharray="4 4" opacity="0.6"
        />
        {hoverReadings.map(({ series, displayValue }) => <circle
          key={"hover-" + series.key}
          cx={hoverX}
          cy={y(displayValue)}
          r="4.5"
          fill={series.color}
          stroke="#ffffff"
          strokeWidth="2"
        />)}
        <rect
          x={tooltipX}
          y={top + 10}
          width={tooltipWidth}
          height={tooltipHeight}
          rx="9"
          fill="#ffffff"
          stroke="#9ca3af"
          opacity="0.98"
        />
        <text x={tooltipX + 12} y={top + 30} fill="#111827" fontSize="11" fontWeight="700">
          {hoverLabel}
        </text>
        {hoverReadings.map(({ series, rawValue, displayValue }, index) => {
          const rawLabel = rawValue.toFixed(Math.abs(rawValue) >= 100 ? 1 : 3) + (series.meta.unit ? " " + series.meta.unit : "");
          const normalizedLabel = scaleMode === "normalized" ? " · " + displayValue.toFixed(1) + "%" : "";
          return <g key={"tooltip-" + series.key}>
            <circle cx={tooltipX + 13} cy={top + 51 + index * 20} r="3" fill={series.color} />
            <text x={tooltipX + 23} y={top + 55 + index * 20} fill="#374151" fontSize="10.5">
              {series.meta.label}: {rawLabel}{normalizedLabel}
            </text>
          </g>;
        })}
      </g>}
    </svg>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
      <button type="button" onClick={() => downloadSvgGraphic(
        svgRef.current,
        "analise_integrada_" + (date || "data") + "_" + startTime.replace(":", "") + "_" + endTime.replace(":", ""),
        "png"
      )} style={secondaryButton}>Baixar PNG</button>
      <button type="button" onClick={() => downloadSvgGraphic(
        svgRef.current,
        "analise_integrada_" + (date || "data") + "_" + startTime.replace(":", "") + "_" + endTime.replace(":", ""),
        "svg"
      )} style={secondaryButton}>Baixar SVG</button>
    </div>
  </div>;
}

function IntegratedAnalysisPanel({ date, startTime, endTime }) {
  const [seriesMap, setSeriesMap] = useState({});
  const [selected, setSelected] = useState(["pv1Power", "pv2Power", "pv3Power", "pv4Power"]);
  const [scaleMode, setScaleMode] = useState("real");
  const [compareA, setCompareA] = useState("pv1Power");
  const [compareB, setCompareB] = useState("pv2Power");
  const [status, setStatus] = useState("Carregando análise integrada...");
  const [loadedDate, setLoadedDate] = useState(null);

  async function loadIntegrated() {
    setStatus("Carregando temperaturas, FoxESS e INMET...");
    try {
      const [temps, fox, inmet] = await Promise.all([
        fetch("/api/history?start=" + date + "&end=" + date + "&limit=5000").then((r) => r.json()),
        fetch("/api/history?source=foxess-history&date=" + date + "&startTime=05:00&endTime=19:30").then((r) => r.json()),
        fetch("/api/history?source=inmet&date=" + date + "&modulePowerW=610").then((r) => r.json())
      ]);

      const map = {};

      if (temps.ok) {
        const tempRows = [...(temps.data || [])].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
        for (let i = 1; i <= 9; i += 1) {
          const key = "temp_sensor" + i;
          map[key] = tempRows
            .filter((row) => isValidTemp(row[key]))
            .map((row) => ({
              timestamp: new Date(row.created_at).getTime(),
              time: row.created_at,
              value: Number(row[key])
            }));
        }
      }

      if (fox.ok) {
        Object.entries(fox.series || {}).forEach(([key, entry]) => {
          map[key] = (entry.points || []).map((p) => ({
            timestamp: Number(p.timestamp),
            time: p.time,
            value: Number(p.value)
          })).filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value));
        });
      }

      if (inmet.ok) {
        map.irradiance = (inmet.rows || [])
          .filter((r) => Number.isFinite(Number(r.irradianceWm2)))
          .map((r) => ({ timestamp: Number(r.timestamp), time: r.time, value: Number(r.irradianceWm2) }));
        map.estimatedModulePower = (inmet.rows || [])
          .filter((r) => Number.isFinite(Number(r.estimatedModulePowerKw)))
          .map((r) => ({ timestamp: Number(r.timestamp), time: r.time, value: Number(r.estimatedModulePowerKw) }));
      }

      map.pv1EnergyInt = cumulativeIntegral(map.pv1Power, 30);
      map.pv2EnergyInt = cumulativeIntegral(map.pv2Power, 30);
      map.pv3EnergyInt = cumulativeIntegral(map.pv3Power, 30);
      map.pv4EnergyInt = cumulativeIntegral(map.pv4Power, 30);
      map.pvTotalEnergyInt = cumulativeIntegral(map.pvPower, 30);
      map.acEnergyInt = cumulativeIntegral(map.generationPower, 30);
      map.estimatedEnergyInt = cumulativeIntegral(map.estimatedModulePower, 90);

      if (map.pvPower?.length && map.generationPower?.length) {
        map.invEfficiency = map.pvPower.map((p) => {
          const ac = nearestValue(map.generationPower, p.timestamp, 3);
          const dc = Number(p.value);
          if (!Number.isFinite(ac) || !Number.isFinite(dc) || dc < 0.05) return null;
          const efficiency = (ac / dc) * 100;
          if (!Number.isFinite(efficiency) || efficiency < 0 || efficiency > 110) return null;
          return { timestamp: p.timestamp, time: p.time, value: efficiency };
        }).filter(Boolean);
      }

      setSeriesMap(map);
      setLoadedDate(date);
      const warnings = [];
      if (!temps.ok) warnings.push("temperaturas indisponíveis");
      if (!fox.ok) warnings.push("FoxESS: " + (fox.message || fox.error || "indisponível"));
      else if (!fox.pointCount) warnings.push("FoxESS: consulta histórica respondeu sem pontos");
      if (!inmet.ok) {
        const inmetMsg = inmet.error === "inmet_token_required"
          ? "INMET: dados horários exigem token oficial"
          : "INMET: " + (inmet.detail || inmet.error || "indisponível");
        warnings.push(inmetMsg);
      }
      const foxInfo = fox.ok && fox.pointCount
        ? " · FoxESS: " + fox.pointCount + " pontos em " + (fox.returnedVariables || []).length + " variáveis"
        : "";
      setStatus(warnings.length
        ? "Carregado com ressalvas: " + warnings.join(" · ") + foxInfo
        : "Dados integrados carregados para " + date + foxInfo + ".");
    } catch (error) {
      setStatus("Erro ao carregar análise integrada: " + error.message);
    }
  }

  useEffect(() => {
    loadIntegrated();
  }, [date]);

  function toggle(key) {
    setSelected((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]
    );
  }

  function clipped(key) {
    const start = analysisTimeToMinutes(startTime);
    const end = analysisTimeToMinutes(endTime);
    return (seriesMap[key] || []).filter((p) => {
      const min = analysisTimeMinutes(p.time);
      return min >= start && min <= end;
    });
  }

  const aPoints = clipped(compareA);
  const bPoints = clipped(compareB);
  const aStats = seriesStats(aPoints);
  const bStats = seriesStats(bPoints);
  const corr = pearsonCorrelation(aPoints, bPoints);
  const aMeta = analysisMeta[compareA] || { label: compareA, unit: "" };
  const bMeta = analysisMeta[compareB] || { label: compareB, unit: "" };
  const aEnergy = aMeta.kind === "power" ? analysisIntegrate(aPoints, compareA === "estimatedModulePower" ? 90 : 30) : null;
  const bEnergy = bMeta.kind === "power" ? analysisIntegrate(bPoints, compareB === "estimatedModulePower" ? 90 : 30) : null;

  const rawModuleEnergy = ["pv1Power","pv2Power","pv3Power","pv4Power"].map((key) => ({
    key,
    energy: analysisIntegrate(clipped(key), 30)
  }));
  const rawDcModulesTotal = rawModuleEnergy.reduce((s, x) => s + x.energy, 0);

  const pvCounterPoints = clipped("PVEnergyTotal");
  const pvCounterDelta = pvCounterPoints.length >= 2
    ? Number(pvCounterPoints[pvCounterPoints.length - 1].value) - Number(pvCounterPoints[0].value)
    : null;
  const dcCorrectionFactor = Number.isFinite(pvCounterDelta) && pvCounterDelta >= 0 && rawDcModulesTotal > 0
    ? pvCounterDelta / rawDcModulesTotal
    : 1;

  const moduleEnergy = rawModuleEnergy.map((item) => ({
    ...item,
    energy: item.energy * dcCorrectionFactor
  }));
  const dcModulesTotal = moduleEnergy.reduce((s, x) => s + x.energy, 0);

  const generationCounterPoints = clipped("generation");
  const generationCounterDelta = generationCounterPoints.length >= 2
    ? Number(generationCounterPoints[generationCounterPoints.length - 1].value) - Number(generationCounterPoints[0].value)
    : null;
  const rawAcEnergy = analysisIntegrate(clipped("generationPower"), 30);
  const acEnergy = Number.isFinite(generationCounterDelta) && generationCounterDelta >= 0
    ? generationCounterDelta
    : rawAcEnergy;
  const energyEfficiency = dcModulesTotal > 0 ? (acEnergy / dcModulesTotal) * 100 : null;

  return <section className="no-print" style={{
    background: "linear-gradient(180deg,#17172a,#111122)",
    border: "1px solid " + theme.border, borderRadius: 16, padding: 16, marginBottom: 18
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
      <div>
        <p style={{ margin: 0, color: theme.primaryLight, fontSize: 11, fontWeight: 800 }}>ANÁLISE INTEGRADA DE RESULTADOS</p>
        <h2 style={{ margin: "5px 0 6px", fontSize: 22 }}>Temperatura, irradiância e grandezas elétricas no mesmo intervalo</h2>
        <p style={{ margin: 0, color: theme.muted, fontSize: 11 }}>
          Defina data, hora inicial e hora final no painel acima. O mesmo recorte é aplicado às integrais, às comparações e às curvas desta análise.
        </p>
      </div>
      <button type="button" onClick={loadIntegrated} style={primaryButton}>Atualizar dados</button>
    </div>

    <p style={{ color: loadedDate === date ? theme.muted : theme.warning, fontSize: 10, marginTop: 10 }}>{status}</p>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10, marginTop: 12 }}>
      {analysisGroups.map((group) => <div key={group.title} style={{ border: "1px solid " + theme.border, borderRadius: 12, padding: 11, background: "rgba(255,255,255,.025)" }}>
        <b style={{ fontSize: 12 }}>{group.title}</b>
        <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
          {group.items.map((item) => <label key={item.key} style={{ fontSize: 10.5, color: "#d4d4d8", display: "flex", gap: 7, alignItems: "flex-start" }}>
            <input type="checkbox" checked={selected.includes(item.key)} onChange={() => toggle(item.key)} />
            <span>{item.label} <span style={{ color: theme.muted }}>[{item.unit}]</span></span>
          </label>)}
        </div>
      </div>)}
    </div>

    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
      <label style={{ fontSize: 11 }}>Escala do eixo Y<br />
        <select value={scaleMode} onChange={(e) => setScaleMode(e.target.value)} style={{ ...inputStyle, width: 260 }}>
          <option value="real">Valores reais · mostra unidade física</option>
          <option value="normalized">Normalizada · % do máximo de cada série</option>
        </select>
      </label>
      <button type="button" onClick={() => { setSelected(["pv1Power","pv2Power","pv3Power","pv4Power","estimatedModulePower"]); setScaleMode("real"); }} style={secondaryButton}>Preset potência FV</button>
      <button type="button" onClick={() => { setSelected(["pv1Current","pv2Current","pv3Current","pv4Current"]); setScaleMode("real"); }} style={secondaryButton}>Preset correntes</button>
      <button type="button" onClick={() => { setSelected(["temp_sensor2","temp_sensor3","temp_sensor6","temp_sensor7","temp_sensor8","temp_sensor9","irradiance"]); setScaleMode("normalized"); }} style={secondaryButton}>Preset térmico + irradiância</button>
      <button type="button" onClick={() => { setSelected(["pv1EnergyInt","pv2EnergyInt","pv3EnergyInt","pv4EnergyInt","acEnergyInt"]); setScaleMode("real"); }} style={secondaryButton}>Preset energias</button>
    </div>

    <p style={{ margin: "8px 0 0", color: theme.muted, fontSize: 10.5 }}>
      Em valores reais, o eixo Y mostra a unidade física selecionada, como kW, V, A, Hz, °C, W/m² ou kWh. Para misturar grandezas de unidades diferentes no mesmo gráfico, use a escala normalizada.
    </p>

    <div style={{ marginTop: 14 }}>
      <AnalysisLineChart seriesMap={seriesMap} selected={selected} startTime={startTime} endTime={endTime} scaleMode={scaleMode} date={date} />
    </div>

    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9 }}>
      {moduleEnergy.map((item) => <div key={item.key} style={{ border: "1px solid " + theme.border, borderRadius: 10, padding: 10, background: "rgba(255,255,255,.025)" }}>
        <div style={{ color: theme.muted, fontSize: 10 }}>{item.key.replace("Power","").toUpperCase()} · energia integrada</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3 }}>{item.energy.toFixed(3)} kWh</div>
        <div style={{ color: theme.muted, fontSize: 10 }}>{dcModulesTotal > 0 ? ((item.energy / dcModulesTotal) * 100).toFixed(1) + "% da soma PV1–PV4" : "-"}</div>
      </div>)}
      <div style={{ border: "1px solid " + theme.border, borderRadius: 10, padding: 10, background: "rgba(124,58,237,.08)" }}>
        <div style={{ color: theme.muted, fontSize: 10 }}>Energia CA integrada</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3 }}>{acEnergy.toFixed(3)} kWh</div>
        <div style={{ color: theme.muted, fontSize: 10 }}>Eficiência energética no recorte: {energyEfficiency == null ? "-" : energyEfficiency.toFixed(1) + "%"}</div>
        <div style={{ color: theme.muted, fontSize: 9.5, marginTop: 3 }}>Energia calibrada pelos contadores acumulados da FoxESS.</div>
      </div>
    </div>

    <div style={{ marginTop: 16, border: "1px solid " + theme.border, borderRadius: 12, padding: 12, background: "rgba(255,255,255,.02)" }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Ferramenta de comparação</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
        <label style={{ fontSize: 11 }}>Série A · referência<br />
          <select value={compareA} onChange={(e) => setCompareA(e.target.value)} style={inputStyle}>
            {Object.values(analysisMeta).map((item) => <option key={"a-"+item.key} value={item.key}>{item.label} [{item.unit}]</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11 }}>Série B · comparação<br />
          <select value={compareB} onChange={(e) => setCompareB(e.target.value)} style={inputStyle}>
            {Object.values(analysisMeta).map((item) => <option key={"b-"+item.key} value={item.key}>{item.label} [{item.unit}]</option>)}
          </select>
        </label>
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 660, fontSize: 11 }}>
          <thead><tr style={{ textAlign: "left", color: theme.muted }}>
            <th style={th}>Série</th><th style={th}>N</th><th style={th}>Mín.</th><th style={th}>Máx.</th><th style={th}>Média</th><th style={th}>Integral</th>
          </tr></thead>
          <tbody>
            <tr style={{ borderTop: "1px solid " + theme.border }}>
              <td style={td}><b>{aMeta.label}</b></td><td style={td}>{aStats.count}</td>
              <td style={td}>{aStats.min == null ? "-" : aStats.min.toFixed(3) + " " + aMeta.unit}</td>
              <td style={td}>{aStats.max == null ? "-" : aStats.max.toFixed(3) + " " + aMeta.unit}</td>
              <td style={td}>{aStats.avg == null ? "-" : aStats.avg.toFixed(3) + " " + aMeta.unit}</td>
              <td style={td}>{aEnergy == null ? "-" : aEnergy.toFixed(4) + " kWh"}</td>
            </tr>
            <tr style={{ borderTop: "1px solid " + theme.border }}>
              <td style={td}><b>{bMeta.label}</b></td><td style={td}>{bStats.count}</td>
              <td style={td}>{bStats.min == null ? "-" : bStats.min.toFixed(3) + " " + bMeta.unit}</td>
              <td style={td}>{bStats.max == null ? "-" : bStats.max.toFixed(3) + " " + bMeta.unit}</td>
              <td style={td}>{bStats.avg == null ? "-" : bStats.avg.toFixed(3) + " " + bMeta.unit}</td>
              <td style={td}>{bEnergy == null ? "-" : bEnergy.toFixed(4) + " kWh"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ marginBottom: 0, color: theme.muted, fontSize: 10.5 }}>
        Correlação de Pearson aproximada no intervalo: <b style={{ color: theme.text }}>{corr == null ? "-" : corr.toFixed(3)}</b>
        {aEnergy !== null && bEnergy !== null && aEnergy > 0 ? " · Diferença energética B em relação a A: " + (((bEnergy - aEnergy) / aEnergy) * 100).toFixed(1) + "%" : ""}
      </p>
    </div>
  </section>;
}


function dateListForMonth(monthValue) {
  const [year, month] = String(monthValue).split("-").map(Number);
  if (!year || !month) return [];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) =>
    year + "-" + String(month).padStart(2, "0") + "-" + String(i + 1).padStart(2, "0")
  );
}

function dateListForYear(yearValue) {
  const year = Number(yearValue);
  if (!year) return [];
  const dates = [];
  for (let month = 1; month <= 12; month += 1) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) {
      dates.push(
        year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0")
      );
    }
  }
  return dates;
}

function todayIsoBrazil() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function fetchEnergyDayCached(date, startTime, endTime) {
  const key = "foxess-energy-v4|" + date + "|" + startTime + "|" + endTime;
  const today = todayIsoBrazil();

  if (typeof window !== "undefined" && date !== today) {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached && cached.savedAt && Date.now() - cached.savedAt < 7 * 24 * 3600000) {
        return cached.data;
      }
    } catch {}
  }

  const response = await fetch(
    "/api/history?source=foxess-energy-day&date=" + date +
    "&startTime=" + startTime + "&endTime=" + endTime
  );
  const json = await response.json();
  if (!json.ok) throw new Error(json.message || json.error || "Falha ao consultar " + date);

  if (typeof window !== "undefined" && date !== today) {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: json }));
    } catch {}
  }

  return json;
}

async function mapWithConcurrency(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runner() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) break;

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { ok: false, error: error.message, date: items[index] };
      }

      completed += 1;
      if (onProgress) onProgress(completed, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

function EnergyBarChart({ rows, selectedPVKeys, fileName }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);
  const keys = selectedPVKeys || [];
  const colors = {
    pv1Power: "#7c3aed",
    pv2Power: "#0284c7",
    pv3Power: "#16a34a",
    pv4Power: "#ea580c"
  };

  if (!rows.length) return <p style={{ color: theme.muted }}>Carregue um período para visualizar o gráfico.</p>;
  if (!keys.length) return <p style={{ color: theme.warning }}>Selecione pelo menos um módulo.</p>;

  const width = 1120;
  const height = 520;
  const left = 84, right = 26, top = 34, bottom = 100;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const values = rows.flatMap((row) => keys.map((key) => Number(row[key] || 0)));
  const maxValue = Math.max(0.001, ...values);
  const yMax = Math.ceil(maxValue * 10) / 10 || 0.1;
  const y = (value) => top + ((yMax - Number(value || 0)) / yMax) * plotHeight;
  const groupWidth = plotWidth / Math.max(1, rows.length);
  const gap = Math.min(5, groupWidth * 0.08);
  const barArea = Math.max(2, groupWidth - gap * 2);
  const barWidth = Math.max(1.5, barArea / Math.max(1, keys.length) - 1.5);

  function handleMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * (width / rect.width);
    if (svgX < left || svgX > width - right) {
      setHoverIndex(null);
      return;
    }
    const idx = Math.max(0, Math.min(rows.length - 1, Math.floor((svgX - left) / groupWidth)));
    setHoverIndex(idx);
  }

  const hover = hoverIndex === null ? null : rows[hoverIndex];
  const hoverX = hoverIndex === null ? null : left + hoverIndex * groupWidth + groupWidth / 2;
  const tooltipWidth = 240;
  const tooltipHeight = 42 + keys.length * 21;
  const tooltipX = hoverX === null
    ? 0
    : hoverX + tooltipWidth + 18 > width - right
      ? Math.max(left + 4, hoverX - tooltipWidth - 14)
      : hoverX + 12;

  const labelStep = rows.length <= 14 ? 1 : rows.length <= 31 ? 2 : Math.ceil(rows.length / 16);

  return <div style={{ overflowX: "auto" }}>
    <svg
      ref={svgRef}
      viewBox={"0 0 " + width + " " + height}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
      style={{ width: "100%", minWidth: 860, background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 12, cursor: "crosshair" }}
    >
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="12" />

      <text
        x="20"
        y={top + plotHeight / 2}
        transform={"rotate(-90 20 " + (top + plotHeight / 2) + ")"}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#374151"
      >
        Energia (kWh)
      </text>

      {[0, .25, .5, .75, 1].map((p) => {
        const yy = top + p * plotHeight;
        const value = yMax * (1 - p);
        return <g key={p}>
          <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e5e7eb" />
          <text x={left - 8} y={yy + 4} textAnchor="end" fill="#6b7280" fontSize="11">
            {value.toFixed(value >= 10 ? 1 : 2)}
          </text>
        </g>;
      })}

      {rows.map((row, rowIndex) => {
        const groupX = left + rowIndex * groupWidth + gap;
        return <g key={row.key || row.label || rowIndex}>
          {keys.map((key, keyIndex) => {
            const value = Number(row[key] || 0);
            const x = groupX + keyIndex * (barWidth + 1.5);
            const yy = y(value);
            return <rect
              key={key}
              x={x}
              y={yy}
              width={barWidth}
              height={Math.max(0, top + plotHeight - yy)}
              rx="1.5"
              fill={colors[key]}
            />;
          })}
          {(rowIndex % labelStep === 0 || rowIndex === rows.length - 1) && <text
            x={left + rowIndex * groupWidth + groupWidth / 2}
            y={top + plotHeight + 26}
            textAnchor="middle"
            fontSize="10.5"
            fill="#4b5563"
          >
            {row.label}
          </text>}
        </g>;
      })}

      <line x1={left} x2={left} y1={top} y2={top + plotHeight} stroke="#111827" />
      <line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke="#111827" />

      {keys.map((key, i) => <g key={"legend-" + key}>
        <rect x={left + i * 125} y={height - 44} width="12" height="12" rx="2" fill={colors[key]} />
        <text x={left + 18 + i * 125} y={height - 34} fontSize="11" fill="#374151">
          {key.replace("Power", "").toUpperCase()}
        </text>
      </g>)}

      {hover && hoverX !== null && <g pointerEvents="none" data-export-ignore="true">
        <line x1={hoverX} x2={hoverX} y1={top} y2={top + plotHeight} stroke="#111827" strokeDasharray="4 4" opacity="0.45" />
        <rect x={tooltipX} y={top + 12} width={tooltipWidth} height={tooltipHeight} rx="9" fill="#ffffff" stroke="#9ca3af" opacity="0.98" />
        <text x={tooltipX + 12} y={top + 32} fill="#111827" fontSize="11" fontWeight="700">{hover.fullLabel || hover.label}</text>
        {keys.map((key, i) => <g key={"tip-" + key}>
          <circle cx={tooltipX + 14} cy={top + 54 + i * 21} r="3.5" fill={colors[key]} />
          <text x={tooltipX + 24} y={top + 58 + i * 21} fill="#374151" fontSize="10.5">
            {key.replace("Power", "").toUpperCase()}: {Number(hover[key] || 0).toFixed(3)} kWh
          </text>
        </g>)}
      </g>}
    </svg>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
      <button type="button" onClick={() => downloadSvgGraphic(svgRef.current, fileName || "geracao_por_modulo", "png")} style={secondaryButton}>
        Baixar PNG
      </button>
      <button type="button" onClick={() => downloadSvgGraphic(svgRef.current, fileName || "geracao_por_modulo", "svg")} style={secondaryButton}>
        Baixar SVG
      </button>
    </div>
  </div>;
}

function EnergyAggregationPanel() {
  const now = new Date();
  const currentYear = Number(
    new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(now)
  );
  const currentMonth = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });

  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(todayBrazil());
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(String(currentYear));
  const [cutStart, setCutStart] = useState("05:30");
  const [cutEnd, setCutEnd] = useState("18:30");
  const [selectedPVKeys, setSelectedPVKeys] = useState(["pv1Power","pv2Power","pv3Power","pv4Power"]);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("Selecione o período e clique em Carregar gráfico.");
  const [loading, setLoading] = useState(false);

  function togglePV(key) {
    setSelectedPVKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  async function loadBars() {
    if (analysisTimeToMinutes(cutEnd) <= analysisTimeToMinutes(cutStart)) {
      setStatus("A hora final deve ser posterior à hora inicial.");
      return;
    }

    setLoading(true);
    setRows([]);

    try {
      if (mode === "day") {
        setStatus("Carregando geração horária...");
        const result = await fetchEnergyDayCached(day, cutStart, cutEnd);
        const hourlyRows = (result.hourly || []).map((item) => ({
          key: item.start,
          label: item.label,
          fullLabel: day.split("-").reverse().join("/") + " · " + item.label,
          pv1Power: Number(item.pv1Power || 0),
          pv2Power: Number(item.pv2Power || 0),
          pv3Power: Number(item.pv3Power || 0),
          pv4Power: Number(item.pv4Power || 0)
        }));
        setRows(hourlyRows);
        setStatus(
          hourlyRows.length
            ? "Geração hora a hora em " + day.split("-").reverse().join("/") + ", considerando apenas " + cutStart + " a " + cutEnd + "."
            : "Sem dados para o intervalo selecionado."
        );
        return;
      }

      const dates = mode === "month" ? dateListForMonth(month) : dateListForYear(year);
      const today = todayIsoBrazil();
      const usableDates = dates.filter((date) => date <= today);

      if (!usableDates.length) {
        setStatus("O período selecionado ainda não possui dias concluídos.");
        return;
      }

      setStatus("Carregando 0 de " + usableDates.length + " dias...");

      const daily = await mapWithConcurrency(
        usableDates,
        5,
        async (date) => fetchEnergyDayCached(date, cutStart, cutEnd),
        (done, total) => setStatus("Carregando " + done + " de " + total + " dias...")
      );

      if (mode === "month") {
        const monthRows = daily.map((item, index) => ({
          key: usableDates[index],
          label: String(index + 1).padStart(2, "0"),
          fullLabel: usableDates[index].split("-").reverse().join("/"),
          pv1Power: item.ok === false ? 0 : Number(item.totals?.pv1Power || 0),
          pv2Power: item.ok === false ? 0 : Number(item.totals?.pv2Power || 0),
          pv3Power: item.ok === false ? 0 : Number(item.totals?.pv3Power || 0),
          pv4Power: item.ok === false ? 0 : Number(item.totals?.pv4Power || 0)
        }));
        setRows(monthRows);
        const failed = daily.filter((item) => item.ok === false).length;
        setStatus(
          "Geração diária de " + month + ", considerando somente " + cutStart + " a " + cutEnd +
          (failed ? " · " + failed + " dia(s) sem resposta." : ".")
        );
        return;
      }

      const monthRows = Array.from({ length: 12 }, (_, i) => ({
        key: String(i + 1).padStart(2, "0"),
        label: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i],
        fullLabel: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][i] + " de " + year,
        pv1Power: 0, pv2Power: 0, pv3Power: 0, pv4Power: 0
      }));

      daily.forEach((item, index) => {
        if (item.ok === false) return;
        const monthIndex = Number(usableDates[index].slice(5, 7)) - 1;
        ["pv1Power","pv2Power","pv3Power","pv4Power"].forEach((key) => {
          monthRows[monthIndex][key] += Number(item.totals?.[key] || 0);
        });
      });

      setRows(monthRows);
      const failed = daily.filter((item) => item.ok === false).length;
      setStatus(
        "Geração mensal de " + year + ", somando em cada dia apenas " + cutStart + " a " + cutEnd +
        (failed ? " · " + failed + " dia(s) sem resposta." : ".")
      );
    } catch (error) {
      setStatus("Erro ao carregar gráfico: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const totals = selectedPVKeys.map((key) => ({
    key,
    energy: rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)
  }));
  const grandTotal = totals.reduce((sum, item) => sum + item.energy, 0);
  const selectedPeriodLabel = mode === "day" ? day : mode === "month" ? month : year;
  const energyFileName =
    "energia_modulos_" + mode + "_" + selectedPeriodLabel + "_" +
    cutStart.replace(":", "") + "_" + cutEnd.replace(":", "");

  return <section className="no-print" style={{
    background: "linear-gradient(180deg,#17172a,#111122)",
    border: "1px solid " + theme.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18
  }}>
    <div>
      <p style={{ margin: 0, color: theme.primaryLight, fontSize: 11, fontWeight: 800 }}>ENERGIA POR MÓDULO</p>
      <h2 style={{ margin: "5px 0 6px", fontSize: 22 }}>Gráfico de barras da geração integrada</h2>
      <p style={{ margin: 0, color: theme.muted, fontSize: 11 }}>
        No modo dia, as barras mostram energia hora a hora. No modo mês, mostram dia a dia. No modo ano, mostram mês a mês.
        O corte horário é aplicado separadamente a todos os dias antes da soma.
      </p>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 14 }}>
      <label style={{ fontSize: 11 }}>Visualização<br />
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}>
          <option value="day">Dia · hora a hora</option>
          <option value="month">Mês · dia a dia</option>
          <option value="year">Ano · mês a mês</option>
        </select>
      </label>

      {mode === "day" && <label style={{ fontSize: 11 }}>Data<br />
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle} />
      </label>}

      {mode === "month" && <label style={{ fontSize: 11 }}>Mês<br />
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
      </label>}

      {mode === "year" && <label style={{ fontSize: 11 }}>Ano<br />
        <input type="number" min="2020" max={currentYear} value={year} onChange={(e) => setYear(e.target.value)} style={inputStyle} />
      </label>}

      <label style={{ fontSize: 11 }}>Corte inicial<br />
        <input type="time" value={cutStart} onChange={(e) => setCutStart(e.target.value)} style={inputStyle} />
      </label>

      <label style={{ fontSize: 11 }}>Corte final<br />
        <input type="time" value={cutEnd} onChange={(e) => setCutEnd(e.target.value)} style={inputStyle} />
      </label>
    </div>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
      <span style={{ color: theme.muted, fontSize: 11 }}>Módulos:</span>
      {[
        ["pv1Power","PV1"],
        ["pv2Power","PV2"],
        ["pv3Power","PV3"],
        ["pv4Power","PV4"]
      ].map(([key,label]) => {
        const active = selectedPVKeys.includes(key);
        return <button type="button" key={key} onClick={() => togglePV(key)} style={{
          background: active ? theme.primary : "#111122",
          color: active ? "#fff" : theme.text,
          border: "1px solid " + (active ? theme.primaryLight : theme.border),
          borderRadius: 999,
          padding: "7px 12px",
          fontWeight: 800,
          cursor: "pointer",
          fontSize: 11
        }}>{label}</button>;
      })}

      <button type="button" onClick={loadBars} disabled={loading || !selectedPVKeys.length} style={primaryButton}>
        {loading ? "Carregando..." : "Carregar gráfico"}
      </button>
    </div>

    <p style={{ color: theme.muted, fontSize: 10.5, marginTop: 10 }}>{status}</p>

    <EnergyBarChart rows={rows} selectedPVKeys={selectedPVKeys} fileName={energyFileName} />

    {!!rows.length && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 9, marginTop: 12 }}>
      {totals.map((item) => <div key={item.key} style={{
        border: "1px solid " + theme.border, borderRadius: 10, padding: 10, background: "rgba(255,255,255,.025)"
      }}>
        <div style={{ color: theme.muted, fontSize: 10 }}>{item.key.replace("Power","").toUpperCase()} · total no recorte</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3 }}>{item.energy.toFixed(3)} kWh</div>
        <div style={{ color: theme.muted, fontSize: 10 }}>
          {grandTotal > 0 ? ((item.energy / grandTotal) * 100).toFixed(1) + "% da soma dos módulos exibidos" : "-"}
        </div>
      </div>)}
    </div>}

    <p style={{ color: theme.muted, fontSize: 10, marginBottom: 0, marginTop: 10 }}>
      Exemplo: ao selecionar 11:00 a 15:00 em um mês, cada barra diária considera somente a energia integrada entre 11:00 e 15:00 daquele dia.
      No modo anual, cada barra mensal é a soma desses mesmos recortes diários.
    </p>
  </section>;
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
          <p style={{ margin: 0, color: theme.primaryLight, fontWeight: 700 }}>Ferramenta de análise integrada</p>
          <h1 style={{ margin: "7px 0", fontSize: 30 }}>Análise de resultados e gráficos para o TFC</h1>
          <p style={{ margin: 0, color: theme.muted }}>Selecione data e horário, cruze temperaturas e grandezas elétricas e, quando disponível, inclua irradiância da estação INMET A514.</p>
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

    <IntegratedAnalysisPanel date={date} startTime={startTime} endTime={endTime} />

    <EnergyAggregationPanel />

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
