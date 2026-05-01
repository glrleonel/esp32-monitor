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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [photos, setPhotos] = useState([]);

  async function loadData() {
    const res = await fetch("/api/latest");
    const json = await res.json();
    setData(json.data);

    const alertRes = await fetch("/api/alerts");
    const alertJson = await alertRes.json();
    setAlerts(alertJson.data || []);

    const photoRes = await fetch("/api/photos");
    const photoJson = await photoRes.json();
    setPhotos(photoJson.data || []);
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
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Monitoramento Fotovoltaico</h1>

      <h2>Status: {data.status === "ok" ? "🟢 OK" : "🔴 FALHA"}</h2>

      <h3>Última leitura: {formatDate(data.created_at)}</h3>

      <h2>Temperaturas</h2>
      <ul>
        <li>Sem linha: {data.temp_sem_linha ?? "-"} °C</li>
        <li>Vermelha: {data.temp_vermelha ?? "-"} °C</li>
        <li>Rosa: {data.temp_rosa ?? "-"} °C</li>
        <li>Verde: {data.temp_verde ?? "-"} °C</li>
        <li>Preta: {data.temp_preta ?? "-"} °C</li>
      </ul>

      <h2>ESP32-CAM</h2>
      <p>CAM: {data.cam_ok ? "🟢 OK" : "🔴 OFF"}</p>
      <p>SD: {data.sd_ok ? "🟢 OK" : "🔴 FALHA"}</p>

      <h2>Última Foto no CAM</h2>
      <p>{data.cam_last_photo || "Nenhuma foto registrada"}</p>

      <h2>Fotos enviadas para a nuvem</h2>

      {photos.length === 0 && <p>Nenhuma foto enviada ainda.</p>}

      {photos.map((p) => {
        const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/esp32-photos/${p.storage_path}`;

        return (
          <div
            key={p.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              maxWidth: 500,
            }}
          >
            <p>
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

      <h2>Alertas</h2>
      {alerts.length === 0 && <p>Sem alertas</p>}

      <ul>
        {alerts.map((a) => (
          <li key={a.id}>
            {a.message} ({a.severity}) - {formatDate(a.created_at)}
          </li>
        ))}
      </ul>
    </div>
  );
}
