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
    <div style={{
      background: "#fff",
      border: "1px solid #e5e5e5",
      borderRadius: 14,
      padding: 18,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    }}>
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
  const height = 300;
  const padding = 45;

  const series = [
    { key: "temp_sem_linha", label: "Sem linha", color: "#111" },
    { key: "temp_vermelha", label: "Vermelha", color: "#d00" },
    { key: "temp_rosa", label: "Rosa", color: "#d63384" },
    { key: "temp_verde", label: "Verde", color: "#198754" },
    { key: "temp_preta", label: "Preta", color: "#444" },
  ];

  const values = history.flatMap((h) =>
    series
      .map((s) => Number(h[s.key]))
      .filter((v) => !Number.isNaN(v) && v > -50 && v < 125)
  );

  if (values.length === 0) return <p>Sem temperaturas válidas.</p>;

  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const labelStep = Math.max(1, Math.floor(history.length / 6));

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

        <text x={8} y={padding + 5} fontSize="12">{max} °C</text>
        <text x={8} y={height - padding} fontSize="12">{min} °C</text>

        {history
