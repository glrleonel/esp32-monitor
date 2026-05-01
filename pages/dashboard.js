import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);

  async function loadData() {
    const res = await fetch("/api/latest");
    const json = await res.json();
    setData(json.data);

    const alertRes = await fetch("/api/alerts");
    const alertJson = await alertRes.json();
    setAlerts(alertJson.data);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return <h2>Carregando...</h2>;

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Monitoramento Fotovoltaico</h1>

      <h2>Status: {data.status === "ok" ? "🟢 OK" : "🔴 FALHA"}</h2>

      <h3>Última leitura: {data.created_at}</h3>

      <h2>Temperaturas</h2>
      <ul>
        <li>Sem linha: {data.temp_sem_linha} °C</li>
        <li>Vermelha: {data.temp_vermelha} °C</li>
        <li>Rosa: {data.temp_rosa} °C</li>
        <li>Verde: {data.temp_verde} °C</li>
        <li>Preta: {data.temp_preta} °C</li>
      </ul>

      <h2>ESP32-CAM</h2>
      <p>CAM: {data.cam_ok ? "🟢 OK" : "🔴 OFF"}</p>
      <p>SD: {data.sd_ok ? "🟢 OK" : "🔴 FALHA"}</p>

      <h2>Última Foto</h2>
      <p>{data.cam_last_photo}</p>

      <h2>Alertas</h2>
      {alerts.length === 0 && <p>Sem alertas</p>}
      <ul>
        {alerts.map((a) => (
          <li key={a.id}>
            {a.message} ({a.severity})
          </li>
        ))}
      </ul>
    </div>
  );
}
