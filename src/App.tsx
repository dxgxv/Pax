/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Wrench,
  Activity,
  Cpu,
  ShieldCheck,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Terminal,
  SlidersHorizontal,
  GitBranch,
  Copy,
  Check,
  X,
  FolderGit2,
  FileCode2,
} from "lucide-react";
import {
  getSemaforoKey,
  type Equipo,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type OTRepuestoItem,
  type EventoHistorial,
} from "./data/catalogs";
import EstacionTrabajo from "./components/EstacionTrabajo";
import SemaforoPatio from "./components/SemaforoPatio";
import EnrolarMaquina from "./components/EnrolarMaquina";
import PanelJefatura from "./components/PanelJefatura";

type TabKey = "estacion" | "semaforo" | "enrolar" | "jefatura";

interface ApiStateResponse {
  equipos: Equipo[];
  presupuestos: Presupuesto[];
  ordenes_trabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  ot_repuestos: OTRepuestoItem[];
  historial: EventoHistorial[];
  gasto_total: number;
  config: {
    telefono_taller: string;
    gemini_configured: boolean;
    using_default_password: boolean;
  };
}

export default function App() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [otRepuestos, setOtRepuestos] = useState<OTRepuestoItem[]>([]);
  const [historial, setHistorial] = useState<EventoHistorial[]>([]);
  const [gastoTotal, setGastoTotal] = useState<number>(0);
  const [telefonoTaller, setTelefonoTaller] = useState<string>("56912345678");

  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabKey>("estacion");
  const [equipoActivo, setEquipoActivo] = useState<string>("");
  const [nfcDetectedId, setNfcDetectedId] = useState<string | null>(null);
  const [isJefe, setIsJefe] = useState<boolean>(false);
  const [showGithubModal, setShowGithubModal] = useState<boolean>(false);
  const [ghUser, setGhUser] = useState<string>("tu-usuario");
  const [ghRepo, setGhRepo] = useState<string>("rental-valdivia-nfc");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const [flashMessage, setFlashMessage] = useState<{
    text: string;
    type: "success" | "error" | "warning";
  } | null>(null);

  const showFlash = useCallback(
    (text: string, type: "success" | "error" | "warning" = "success") => {
      setFlashMessage({ text, type });
      setTimeout(() => {
        setFlashMessage((prev) => (prev?.text === text ? null : prev));
      }, 4500);
    },
    []
  );

  const fetchState = useCallback(
    async (flashMsg?: {
      type: "success" | "warning" | "error";
      text: string;
    }) => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error("Error cargando estado del servidor");
        const json: ApiStateResponse = await res.json();

        setEquipos(json.equipos || []);
        setPresupuestos(json.presupuestos || []);
        setOrdenesTrabajo(json.ordenes_trabajo || []);
        setRepuestos(json.repuestos || []);
        setOtRepuestos(json.ot_repuestos || []);
        setHistorial(json.historial || []);
        setGastoTotal(json.gasto_total || 0);
        if (json.config?.telefono_taller) {
          setTelefonoTaller(json.config.telefono_taller);
        }

        const params = new URLSearchParams(window.location.search);
        const urlId = params.get("id")?.toUpperCase();

        if (urlId && json.equipos.some((e) => e.codigo === urlId)) {
          setEquipoActivo(urlId);
          setNfcDetectedId(urlId);
        } else {
          setEquipoActivo((prev) => {
            if (prev && json.equipos.some((e) => e.codigo === prev)) {
              return prev;
            }
            return json.equipos[0]?.codigo || "";
          });
        }

        if (flashMsg) {
          showFlash(flashMsg.text, flashMsg.type);
        }
      } catch (err) {
        console.error(err);
        showFlash("Error de comunicación con el servidor industrial.", "error");
      } finally {
        setLoading(false);
      }
    },
    [showFlash]
  );

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleOpenFicha = (codigo: string) => {
    setEquipoActivo(codigo);
    setActiveTab("estacion");
    const url = new URL(window.location.href);
    url.searchParams.set("id", codigo);
    window.history.replaceState({}, "", url.toString());
  };

  const handleSimulateNfcScan = (codigo: string) => {
    setEquipoActivo(codigo);
    if (codigo) {
      setNfcDetectedId(codigo);
      setActiveTab("estacion");
      const url = new URL(window.location.href);
      url.searchParams.set("id", codigo);
      window.history.replaceState({}, "", url.toString());
      showFlash(
        `Lectura NFC vinculada: equipo ${codigo} cargado en consola.`,
        "success"
      );
    } else {
      setNfcDetectedId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("id");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleUnlockJefe = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/jefe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setIsJefe(true);
        showFlash("Sesión de Jefatura desbloqueada correctamente.", "success");
        return true;
      } else {
        showFlash(json.error || "Contraseña incorrecta.", "error");
        return false;
      }
    } catch {
      showFlash("Error al verificar credenciales de Jefatura.", "error");
      return false;
    }
  };

  const copyCommand = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const fleetCounts = useMemo(() => {
    let operativas = 0;
    let mantencion = 0;
    let pana = 0;
    let presupuesto = 0;
    for (const m of equipos) {
      const k = getSemaforoKey(m.semaforo);
      if (k === "OPERATIVA") operativas++;
      else if (k === "MANTENCION") mantencion++;
      else if (k === "PANA") pana++;
      else if (k === "PRESUPUESTO") presupuesto++;
    }
    return {
      operativas,
      mantencion,
      pana,
      presupuesto,
      total: equipos.length,
    };
  }, [equipos]);

  const gitTerminalBlock = `git init
git branch -M main
git add .
git commit -m "feat: Rental Valdivia V12 - Web React/Node + Python Streamlit"
git remote add origin https://github.com/${ghUser.trim() || "tu-usuario"}/${
    ghRepo.trim() || "rental-valdivia-nfc"
  }.git
git push -u origin main`;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#E2E8F0] text-[#0F172A]">
      {/* BARRA LATERAL OSCURA (GRIS TITANIO + VERDE BOSQUE + AZUL ACERO) */}
      <aside className="w-full lg:w-72 bg-[#0F172A] text-slate-100 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 flex flex-col justify-between">
        <div>
          {/* Bloque de Identidad Industrial */}
          <div className="p-5 bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#0F172A] border-b border-emerald-800/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-950/60 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-300 font-semibold">
                    SISTEMA INDUSTRIAL V12
                  </span>
                </div>
                <h1 className="text-lg font-extrabold tracking-tight text-white leading-tight">
                  RENTAL VALDIVIA
                </h1>
                <p className="text-[11px] text-emerald-100/80 font-medium">
                  Control de Taller & Telemetría NFC
                </p>
              </div>
            </div>
          </div>

          {/* Menú de Navegación Vertical con Iconos Técnicos */}
          <div className="p-3.5 space-y-1.5">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-slate-400 font-semibold">
              Módulos de Operación
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("estacion")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "estacion"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4" />
                Estación de Trabajo
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900/50 text-sky-200">
                OT / NFC
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("semaforo")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "semaforo"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Activity className="w-4 h-4" />
                Semáforo del Patio
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900/50 text-emerald-300">
                {fleetCounts.total} EQ
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("enrolar")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "enrolar"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4" />
                Enrolar Máquina (NFC)
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900/50 text-slate-300">
                QR
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("jefatura")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "jefatura"
                  ? "bg-[#0284C7] text-white shadow-sm border-l-4 border-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4" />
                Panel de Jefatura
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isJefe
                    ? "bg-emerald-400 shadow-[0_0_8px_#10B981]"
                    : fleetCounts.presupuesto > 0
                    ? "bg-purple-400 shadow-[0_0_8px_#A855F7]"
                    : "bg-slate-600"
                }`}
              />
            </button>
          </div>

          {/* Simulador de Escaneo NFC en Terreno */}
          <div className="mx-3.5 my-3 p-3.5 rounded-lg bg-[#1E293B] border border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-sky-400 font-bold">
                <Radio className="w-3.5 h-3.5" />
                Lector NFC en Terreno
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  nfcDetectedId
                    ? "bg-emerald-400 shadow-[0_0_8px_#10B981]"
                    : "bg-slate-500"
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Simula acercar el teléfono del mecánico al tag NFC adherido al
              chasis:
            </p>
            <select
              value={nfcDetectedId || ""}
              onChange={(e) => handleSimulateNfcScan(e.target.value)}
              className="w-full bg-[#0F172A] border border-slate-600 rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
            >
              <option value="">-- Modo Manual (Sin Tag NFC) --</option>
              {equipos.slice(0, 100).map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  Tag NFC: {m.codigo} ({m.nombre})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen Telemetría de Flota en el pie del Sidebar */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span>ESTADO ACTUAL DEL PATIO</span>
            <span>{fleetCounts.total} UNIDADES</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981]" />
                Operativas
              </span>
              <span className="font-bold text-emerald-400">
                {fleetCounts.operativas}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_#F59E0B]" />
                Mantención
              </span>
              <span className="font-bold text-amber-400">
                {fleetCounts.mantencion}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#EF4444]" />
                En Pana
              </span>
              <span className="font-bold text-red-400">{fleetCounts.pana}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_6px_#A855F7]" />
                Presupuesto
              </span>
              <span className="font-bold text-purple-400">
                {fleetCounts.presupuesto}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ENCABEZADO SUPERIOR OSCURO INDUSTRIAL */}
        <header className="bg-[#0F172A] text-white border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 text-sky-400" />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                CONSOLA DE OPERACIONES &bull; VALDIVIA, CHILE
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                {activeTab === "estacion" &&
                  "Estación de Trabajo e Intervención Técnica"}
                {activeTab === "semaforo" &&
                  "Tablero de Control y Semáforo de Disponibilidad"}
                {activeTab === "enrolar" &&
                  "Enrolamiento de Maquinaria y Vinculación NFC"}
                {activeTab === "jefatura" &&
                  "Dirección Técnica, Bodega y Auditoría de Costos"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {nfcDetectedId && (
              <div className="bg-[#064E3B] border border-emerald-500/50 text-emerald-200 px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
                TAG NFC ACTIVO:{" "}
                <strong className="text-white">{nfcDetectedId}</strong>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGithubModal(true)}
              className="bg-[#065F46] hover:bg-[#047857] text-white border border-emerald-500/40 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 text-emerald-300" />
              Subir a GitHub
            </button>

            <button
              type="button"
              onClick={() => fetchState()}
              className="bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              Sincronizar
            </button>
          </div>
        </header>

        {/* MODAL INTERACTIVO DE SUBIDA A GITHUB */}
        {showGithubModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#F8FAFC] border border-slate-400 rounded-lg max-w-2xl w-full shadow-2xl overflow-hidden">
              <div className="bg-[#0F172A] text-white px-5 py-4 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-[#065F46] border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <FolderGit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 block">
                      REPOSITORIO GIT INICIALIZADO Y DOCUMENTADO
                    </span>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      Guía Paso a Paso para Subir Rental Valdivia a GitHub
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGithubModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs text-slate-700">
                {/* Resumen de archivos preparados */}
                <div className="bg-emerald-50 border border-emerald-300 rounded-md p-3.5 flex items-start gap-3 text-emerald-950">
                  <FileCode2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold uppercase tracking-wider text-xs">
                      Proyecto Preparado con Versión Dual (Web + Python)
                    </div>
                    <p className="text-emerald-900 leading-relaxed">
                      El repositorio ya cuenta con commit en la rama{" "}
                      <code className="font-mono font-bold">main</code>,{" "}
                      <code className="font-mono font-bold">README.md</code>,{" "}
                      <code className="font-mono font-bold">.gitignore</code>, la
                      aplicación web completa React + Express y el script Python
                      original en{" "}
                      <code className="font-mono font-bold">
                        public/assets/aistudio/pax.v12_53458089.py
                      </code>{" "}
                      junto a <code className="font-mono font-bold">requirements.txt</code>.
                    </p>
                  </div>
                </div>

                {/* Opción A: Botón Nativo de AI Studio */}
                <div className="bg-white border border-slate-300 rounded-md p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                      Opción 1 (Más Rápida): Exportación Directa desde la Barra de AI Studio
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#0284C7] text-white font-mono text-[10px] font-bold">
                      RECOMENDADO
                    </span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed">
                    <li>
                      En la esquina superior derecha de esta ventana de{" "}
                      <strong>Google AI Studio</strong>, haz clic en el icono de{" "}
                      <strong>GitHub</strong> (o en el menú de descarga/exportación).
                    </li>
                    <li>
                      Autoriza tu cuenta de GitHub si es la primera vez que la
                      conectas.
                    </li>
                    <li>
                      Escribe el nombre de tu nuevo repositorio (ej.{" "}
                      <code className="font-mono font-bold text-slate-900">
                        rental-valdivia-nfc
                      </code>
                      ), elige visibilidad <strong>Privada</strong> o{" "}
                      <strong>Pública</strong> y presiona{" "}
                      <strong>Create &amp; Push</strong>.
                    </li>
                  </ol>
                </div>

                {/* Opción B: Desde tu computador con Git */}
                <div className="bg-white border border-slate-300 rounded-md p-4 space-y-3">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                    Opción 2: Subida por Terminal Git (Descargando el ZIP del Proyecto)
                  </div>
                  <p className="text-slate-600">
                    Personaliza tu usuario y nombre de repositorio para generar
                    los comandos exactos:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                        Tu Usuario de GitHub
                      </label>
                      <input
                        type="text"
                        value={ghUser}
                        onChange={(e) => setGhUser(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                        Nombre del Nuevo Repositorio
                      </label>
                      <input
                        type="text"
                        value={ghRepo}
                        onChange={(e) => setGhRepo(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="bg-[#0F172A] text-emerald-300 rounded-md p-3 font-mono text-[11px] relative">
                    <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {gitTerminalBlock}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyCommand("git-block", gitTerminalBlock)}
                      className="absolute top-2.5 right-2.5 bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded text-[10px] font-sans font-semibold flex items-center gap-1 border border-slate-600 cursor-pointer"
                    >
                      {copiedCmd === "git-block" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedCmd === "git-block" ? "Copiado" : "Copiar Comandos"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 border-t border-slate-300 px-5 py-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGithubModal(false)}
                  className="bg-[#0F172A] hover:bg-slate-800 text-white font-bold px-4 py-2 rounded text-xs uppercase tracking-wider cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notificación Flash sin emojis */}
        {flashMessage && (
          <div className="px-6 pt-4">
            <div
              className={`px-4 py-3 rounded-md border flex items-center justify-between shadow-sm text-xs font-bold uppercase tracking-wider ${
                flashMessage.type === "success"
                  ? "bg-emerald-950 text-emerald-200 border-emerald-600"
                  : flashMessage.type === "warning"
                  ? "bg-amber-950 text-amber-200 border-amber-600"
                  : "bg-red-950 text-red-200 border-red-600"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {flashMessage.type === "success" && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                {flashMessage.type === "warning" && (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                {flashMessage.type === "error" && (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{flashMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFlashMessage(null)}
                className="text-[10px] font-mono underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                CERRAR
              </button>
            </div>
          </div>
        )}

        {/* Cuerpo Principal */}
        <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto">
          {loading ? (
            <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg p-12 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-[#0284C7] animate-spin mx-auto" />
              <p className="text-xs font-mono uppercase tracking-wider text-slate-600">
                Cargando base de datos operativa de Rental Valdivia...
              </p>
            </div>
          ) : (
            <>
              {activeTab === "estacion" && (
                <EstacionTrabajo
                  equipos={equipos}
                  equipoActivo={equipoActivo}
                  setEquipoActivo={setEquipoActivo}
                  presupuestos={presupuestos}
                  ordenesTrabajo={ordenesTrabajo}
                  repuestos={repuestos}
                  otRepuestos={otRepuestos}
                  historial={historial}
                  telefonoTaller={telefonoTaller}
                  isJefe={isJefe}
                  onRefresh={fetchState}
                  onNavigateJefatura={() => setActiveTab("jefatura")}
                />
              )}

              {activeTab === "semaforo" && (
                <SemaforoPatio
                  equipos={equipos}
                  isJefe={isJefe}
                  onOpenFicha={handleOpenFicha}
                  onRefresh={fetchState}
                />
              )}

              {activeTab === "enrolar" && (
                <EnrolarMaquina
                  equipos={equipos}
                  onRefresh={fetchState}
                  onOpenFicha={handleOpenFicha}
                />
              )}

              {activeTab === "jefatura" && (
                <PanelJefatura
                  equipos={equipos}
                  presupuestos={presupuestos}
                  ordenesTrabajo={ordenesTrabajo}
                  repuestos={repuestos}
                  otRepuestos={otRepuestos}
                  historial={historial}
                  gastoTotal={gastoTotal}
                  isJefe={isJefe}
                  onUnlockJefe={handleUnlockJefe}
                  onLockJefe={() => setIsJefe(false)}
                  onOpenFicha={handleOpenFicha}
                  onRefresh={fetchState}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
