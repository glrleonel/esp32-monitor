import { useEffect, useState } from "react";

const SUPABASE_URL = "https://hkomutmuonfntowvdgjc.supabase.co";

function formatDate(dateString) {
  if (!dateString) return "-";

  return new Date(dateString).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function todayBrazil() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function temp(value) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(2);
}

function Card({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 14,
        padding: 18,
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

function Button({ children, onClick, color = "#007bff" }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 14px",
        background: color,
        color: "white",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        marginRight: 10,
        marginBottom: 10,
        fontWeight: "bold",
      }}
    >
      {children}
    </button>
  );
}

function TemperatureChart({ history }) {
  if (!history || history.length < 2) {
    return <p>Dados insuficientes para gerar gráfico.</p>;
  }

  const width = 900;
  const height = 280;
  const padding = 40;

  const series = [
    { key: "temp_sem_linha", label: "Sem linha" },
    { key: "temp_vermelha", label: "Vermelha" },
    { key: "temp_rosa", label: "Rosa" },
    { key: "temp_verde", label: "Verde" },
    { key: "temp_preta", label: "Preta" },
  ];

  const values = history.flatMap((h) =>
    series
      .map((s) => Number(h[s.key]))
      .filter((v) => !Number.isNaN(v) && v > -50 && v < 125)
  );

  if (values.length === 0) return <p>Sem temperaturas válidas.</p>;

  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);

  function x(i) {
    return padding + (i * (width - 2 * padding)) / (history.length - 1);
  }

  function y(value) {
    return height - padding - ((value - min) * (height - 2 * padding)) / (max - min);
  }

  function makePath(key) {
    return history
      .map((h, i) => {
        const value = Number(h[key]);
        if (Number.isNaN(value)) return null;
        return `${i === 0 ? "M" : "L"} ${x(i)} ${y(value)}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ background: "#fafafa", borderRadius: 10 }}>
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ccc" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#ccc" />

        <text x={8} y={padding + 5} fontSize="12">
          {max} °C
        </text>
        <text x={8} y={height - padding} fontSize="12">
          {min} °C
        </text>

        {series.map((s, index) => (
          <path
            key={s.key}
            d={makePath(s.key)}
            fill="none"
            strokeWidth="2"
            stroke={["#111", "#d00", "#d63384", "#198754", "#444"][index]}
          />
        ))}
      </svg>

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 12 }}>
        {series.map((s) => (
          <span key={s.key}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayBrazil());
  const [loadingCommand, setLoadingCommand] = useState(false);

  async function loadData() {
    try {
      const res = await fetch("/api/latest");
      const json = await res.json();
      setData(json.data);

      const alertRes = await fetch("/api/alerts");
      const alertJson = await alertRes.json();
      setAlerts(alertJson.data || []);

      const photoRes = await fetch("/api/photos");
      const photoJson = await photoRes.json();
      setPhotos(photoJson.data || []);

      const historyRes = await fetch("/api/history");
      const historyJson = await historyRes.json();
      setHistory(historyJson.data || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }

  async function createCommand(commandType, successMessage) {
    try {
      setLoadingCommand(true);

      const res = await fetch("/api/create-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command_type: commandType,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        alert(successMessage);
      } else {
        alert("Erro ao enviar comando.");
      }
    } catch (err) {
      alert("Falha de comunicação com a API.");
    } finally {
      setLoadingCommand(false);
    }
  }

  function sendCaptureCommand() {
    createCommand("capture_now", "Comando de captura enviado!");
  }

  function sendClearSDCommand() {
    const ok = confirm(
      "Tem certeza que deseja limpar as fotos do SD do ESP32-CAM? Faça isso somente depois de confirmar que as fotos foram enviadas para a nuvem."
    );

    if (!ok) return;

    createCommand("clear_uploaded_photos", "Comando para limpar SD enviado!");
  }

  function downloadDayZip() {
    window.open(`/api/download-day?date=${selectedDate}`, "_blank");
  }

  function exportCSV() {
    if (!history.length) {
      alert("Sem histórico para exportar.");
      return;
    }

    const headers = [
      "created_at",
      "temp_sem_linha",
      "temp_vermelha",
      "temp_rosa",
      "temp_verde",
      "temp_preta",
      "cam_ok",
      "sd_ok",
      "status",
    ];

    const rows = history.map((h) =>
      headers
        .map((key) => {
          const value = h[key] ?? "";
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(";")
    );

    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `temperaturas_${todayBrazil()}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return <h2 style={{ fontFamily: "Arial", padding: 20 }}>Carregando...</h2>;
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial", background: "#f4f6f8", minHeight: "100vh" }}>
      <h1>Monitoramento Fotovoltaico</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card title="Status geral">
          <h2>{data.status === "ok" ? "🟢 OK" : "🔴 FALHA"}</h2>
          <p>
            <b>Última leitura:</b> {formatDate(data.created_at)}
          </p>
          <p>
            <b>Última captura:</b> {formatDate(data.last_capture)}
          </p>
          <p>
            <b>Erro:</b> {data.error || "-"}
          </p>
        </Card>

        <Card title="Temperaturas">
          <p>Sem linha: {temp(data.temp_sem_linha)} °C</p>
          <p>Vermelha: {temp(data.temp_vermelha)} °C</p>
          <p>Rosa: {temp(data.temp_rosa)} °C</p>
          <p>Verde: {temp(data.temp_verde)} °C</p>
          <p>Preta: {temp(data.temp_preta)} °C</p>
        </Card>

        <Card title="ESP32-CAM">
          <p>CAM: {data.cam_ok ? "🟢 OK" : "🔴 OFF"}</p>
          <p>SD: {data.sd_ok ? "🟢 OK" : "🔴 FALHA"}</p>
          <p>
            <b>Última foto no CAM:</b>
            <br />
            {data.cam_last_photo || "Nenhuma foto registrada"}
          </p>
          <p>
            <b>Timestamp CAM:</b> {data.cam_timestamp || "-"}
          </p>
        </Card>
      </div>

      <Card title="Controle remoto">
        <Button onClick={sendCaptureCommand} color="#007bff">
          {loadingCommand ? "Enviando..." : "Capturar foto agora"}
        </Button>

        <Button onClick={sendClearSDCommand} color="#dc3545">
          Limpar SD do ESP32-CAM
        </Button>

        <Button onClick={loadData} color="#198754">
          Atualizar agora
        </Button>
      </Card>

      <br />

      <Card title="Baixar fotos por dia">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ padding: 8, marginRight: 10 }}
        />

        <Button onClick={downloadDayZip} color="#222">
          Baixar ZIP do dia
        </Button>
      </Card>

      <br />

      <Card title="Gráfico das temperaturas">
        <TemperatureChart history={history.slice().reverse()} />

        <br />

        <Button onClick={exportCSV} color="#6f42c1">
          Exportar CSV
        </Button>
      </Card>

      <br />

      <Card title="Fotos enviadas para a nuvem">
        {photos.length === 0 && <p>Nenhuma foto enviada ainda.</p>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {photos.map((p) => {
            const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/esp32-photos/${p.storage_path}`;

            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 10,
                  background: "#fafafa",
                }}
              >
                <img
                  src={imageUrl}
                  alt="Foto do experimento"
                  style={{
                    width: "100%",
                    maxHeight: 180,
                    objectFit: "cover",
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                />

                <p style={{ wordBreak: "break-all" }}>
                  <b>Arquivo:</b> {p.storage_path}
                </p>

                <p>
                  <b>Enviado em:</b> {formatDate(p.uploaded_at)}
                </p>

                <a href={imageUrl} target="_blank" rel="noreferrer">
                  Abrir imagem
                </a>
              </div>
            );
          })}
        </div>
      </Card>

      <br />

      <Card title="Alertas">
        {alerts.length === 0 && <p>Sem alertas</p>}

        <ul>
          {alerts.slice(0, 20).map((a) => (
            <li key={a.id}>
              {a.message} ({a.severity}) - {formatDate(a.created_at)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
