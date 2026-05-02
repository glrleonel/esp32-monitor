"use client";

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

  const diff = Math.floor((Date.now() - new Date(dateString)) / 1000);

  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;

  return `${Math.floor(diff / 3600)} h atrás`;
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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayBrazil());
  const [loadingCommand, setLoadingCommand] = useState(false);

  async function loadData() {
    try {
      const res = await fetch("/api/latest");
      const json = await res.json();
      setData(json.data);

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

  async function createCommand(commandType, msg) {
    try {
      setLoadingCommand(true);

      const res = await fetch("/api/create-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command_type: commandType }),
      });

      const json = await res.json();

      if (json.ok) alert(msg);
      else alert("Erro ao enviar comando.");
    } catch {
      alert("Falha na API.");
    } finally {
      setLoadingCommand(false);
    }
  }

  // ===== NOVOS COMANDOS =====
  const sendCapture = () => createCommand("capture_now", "Captura enviada!");
  const sendClear = () => createCommand("clear_uploaded_photos", "Limpeza enviada!");
  const sendTemps = () => createCommand("read_temps_now", "Leitura solicitada!");
  const sendRestartESP = () => createCommand("restart_normal", "Reiniciando ESP32...");
  const sendRestartCAM = () => createCommand("restart_cam", "Reiniciando CAM...");

  function downloadDayZip() {
    window.open(`/api/download-day?date=${selectedDate}`, "_blank");
  }

  function exportCSV() {
    if (!history.length) return alert("Sem dados.");

    const csv = history.map(h =>
      `${formatDate(h.created_at)};${h.temp_sem_linha};${h.temp_vermelha};${h.temp_rosa};${h.temp_verde};${h.temp_preta}`
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "dados.csv";
    a.click();
  }

  useEffect(() => {
    loadData();
    const i = setInterval(loadData, 5000);
    return () => clearInterval(i);
  }, []);

  if (!data) return <h2 style={{ padding: 20 }}>Carregando...</h2>;

  const systemOk = data.status === "ok" && data.cam_ok && data.sd_ok;

  return (
    <div style={{ padding: 20, fontFamily: "Arial", background: "#f4f6f8", minHeight: "100vh" }}>
      <h1>Monitoramento Fotovoltaico</h1>

      <Card title="Status geral">
        <h2 style={{ color: systemOk ? "#22c55e" : "#ef4444" }}>
          ● {systemOk ? "Operacional" : "Falha"}
        </h2>

        <p><b>Última leitura:</b> {formatDate(data.created_at)}</p>
        <p><b>Atualizado:</b> {timeAgo(data.created_at)}</p>
        <p><b>Erro:</b> {data.error || "-"}</p>
      </Card>

      <br />

      <Card title="Temperaturas">
        <p>Sem linha: {temp(data.temp_sem_linha)} °C</p>
        <p>Vermelha: {temp(data.temp_vermelha)} °C</p>
        <p>Rosa: {temp(data.temp_rosa)} °C</p>
        <p>Verde: {temp(data.temp_verde)} °C</p>
        <p>Preta: {temp(data.temp_preta)} °C</p>
      </Card>

      <br />

      <Card title="Controle remoto">
        <Button onClick={sendCapture}>Capturar foto</Button>
        <Button onClick={sendClear} color="#dc3545">Limpar SD</Button>

        <Button onClick={sendTemps} color="#6f42c1">
          Atualizar temperaturas
        </Button>

        <Button onClick={sendRestartESP} color="#343a40">
          Reiniciar ESP32
        </Button>

        <Button onClick={sendRestartCAM} color="#6610f2">
          Reiniciar CAM
        </Button>
      </Card>

      <br />

      <Card title="Exportação">
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        <br /><br />
        <Button onClick={downloadDayZip}>Baixar fotos</Button>
        <Button onClick={exportCSV} color="#6f42c1">Exportar CSV</Button>
      </Card>
    </div>
  );
}
