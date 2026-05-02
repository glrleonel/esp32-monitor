"use client";

import { useEffect, useState } from "react";

const SUPABASE_URL = "https://hkomutmuonfntowvdgjc.supabase.co";

const theme = {
  bg: "#0b0b14",
  card: "#17172a",
  border: "#2e2e4d",
  primary: "#7c3aed",
  primaryLight: "#a78bfa",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  ok: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
};

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
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

function temp(v) {
  if (v === null || v === undefined) return "-";
  return Number(v).toFixed(2);
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [photos, setPhotos] = useState([]);

  const [startDate, setStartDate] = useState(todayBrazil());
  const [endDate, setEndDate] = useState(todayBrazil());
  const [selectedDate, setSelectedDate] = useState(todayBrazil());

  async function loadData() {
    const d = await fetch("/api/latest").then(r => r.json());
    setData(d.data);

    const h = await fetch("/api/history").then(r => r.json());
    setHistory(h.data || []);

    const p = await fetch("/api/photos").then(r => r.json());
    setPhotos(p.data || []);
  }

  useEffect(() => {
    loadData();
    const i = setInterval(loadData, 5000);
    return () => clearInterval(i);
  }, []);

  async function createCommand(type) {
    await fetch("/api/create-command", {
      method: "POST",
      body: JSON.stringify({ command_type: type }),
    });
  }

  async function exportCSV() {
    const res = await fetch(`/api/history?start=${startDate}&end=${endDate}`);
    const json = await res.json();

    const rows = json.data;

    if (!rows.length) return alert("Sem dados.");

    const csv = rows.map(r =>
      `${r.created_at};${r.temp_sem_linha};${r.temp_vermelha};${r.temp_rosa};${r.temp_verde};${r.temp_preta}`
    ).join("\n");

    const blob = new Blob([csv]);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "dados.csv";
    a.click();
  }

  if (!data) return <div>Carregando...</div>;

  return (
    <div style={{ background: theme.bg, color: theme.text, padding: 20 }}>

      <h1>Monitoramento Fotovoltaico</h1>

      <h2 style={{ color: data.status === "ok" ? theme.ok : theme.error }}>
        ● {data.status === "ok" ? "Operacional" : "Falha"}
      </h2>

      <p>Última leitura: {formatDate(data.created_at)}</p>
      <p>Atualizado: {timeAgo(data.created_at)}</p>

      <h3>Temperaturas</h3>
      <p>Sem linha: {temp(data.temp_sem_linha)}°C</p>
      <p>Vermelha: {temp(data.temp_vermelha)}°C</p>

      <h3>Controle</h3>

      <button onClick={() => createCommand("read_temps_now")}>
        Atualizar temperaturas
      </button>

      <button onClick={() => createCommand("restart_normal")}>
        Reiniciar ESP32
      </button>

      <button onClick={() => createCommand("restart_cam")}>
        Reiniciar CAM
      </button>

      <h3>Exportar CSV</h3>

      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />

      <button onClick={exportCSV}>Baixar CSV</button>

      <h3>Fotos</h3>

      <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
      <button onClick={() => window.open(`/api/download-day?date=${selectedDate}`)}>
        Baixar fotos do dia
      </button>

      {photos.slice(0,4).map(p => (
        <div key={p.id}>
          <img
            src={`${SUPABASE_URL}/storage/v1/object/public/esp32-photos/${p.storage_path}`}
            width="200"
          />
        </div>
      ))}

    </div>
  );
}
