"use client";

import { useEffect, useState } from "react";

const SUPABASE_URL = "https://hkomutmuonfntowvdgjc.supabase.co";

const theme = {
  bg: "#080812",
  bg2: "#111122",
  card: "#17172a",
  card2: "#1f1f3a",
  border: "#34235f",
  primary: "#7c3aed",
  primaryLight: "#a78bfa",
  primaryDark: "#4c1d95",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  ok: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
};

const sensorColors = {
  temp_sem_linha: "#a78bfa",
  temp_vermelha: "#ef4444",
  temp_rosa: "#ec4899",
  temp_verde: "#22c55e",
  temp_preta: "#e5e7eb",
};

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function formatTime(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(dateString) {
  if (!dateString) return "-";

  const diff = Math.max(
    0,
    Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  );

  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`;

  return `${Math.floor(diff / 86400)} dia(s) atrás`;
}

function todayBrazil() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function temp(v) {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toFixed(2);
}

function Card({ title, subtitle, children }) {
  return (
    <section
      style={{
        background: `linear-gradient(180deg, ${theme.card}, ${theme.card2})`,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 18px 45px rgba(0,0,0,0.35)",
      }}
    >
      <h2 style={{ margin: 0, color: theme.text, fontSize: 20 }}>{title}</h2>

      {subtitle && (
        <p style={{ marginTop: 6, color: theme.muted, fontSize: 13 }}>
          {subtitle}
        </p>
      )}

      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

function Button({ children, onClick, color = theme.primary, danger = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: danger ? theme.error : color,
        color: "white",
        border: "none",
        borderRadius: 10,
        padding: "11px 15px",
        marginRight: 10,
        marginBottom: 10,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 8px 22px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </button>
  );
}

function DateInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      style={{
        background: "#0f1020",
        color: theme.text,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 10,
        marginRight: 10,
        marginBottom: 10,
      }}
    />
  );
}

function TempBox({ label, value }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.055)",
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: 15,
      }}
    >
      <p style={{ margin: 0, color: theme.muted, fontSize: 13 }}>{label}</p>
      <h3 style={{ margin: "6px 0 0", fontSize: 24, color: theme.text }}>
        {temp(value)} <span style={{ fontSize: 14, color: theme.muted }}>°C</span>
      </h3>
    </div>
  );
}

function StatusDot({ ok, labelOk = "OK", labelFail = "Falha" }) {
  const color = ok ? theme.ok : theme.error;

  return (
    <span style={{ color, fontWeight: 700 }}>
      <span
        style={{
          display: "inline-block",
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          marginRight: 8,
          boxShadow: `0 0 12px ${color}`,
        }}
      />
      {ok ? labelOk : labelFail}
    </span>
  );
}

function TemperatureChart({ rows }) {
  const data = [...rows].reverse();

  if (!data.length) {
    return <p style={{ color: theme.muted }}>Sem dados para o dia selecionado.</p>;
  }

  const width = 950;
  const height = 340;
  const padding = 52;

  const series = [
    { key: "temp_sem_linha", label: "Sem linha", color: sensorColors.temp_sem_linha },
    { key: "temp_vermelha", label: "Vermelha", color: sensorColors.temp_vermelha },
    { key: "temp_rosa", label: "Rosa", color: sensorColors.temp_rosa },
    { key: "temp_verde", label: "Verde", color: sensorColors.temp_verde },
    { key: "temp_preta", label: "Preta", color: sensorColors.temp_preta },
  ];

  const values = data.flatMap((r) =>
    series
      .map((s) => Number(r[s.key]))
      .filter((v) => !Number.isNaN(v) && v > -50 && v < 125)
  );

  if (!values.length) {
    return <p style={{ color: theme.muted }}>Sem temperaturas válidas para o dia selecionado.</p>;
  }

  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const range = Math.max(1, max - min);

  function x(i) {
    if (data.length === 1) return width / 2;
    return padding + (i * (width - 2 * padding)) / (data.length - 1);
  }

  function y(value) {
    return height - padding - ((value - min) * (height - 2 * padding)) / range;
  }

  function makePath(key) {
    return data
      .map((r, i) => {
        const value = Number(r[key]);
        if (Number.isNaN(value)) return null;
        return `${i === 0 ? "M" : "L"} ${x(i)} ${y(value)}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  const labelStep = Math.max(1, Math.floor(data.length / 7));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={width}
        height={height}
        style={{
          background: "linear-gradient(180deg, #111122, #0b0b14)",
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          boxShadow: "inset 0 0 35px rgba(124,58,237,0.12)",
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const yy = padding + p * (height - 2 * padding);
          return (
            <line
              key={p}
              x1={padding}
              y1={yy}
              x2={width - padding}
              y2={yy}
              stroke="#2a2148"
            />
          );
        })}

        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#4b3b78" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#4b3b78" />

        <text x={12} y={padding + 5} fontSize="12" fill={theme.muted}>
          {max} °C
        </text>

        <text x={12} y={height - padding} fontSize="12" fill={theme.muted}>
          {min} °C
        </text>

        {data.map((r, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;

          return (
            <text
              key={i}
              x={x(i)}
              y={height - 16}
              fontSize="11"
              textAnchor="middle"
              fill={theme.muted}
            >
              {formatTime(r.created_at)}
            </text>
          );
        })}

        {series.map((s) => (
          <path
            key={s.key}
            d={makePath(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          marginTop: 12,
          color: theme.text,
        }}
      >
        {series.map((s) => (
          <span key={s.key} style={{ fontSize: 13 }}>
            <span style={{ color: s.color, fontWeight: 900 }}>●</span> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildCSV(rows) {
  const headers = [
    "data",
    "hora",
    "created_at",
    "temp_sem_linha",
    "temp_vermelha",
    "temp_rosa",
    "temp_verde",
    "temp_preta",
    "cam_ok",
    "sd_ok",
    "status",
    "error",
  ];

  const body = rows.map((r) => {
    const dataLocal = new Date(r.created_at).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    const horaLocal = new Date(r.created_at).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const values = [
      dataLocal,
      horaLocal,
      r.created_at ?? "",
      r.temp_sem_linha ?? "",
      r.temp_vermelha ?? "",
      r.temp_rosa ?? "",
      r.temp_verde ?? "",
      r.temp_preta ?? "",
      r.cam_ok ?? "",
      r.sd_ok ?? "",
      r.status ?? "",
      r.error ?? "",
    ];

    return values
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(";");
  });

  return [headers.join(";"), ...body].join("\n");
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [photos, setPhotos] = useState([]);

  const [startDate, setStartDate] = useState(todayBrazil());
  const [endDate, setEndDate] = useState(todayBrazil());
  const [selectedDate, setSelectedDate] = useState(todayBrazil());
  const [chartDate, setChartDate] = useState(todayBrazil());

  async function loadData() {
    try {
      const d = await fetch("/api/latest").then((r) => r.json());
      setData(d.data);

      const h = await fetch(`/api/history?start=${chartDate}&end=${chartDate}&limit=5000`).then((r) => r.json());
      setHistory(h.data || []);

      const p = await fetch("/api/photos").then((r) => r.json());
      setPhotos(p.data || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }

  useEffect(() => {
    loadData();
    const i = setInterval(loadData, 5000);
    return () => clearInterval(i);
  }, [chartDate]);

  async function createCommand(type, message) {
    try {
      await fetch("/api/create-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command_type: type }),
      });

      alert(message || "Comando enviado.");
      setTimeout(loadData, 1500);
    } catch (err) {
      alert("Falha ao enviar comando.");
    }
  }

  async function exportCSV() {
    const res = await fetch(`/api/history?start=${startDate}&end=${endDate}&limit=5000`);
    const json = await res.json();

    const rows = json.data || [];

    if (!rows.length) {
      alert("Sem dados nesse período.");
      return;
    }

    const csv = buildCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `temperaturas_${startDate}_a_${endDate}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  if (!data) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: theme.bg,
          color: theme.text,
          padding: 30,
          fontFamily: "Arial",
        }}
      >
        Carregando dashboard...
      </div>
    );
  }

  const systemOk = data.status === "ok" && data.cam_ok && data.sd_ok;
  const latestPhotos = photos.slice(0, 4);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at top left, rgba(124,58,237,0.35), transparent 35%), ${theme.bg}`,
        color: theme.text,
        padding: 24,
        fontFamily: "Arial",
      }}
    >
      <header
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.32), rgba(17,17,34,0.95))",
          border: `1px solid ${theme.border}`,
          borderRadius: 22,
          padding: 24,
          marginBottom: 20,
          boxShadow: "0 22px 60px rgba(0,0,0,0.35)",
        }}
      >
        <p style={{ margin: 0, color: theme.primaryLight, fontWeight: 700 }}>
          Sistema IoT de monitoramento fotovoltaico
        </p>

        <h1
          style={{
            margin: "8px 0 8px",
            fontSize: 36,
            color: theme.text,
            letterSpacing: "-0.04em",
          }}
        >
          Monitoramento Fotovoltaico
        </h1>

        <p style={{ margin: 0, color: theme.muted }}>
          Temperaturas, imagens, nuvem e controle remoto do experimento.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card title="Status geral" subtitle="Último estado recebido do ESP32 principal">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 999,
              border: `1px solid ${systemOk ? theme.ok : theme.warning}`,
              color: systemOk ? theme.ok : theme.warning,
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: systemOk ? theme.ok : theme.warning,
                boxShadow: `0 0 15px ${systemOk ? theme.ok : theme.warning}`,
              }}
            />
            {systemOk ? "Operacional" : "Parcial / Atenção"}
          </div>

          <p><b>Última leitura:</b> {formatDate(data.created_at)}</p>
          <p><b>Atualizado:</b> {timeAgo(data.created_at)}</p>
          <p><b>Última captura:</b> {formatDate(data.last_capture)}</p>
          <p><b>Erro:</b> {data.error || "-"}</p>
        </Card>

        <Card title="Temperaturas" subtitle="Última leitura enviada ao Supabase">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))",
              gap: 10,
            }}
          >
            <TempBox label="Sem linha" value={data.temp_sem_linha} />
            <TempBox label="Vermelha" value={data.temp_vermelha} />
            <TempBox label="Rosa" value={data.temp_rosa} />
            <TempBox label="Verde" value={data.temp_verde} />
            <TempBox label="Preta" value={data.temp_preta} />
          </div>
        </Card>

        <Card title="ESP32-CAM" subtitle="Status repassado pelo ESP32 principal">
          <p>
            <b>CAM:</b>{" "}
            <StatusDot ok={Boolean(data.cam_ok)} labelOk="Online" labelFail="Offline" />
          </p>

          <p>
            <b>SD:</b>{" "}
            <StatusDot ok={Boolean(data.sd_ok)} labelOk="OK" labelFail="Falha" />
          </p>

          <p>
            <b>Última foto no CAM:</b>
            <br />
            <span style={{ color: theme.muted, wordBreak: "break-all" }}>
              {data.cam_last_photo || "Nenhuma foto registrada"}
            </span>
          </p>

          <p>
            <b>Timestamp CAM:</b>{" "}
            <span style={{ color: theme.muted }}>{data.cam_timestamp || "-"}</span>
          </p>
        </Card>
      </div>

      <Card title="Gráfico das temperaturas" subtitle="Selecione um dia específico para visualizar as leituras">
        <div style={{ marginBottom: 12 }}>
          <DateInput value={chartDate} onChange={(e) => setChartDate(e.target.value)} />
        </div>

        <TemperatureChart rows={history} />
      </Card>

      <br />

      <Card title="Controle remoto" subtitle="Comandos enviados para execução pelo ESP32 principal">
        <Button
          onClick={() => createCommand("read_temps_now", "Leitura de temperatura solicitada.")}
          color={theme.primary}
        >
          Atualizar temperaturas
        </Button>

        <Button
          onClick={() => createCommand("capture_now", "Captura de foto solicitada.")}
          color={theme.primaryLight}
        >
          Capturar foto agora
        </Button>

        <Button onClick={loadData} color={theme.ok}>
          Atualizar dashboard
        </Button>

        <Button
          onClick={() => {
            if (confirm("Deseja reiniciar o ESP32 principal?")) {
              createCommand("restart_normal", "Comando para reiniciar ESP32 enviado.");
            }
          }}
          color="#334155"
        >
          Reiniciar ESP32
        </Button>

        <Button
          onClick={() => {
            if (confirm("Deseja reiniciar a ESP32-CAM?")) {
              createCommand("restart_cam", "Comando para reiniciar CAM enviado.");
            }
          }}
          color={theme.primaryDark}
        >
          Reiniciar CAM
        </Button>

        <Button
          onClick={() => {
            if (confirm("Limpar fotos já enviadas do SD da ESP32-CAM?")) {
              createCommand("clear_uploaded_photos", "Comando para limpar SD enviado.");
            }
          }}
          danger
        >
          Limpar SD do ESP32-CAM
        </Button>
      </Card>

      <br />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card title="Exportar dados de temperatura" subtitle="Escolha o intervalo de datas do CSV">
          <div style={{ marginBottom: 10 }}>
            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <Button onClick={exportCSV} color={theme.primary}>
            Baixar CSV do período
          </Button>
        </Card>

        <Card title="Baixar fotos por dia" subtitle="Baixa ZIP das fotos enviadas à nuvem">
          <DateInput value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />

          <Button
            onClick={() => window.open(`/api/download-day?date=${selectedDate}`, "_blank")}
            color={theme.primaryDark}
          >
            Baixar fotos do dia
          </Button>
        </Card>
      </div>

      <Card title="Últimas 4 fotos enviadas para a nuvem">
        {latestPhotos.length === 0 && (
          <p style={{ color: theme.muted }}>Nenhuma foto enviada ainda.</p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {latestPhotos.map((p) => {
            const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/esp32-photos/${p.storage_path}`;

            return (
              <div
                key={p.id}
                style={{
                  background: "#f8fafc",
                  color: "#111827",
                  borderRadius: 14,
                  padding: 12,
                  border: "1px solid #ddd",
                }}
              >
                <img
                  src={imageUrl}
                  alt="Foto do experimento"
                  style={{
                    width: "100%",
                    maxHeight: 180,
                    objectFit: "cover",
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                />

                <p style={{ wordBreak: "break-all", fontSize: 13 }}>
                  <b>Arquivo:</b> {p.storage_path}
                </p>

                <p style={{ fontSize: 13 }}>
                  <b>Enviado em:</b> {formatDate(p.uploaded_at)}
                </p>

                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: theme.primary, fontWeight: 700 }}
                >
                  Abrir imagem
                </a>
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
