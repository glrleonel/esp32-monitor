"use client";

import { useEffect, useState } from "react";

const SUPABASE_URL = "https://hkomutmuonfntowvdgjc.supabase.co";

export default function Dashboard() {
  const [logged, setLogged] = useState(false);
  const [role, setRole] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const [data, setData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  async function login() {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user, pass }),
    });

    const json = await res.json();

    if (json.ok) {
      setLogged(true);
      setRole(json.role);
    } else {
      alert("Login inválido");
    }
  }

  async function loadData() {
    const res = await fetch("/api/latest");
    const json = await res.json();
    setData(json.data);

    const photoRes = await fetch("/api/photos");
    const photoJson = await photoRes.json();
    setPhotos(photoJson.data || []);

    const historyRes = await fetch("/api/history");
    const historyJson = await historyRes.json();
    setHistory(historyJson.data || []);
  }

  async function sendCommand(type) {
    await fetch("/api/create-command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command_type: type }),
    });

    alert("Comando enviado!");
  }

  function downloadZip() {
    window.open(`/api/download-day?date=${selectedDate}`, "_blank");
  }

  useEffect(() => {
    if (!logged) return;

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [logged]);

  if (!logged) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Login</h2>

        <input
          placeholder="Usuário"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <br />

        <input
          type="password"
          placeholder="Senha"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <br />

        <button onClick={login}>Entrar</button>
      </div>
    );
  }

  if (!data) return <h2>Carregando...</h2>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Monitoramento Fotovoltaico</h1>

      <p>Status: {data.status}</p>
      <p>Última leitura: {data.created_at}</p>

      <h2>Temperaturas</h2>
      <p>Sem linha: {data.temp_sem_linha}</p>
      <p>Vermelha: {data.temp_vermelha}</p>
      <p>Rosa: {data.temp_rosa}</p>
      <p>Verde: {data.temp_verde}</p>
      <p>Preta: {data.temp_preta}</p>

      <h2>Controle</h2>

      {role === "admin" && (
        <>
          <button onClick={() => sendCommand("capture_now")}>
            Capturar foto
          </button>

          <button onClick={() => sendCommand("clear_uploaded_photos")}>
            Limpar SD
          </button>
        </>
      )}

      <h2>Baixar fotos</h2>

      <input
        type="date"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
      />

      <button onClick={downloadZip}>Baixar ZIP</button>

      <h2>Últimas fotos</h2>

      {photos.slice(0, 4).map((p) => (
        <div key={p.id}>
          <p>{p.storage_path}</p>
          <img
            src={`${SUPABASE_URL}/storage/v1/object/public/esp32-photos/${p.storage_path}`}
            width="200"
          />
        </div>
      ))}
    </div>
  );
}
