import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import {
  ESTADO_DISPONIBLE,
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  PAUTAS_MECANICAS,
  calcularSemaforo,
  type Equipo,
  type EventoHistorial,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type EstadoOperativo,
} from "./src/data/catalogs.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, "rental_valdivia_db.json");
const EVIDENCIAS_DIR = path.join(__dirname, "public", "evidencias");

interface OTRepuestoRow {
  id: number;
  ot_id: number;
  repuesto_id: number;
  cantidad: number;
  costo_unitario: number;
  fecha: string;
}

interface DatabaseSchema {
  equipos: Equipo[];
  historial: EventoHistorial[];
  presupuestos: Presupuesto[];
  ordenes_trabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  ot_repuestos: OTRepuestoRow[];
  counters: {
    historial: number;
    presupuestos: number;
    ordenes_trabajo: number;
    repuestos: number;
    ot_repuestos: number;
  };
}

function ahoraStr(): string {
  try {
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(new Date()).replace(",", "");
  } catch {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

let db: DatabaseSchema = {
  equipos: [],
  historial: [],
  presupuestos: [],
  ordenes_trabajo: [],
  repuestos: [],
  ot_repuestos: [],
  counters: {
    historial: 0,
    presupuestos: 0,
    ordenes_trabajo: 0,
    repuestos: 0,
    ot_repuestos: 0,
  },
};

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error guardando base de datos:", err);
  }
}

function registrarEvento(
  codigo: string,
  fecha: string,
  tipo_evento: string,
  responsable: string,
  uso_sumado = 0,
  costo_repuestos = 0,
  detalle = ""
) {
  db.counters.historial += 1;
  db.historial.push({
    id: db.counters.historial,
    codigo_equipo: codigo,
    fecha,
    tipo_evento,
    responsable,
    uso_sumado: Number(uso_sumado) || 0,
    costo_repuestos: Number(costo_repuestos) || 0,
    detalle,
  });
}

function otAbierta(codigo: string): OrdenTrabajo | undefined {
  for (let i = db.ordenes_trabajo.length - 1; i >= 0; i--) {
    const ot = db.ordenes_trabajo[i];
    if (ot.codigo_equipo === codigo && ot.estado !== "CERRADA") {
      return ot;
    }
  }
  return undefined;
}

function abrirOt(
  codigo: string,
  tipo: "CORRECTIVA" | "PREVENTIVA",
  descripcion: string,
  responsable: string,
  ahora: string
): string {
  const existente = otAbierta(codigo);
  if (existente) {
    return existente.folio;
  }
  db.counters.ordenes_trabajo += 1;
  const id = db.counters.ordenes_trabajo;
  const folio = `OT-${String(id).padStart(4, "0")}`;
  db.ordenes_trabajo.push({
    id,
    folio,
    codigo_equipo: codigo,
    tipo,
    estado: "ABIERTA",
    fecha_apertura: ahora,
    fecha_cierre: null,
    responsable,
    mecanico: null,
    descripcion,
    detalle_cierre: null,
    costo_repuestos: 0,
    costo_otros: 0,
  });
  registrarEvento(
    codigo,
    ahora,
    "APERTURA OT",
    responsable,
    0,
    0,
    `${folio} (${tipo}): ${descripcion}`
  );
  return folio;
}

function cerrarOt(
  codigo: string,
  responsable: string,
  detalle_cierre: string,
  costo_otros: number,
  ahora: string
): { folio: string | null; costoInv: number } {
  const existente = otAbierta(codigo);
  if (!existente) {
    return { folio: null, costoInv: 0 };
  }
  const costoInv = db.ot_repuestos
    .filter((r) => r.ot_id === existente.id)
    .reduce((acc, r) => acc + r.cantidad * r.costo_unitario, 0);

  existente.estado = "CERRADA";
  existente.fecha_cierre = ahora;
  existente.mecanico = responsable;
  existente.detalle_cierre = detalle_cierre;
  existente.costo_repuestos = costoInv;
  existente.costo_otros = Number(costo_otros) || 0;

  return { folio: existente.folio, costoInv };
}

function inicializarDb(forzarReinicio = false) {
  if (!forzarReinicio && fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(raw) as DatabaseSchema;
      if (parsed && Array.isArray(parsed.equipos)) {
        db = parsed;
        return;
      }
    } catch (err) {
      console.error("Error leyendo DB existente, recreando:", err);
    }
  }

  db = {
    equipos: [],
    historial: [],
    presupuestos: [],
    ordenes_trabajo: [],
    repuestos: [],
    ot_repuestos: [],
    counters: {
      historial: 0,
      presupuestos: 0,
      ordenes_trabajo: 0,
      repuestos: 0,
      ot_repuestos: 0,
    },
  };

  // Seed repuestos
  const seedRepuestos: Omit<Repuesto, "id">[] = [
    {
      codigo: "REP-001",
      nombre: "Juego de carbones motor eléctrico",
      aplica_a: "Cortadora Orbital",
      unidad: "juego",
      stock: 6,
      stock_minimo: 2,
      costo_unitario: 12000,
    },
    {
      codigo: "REP-002",
      nombre: "Correa centrífuga (embrague)",
      aplica_a: "Placa Compactadora",
      unidad: "unidad",
      stock: 3,
      stock_minimo: 2,
      costo_unitario: 18500,
    },
    {
      codigo: "REP-003",
      nombre: "Aceite de motor 15W-40",
      aplica_a: "General",
      unidad: "litro",
      stock: 20,
      stock_minimo: 8,
      costo_unitario: 6500,
    },
    {
      codigo: "REP-004",
      nombre: "Acople rápido hidráulico QDC (par)",
      aplica_a: "Unidad Motriz",
      unidad: "par",
      stock: 2,
      stock_minimo: 2,
      costo_unitario: 32000,
    },
    {
      codigo: "REP-005",
      nombre: "Filtro de aire motor bencinero",
      aplica_a: "Unidad Motriz",
      unidad: "unidad",
      stock: 5,
      stock_minimo: 3,
      costo_unitario: 7900,
    },
    {
      codigo: "REP-006",
      nombre: "Bujía",
      aplica_a: "General",
      unidad: "unidad",
      stock: 10,
      stock_minimo: 4,
      costo_unitario: 4500,
    },
    {
      codigo: "REP-007",
      nombre: "Grasa especial de percusión",
      aplica_a: "Martillo Demoledor",
      unidad: "pote",
      stock: 1,
      stock_minimo: 2,
      costo_unitario: 15000,
    },
    {
      codigo: "REP-008",
      nombre: "Sello mecánico bomba sumergible",
      aplica_a: "Motobomba / Bomba Sumergible",
      unidad: "unidad",
      stock: 2,
      stock_minimo: 1,
      costo_unitario: 28000,
    },
    {
      codigo: "REP-009",
      nombre: "Aceite hidráulico ISO 68",
      aplica_a: "General",
      unidad: "litro",
      stock: 15,
      stock_minimo: 10,
      costo_unitario: 5200,
    },
  ];

  for (const r of seedRepuestos) {
    db.counters.repuestos += 1;
    db.repuestos.push({ id: db.counters.repuestos, ...r });
  }

  // Seed equipos demo
  db.equipos = [
    {
      codigo: "RV-0001",
      nombre: 'Cortadora Orbital Tubos 6-12"',
      categoria: "Cortadora Orbital",
      ubicacion_nfc: "Cara interna base mordaza",
      tipo_medicion: "DIAS",
      uso_acumulado: 14,
      limite_mantencion: 15,
      horometro_actual: 0,
      estado_operativo: ESTADO_DISPONIBLE,
      falla_activa: 0,
      panas_reportadas: "",
      ultima_observacion: "Operativa. Próxima a revisión preventiva.",
      fecha_actualizacion: "2026-10-15 09:30",
    },
    {
      codigo: "RV-0007",
      nombre: "Unidad Motriz Bencinera Honda",
      categoria: "Unidad Motriz",
      ubicacion_nfc: "Tras soporte filtro de aire",
      tipo_medicion: "DIAS",
      uso_acumulado: 8,
      limite_mantencion: 20,
      horometro_actual: 0,
      estado_operativo: ESTADO_EN_PANA,
      falla_activa: 1,
      panas_reportadas: "Fuga o rotura en acoples rápidos",
      ultima_observacion: "Ingresó con acople dañado.",
      fecha_actualizacion: "2026-10-19 11:20",
    },
  ];

  registrarEvento(
    "RV-0007",
    "2026-10-19 11:20",
    "RECEPCIÓN CON FALLA",
    "Bodega Patio",
    4,
    0,
    "Panas: Fuga en acoples QDC | Pérdida de presión. Se bloquea equipo para taller."
  );
  registrarEvento(
    "RV-0001",
    "2026-10-16 12:00",
    "MANTENCIÓN TALLER",
    "Mecánico Juan P.",
    0,
    28500,
    "Cambio de carbones y pauta preventiva."
  );
  registrarEvento(
    "RV-0001",
    "2026-10-17 18:00",
    "RECEPCIÓN NORMAL",
    "Bodega Patio",
    6,
    0,
    "Vuelve de faena sin daños visibles."
  );

  abrirOt(
    "RV-0007",
    "CORRECTIVA",
    "Fuga o rotura en acoples rápidos",
    "Bodega Patio",
    "2026-10-19 11:20"
  );

  db.counters.presupuestos += 1;
  db.presupuestos.push({
    id: db.counters.presupuestos,
    folio: "PRES-0001",
    codigo_equipo: "RV-0007",
    nombre_equipo: "Unidad Motriz Bencinera Honda",
    categoria: "Unidad Motriz",
    fecha_solicitud: "2026-10-19 12:00",
    solicitante: "Mecánico Jefe",
    destinatario_tipo: "Por definir (Evaluación Interna)",
    destinatario_nombre: "Pendiente asignar destinatario",
    prioridad: "Alta (Equipo Bloqueado)",
    panas_asociadas:
      "Fuga o rotura en acoples rápidos hidráulicos (QDC) | Pérdida de presión hidráulica",
    detalle_trabajos:
      'Reemplazo de juego de acoples rápidos Parker, manguera R2 1/2" y cambio de aceite hidráulico ISO 68.',
    costo_repuestos: 65000,
    costo_mano_obra: 35000,
    costo_insumos: 18000,
    monto_total: 118000,
    estado_presupuesto: "PENDIENTE",
    observaciones_resolucion:
      "Esperando definir si se cobra a cliente o pasa por garantía interna.",
  });

  saveDb();
}

function poblarFlotaMasiva(cantidadObjetivo = 3000): number {
  const actuales = db.equipos.length;
  const faltantes = Math.max(0, cantidadObjetivo - actuales);
  if (faltantes === 0) return 0;

  const plantillas: [string, string, string, "DIAS" | "HORAS", number][] = [
    ["Cortadora Orbital", "Cortadora Orbital", "Base protegida", "DIAS", 15],
    ["Placa Compactadora", "Placa Compactadora", "Base manillar", "DIAS", 15],
    ["Unidad Motriz", "Unidad Motriz", "Jaula interna", "DIAS", 20],
    ["Miniexcavadora", "Maquinaria con Horómetro", "Cabina", "HORAS", 250],
  ];

  const ahora = ahoraStr();
  const existentes = new Set(db.equipos.map((e) => e.codigo));
  let numero = actuales + 1;
  let creados = 0;

  while (creados < faltantes) {
    const cod = `RV-${String(numero).padStart(4, "0")}`;
    numero += 1;
    if (existentes.has(cod)) continue;
    existentes.add(cod);

    const [nomBase, cat, ubic, tMed, lim] =
      plantillas[Math.floor(Math.random() * plantillas.length)];
    const maxUso = Math.floor(lim * 1.3);
    const uso = Math.floor(Math.random() * (maxUso + 1));

    db.equipos.push({
      codigo: cod,
      nombre: `${nomBase} #${numero - 1}`,
      categoria: cat,
      ubicacion_nfc: ubic,
      tipo_medicion: tMed,
      uso_acumulado: uso,
      limite_mantencion: lim,
      horometro_actual: 0,
      estado_operativo: ESTADO_DISPONIBLE,
      falla_activa: 0,
      panas_reportadas: "",
      ultima_observacion: "Demo masiva.",
      fecha_actualizacion: ahora,
    });
    creados += 1;
  }

  saveDb();
  return creados;
}

// Initialize DB at startup
inicializarDb(false);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  // Ensure evidencias dir exists
  if (!fs.existsSync(EVIDENCIAS_DIR)) {
    fs.mkdirSync(EVIDENCIAS_DIR, { recursive: true });
  }
  app.use("/evidencias", express.static(EVIDENCIAS_DIR));

  // GET full application state
  app.get("/api/state", (_req, res) => {
    const equiposConSemaforo = db.equipos.map((eq) => ({
      ...eq,
      limite_mantencion: Math.max(1, Number(eq.limite_mantencion) || 1),
      uso_acumulado: Number(eq.uso_acumulado) || 0,
      horometro_actual: Number(eq.horometro_actual) || 0,
      falla_activa: Number(eq.falla_activa) || 0,
      semaforo: calcularSemaforo(eq),
    }));

    const repuestosMap = new Map(db.repuestos.map((r) => [r.id, r]));
    const otRepuestosDetallados = db.ot_repuestos.map((o) => {
      const rep = repuestosMap.get(o.repuesto_id);
      return {
        id: o.id,
        ot_id: o.ot_id,
        repuesto_id: o.repuesto_id,
        codigo: rep?.codigo || "REP-???",
        nombre: rep?.nombre || "Repuesto",
        cantidad: o.cantidad,
        unidad: rep?.unidad || "unidad",
        costo_unitario: o.costo_unitario,
        subtotal: o.cantidad * o.costo_unitario,
        fecha: o.fecha,
      };
    });

    const gastoTotal = db.historial.reduce(
      (acc, h) => acc + (Number(h.costo_repuestos) || 0),
      0
    );

    const rawTel = process.env.TELEFONO_TALLER || "56912345678";
    const telefonoTaller = rawTel.replace(/\D/g, "");

    res.json({
      equipos: equiposConSemaforo,
      presupuestos: [...db.presupuestos].sort((a, b) => b.id - a.id),
      ordenes_trabajo: [...db.ordenes_trabajo].sort((a, b) => b.id - a.id),
      repuestos: [...db.repuestos].sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      ),
      ot_repuestos: otRepuestosDetallados,
      historial: [...db.historial].sort((a, b) => b.id - a.id).slice(0, 5000),
      gasto_total: gastoTotal,
      config: {
        telefono_taller: telefonoTaller,
        gemini_configured: Boolean(
          process.env.GEMINI_API_KEY &&
            process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
        ),
        using_default_password: !process.env.PASSWORD_JEFE,
      },
    });
  });

  // Auth Jefatura
  app.post("/api/auth/jefe", (req, res) => {
    const { password } = req.body || {};
    const pwdInput = String(password || "");
    const secret = process.env.PASSWORD_JEFE || "valdivia2026";

    const bufA = Buffer.from(pwdInput);
    const bufB = Buffer.from(secret);
    const match =
      bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);

    if (match || (!process.env.PASSWORD_JEFE && pwdInput === "admin")) {
      res.json({ ok: true });
    } else {
      res.status(401).json({
        ok: false,
        error: "Contraseña incorrecta.",
      });
    }
  });

  // Admin DB: Simulate 3000 machines
  app.post("/api/admin/simular", (_req, res) => {
    const creados = poblarFlotaMasiva(3000);
    res.json({ ok: true, creados, message: `${creados} equipos creados.` });
  });

  // Admin DB: Factory Reset
  app.post("/api/admin/reset", (req, res) => {
    const { confirm } = req.body || {};
    if (String(confirm || "").trim() !== "BORRAR") {
      res.status(400).json({ ok: false, error: "Confirmación inválida." });
      return;
    }
    inicializarDb(true);
    res.json({ ok: true, message: "Reset de fábrica completado." });
  });

  // Module 3: Enrolar Máquina
  app.post("/api/equipos/enrolar", (req, res) => {
    const {
      codigo,
      nombre,
      categoria,
      estado_inicial,
      tipo_medicion,
      limite_mantencion,
      horometro_actual,
      ubicacion_nfc,
    } = req.body || {};

    const cod = String(codigo || "").toUpperCase().trim();
    const nom = String(nombre || "").trim();
    if (!cod || !nom) {
      res
        .status(400)
        .json({ ok: false, error: "El Código y el Nombre son obligatorios." });
      return;
    }

    if (db.equipos.some((e) => e.codigo === cod)) {
      res.status(409).json({
        ok: false,
        error: `El código ${cod} ya existe en la base de datos.`,
      });
      return;
    }

    const ahora = ahoraStr();
    const est: EstadoOperativo =
      estado_inicial === ESTADO_EN_PANA ||
      estado_inicial === ESTADO_EN_PRESUPUESTO
        ? estado_inicial
        : ESTADO_DISPONIBLE;

    const nuevo: Equipo = {
      codigo: cod,
      nombre: nom,
      categoria: String(categoria || "Cortadora Orbital"),
      ubicacion_nfc: String(ubicacion_nfc || "").trim() || "Chasis",
      tipo_medicion: tipo_medicion === "HORAS" ? "HORAS" : "DIAS",
      uso_acumulado: 0,
      limite_mantencion: Math.max(1, Number(limite_mantencion) || 15),
      horometro_actual: Math.max(0, Number(horometro_actual) || 0),
      estado_operativo: est,
      falla_activa: est !== ESTADO_DISPONIBLE ? 1 : 0,
      panas_reportadas: "",
      ultima_observacion: "Ingreso nuevo a flota.",
      fecha_actualizacion: ahora,
    };

    db.equipos.push(nuevo);
    registrarEvento(
      cod,
      ahora,
      "ENROLAMIENTO",
      "Admin",
      0,
      0,
      `Alta ${nuevo.categoria}`
    );
    if (est === ESTADO_EN_PANA) {
      abrirOt(cod, "CORRECTIVA", "Ingreso inicial en pana", "Admin", ahora);
    }
    saveDb();
    res.json({
      ok: true,
      equipo: nuevo,
      message: `Máquina ${cod} registrada con éxito.`,
    });
  });

  // Module 1 Tab 1: Pana Fulminante
  app.post("/api/equipos/:codigo/pana-fulminante", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const ahora = ahoraStr();
    const notaEmergencia = "BLOQUEO POR PANA FULMINANTE DESDE TERRENO.";
    eq.estado_operativo = ESTADO_EN_PANA;
    eq.falla_activa = 1;
    eq.ultima_observacion = notaEmergencia;
    eq.fecha_actualizacion = ahora;

    registrarEvento(
      eq.codigo,
      ahora,
      "PANA FULMINANTE",
      "Operador de Terreno",
      0,
      0,
      notaEmergencia
    );
    abrirOt(
      eq.codigo,
      "CORRECTIVA",
      notaEmergencia,
      "Operador de Terreno",
      ahora
    );
    saveDb();
    res.json({
      ok: true,
      message:
        "Equipo bloqueado por pana fulminante. Avisa al taller con el botón de WhatsApp.",
    });
  });

  // Module 1 Tab 1: Recepción en Patio
  app.post("/api/equipos/:codigo/recepcion", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const {
      responsable_rec,
      uso_nuevo,
      nuevo_horometro,
      estado_llegada, // "OPERATIVA" | "EN_PANA" | "PRESUPUESTO"
      panas_seleccionadas,
      danos_seleccionados,
      otra_pana,
      responsable_dano,
      prioridad_dano,
      obs_adicional,
      foto_base64,
      foto_nombre,
    } = req.body || {};

    const ahora = ahoraStr();
    const unidadUso = eq.tipo_medicion === "DIAS" ? "días" : "horas";
    const danosArr: string[] = Array.isArray(danos_seleccionados)
      ? danos_seleccionados
      : [];
    const panasArr: string[] = Array.isArray(panas_seleccionadas)
      ? panas_seleccionadas
      : [];

    const todasLasPanas: string[] = [
      ...danosArr.map((d) => `Daño: ${d}`),
      ...panasArr,
    ];
    if (String(otra_pana || "").trim()) {
      todasLasPanas.push(`Otra: ${String(otra_pana).trim()}`);
    }
    const panasStr = todasLasPanas.join(" | ");

    const esPresupuesto = estado_llegada === "PRESUPUESTO";
    const esPana = estado_llegada === "EN_PANA";
    const tieneFalla = esPana || esPresupuesto;

    const nuevoEstadoOp: EstadoOperativo = esPresupuesto
      ? ESTADO_EN_PRESUPUESTO
      : tieneFalla
      ? ESTADO_EN_PANA
      : ESTADO_DISPONIBLE;
    const fallaFlag = tieneFalla ? 1 : 0;

    let rutaEvidencia = "";
    if (foto_base64 && typeof foto_base64 === "string") {
      try {
        const extOrig = path.extname(String(foto_nombre || ".jpg")).toLowerCase();
        const ext = [".jpg", ".jpeg", ".png"].includes(extOrig) ? extOrig : ".jpg";
        const stamp = ahora.replace(/[-: ]/g, "_");
        const fileName = `${eq.codigo}_${stamp}${ext}`;
        const fullPath = path.join(EVIDENCIAS_DIR, fileName);
        const base64Data = foto_base64.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(fullPath, Buffer.from(base64Data, "base64"));
        rutaEvidencia = `/evidencias/${fileName}`;
      } catch (e) {
        console.error("Error guardando evidencia:", e);
      }
    }

    const obsClean = String(obs_adicional || "").trim();
    const usoSumado = Math.max(0, Number(uso_nuevo) || 0);
    let notaFinal = panasStr
      ? `Panas: ${panasStr}${obsClean ? ` — ${obsClean}` : ""}`
      : `Recepción normal (+${usoSumado} ${unidadUso}). ${obsClean}`.trim();

    if (esPresupuesto) {
      notaFinal += `. Asume: ${responsable_dano || "Por definir"}. Prioridad: ${
        prioridad_dano || "Alta"
      }.`;
    }
    if (rutaEvidencia) {
      notaFinal += ` [Evidencia: ${rutaEvidencia}]`;
    }

    eq.uso_acumulado = (Number(eq.uso_acumulado) || 0) + usoSumado;
    eq.horometro_actual =
      eq.tipo_medicion === "HORAS"
        ? Math.max(eq.horometro_actual, Number(nuevo_horometro) || 0)
        : eq.horometro_actual;
    eq.estado_operativo = nuevoEstadoOp;
    eq.falla_activa = fallaFlag;
    eq.panas_reportadas = panasStr;
    eq.ultima_observacion = notaFinal;
    eq.fecha_actualizacion = ahora;

    const respNombre = String(responsable_rec || "Encargado de Patio").trim();
    registrarEvento(
      eq.codigo,
      ahora,
      "RECEPCIÓN",
      respNombre,
      usoSumado,
      0,
      notaFinal
    );

    if (nuevoEstadoOp === ESTADO_EN_PANA) {
      abrirOt(
        eq.codigo,
        "CORRECTIVA",
        panasStr || "Ingreso en pana sin detalle",
        respNombre,
        ahora
      );
    } else if (nuevoEstadoOp === ESTADO_DISPONIBLE) {
      cerrarOt(
        eq.codigo,
        respNombre,
        "Cerrada en recepción: la falla ya no existe.",
        0,
        ahora
      );
    }

    saveDb();
    res.json({ ok: true, message: "Recepción registrada." });
  });

  // Module 1 Tab 2: Abrir OT manualmente
  app.post("/api/equipos/:codigo/ot/abrir", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { tipo } = req.body || {};
    const tipoOt: "CORRECTIVA" | "PREVENTIVA" =
      tipo === "PREVENTIVA" ? "PREVENTIVA" : "CORRECTIVA";
    const ahora = ahoraStr();
    const desc =
      eq.panas_reportadas ||
      (tipoOt === "PREVENTIVA"
        ? "Mantención preventiva"
        : "Revisión en taller");
    const folio = abrirOt(eq.codigo, tipoOt, desc, "Taller", ahora);
    saveDb();
    res.json({ ok: true, folio, message: `${folio} abierta.` });
  });

  // Module 1 Tab 2: Actualizar estado de OT
  app.post("/api/ot/:id/estado", (req, res) => {
    const otId = Number(req.params.id);
    const ot = db.ordenes_trabajo.find((o) => o.id === otId);
    if (!ot) {
      res.status(404).json({ ok: false, error: "OT no encontrada." });
      return;
    }
    const { nuevo_estado } = req.body || {};
    const ahora = ahoraStr();
    const estadoAnterior = ot.estado;
    ot.estado = nuevo_estado;
    registrarEvento(
      ot.codigo_equipo,
      ahora,
      "ESTADO OT",
      "Taller",
      0,
      0,
      `${ot.folio}: ${estadoAnterior} → ${nuevo_estado}`
    );
    saveDb();
    res.json({
      ok: true,
      message: `${ot.folio} pasó a ${nuevo_estado}.`,
    });
  });

  // Module 1 Tab 2: Agregar repuesto a OT
  app.post("/api/ot/:id/repuesto", (req, res) => {
    const otId = Number(req.params.id);
    const ot = db.ordenes_trabajo.find((o) => o.id === otId);
    if (!ot) {
      res.status(404).json({ ok: false, error: "OT no encontrada." });
      return;
    }
    const { repuesto_id, cantidad } = req.body || {};
    const rep = db.repuestos.find((r) => r.id === Number(repuesto_id));
    if (!rep) {
      res.status(404).json({ ok: false, error: "Repuesto no encontrado." });
      return;
    }
    const cant = Math.max(1, Number(cantidad) || 1);
    if (cant > rep.stock) {
      res.status(400).json({
        ok: false,
        error: `No alcanza: quedan ${rep.stock} ${rep.unidad} de ${rep.nombre}.`,
      });
      return;
    }

    const ahora = ahoraStr();
    db.counters.ot_repuestos += 1;
    db.ot_repuestos.push({
      id: db.counters.ot_repuestos,
      ot_id: ot.id,
      repuesto_id: rep.id,
      cantidad: cant,
      costo_unitario: rep.costo_unitario,
      fecha: ahora,
    });
    rep.stock -= cant;
    saveDb();

    const bajoMinimo = rep.stock <= rep.stock_minimo;
    const message = bajoMinimo
      ? `Cargado a ${ot.folio}. Atención: quedan ${rep.stock} ${rep.unidad} de ${rep.nombre} (mínimo ${rep.stock_minimo}).`
      : `${cant} × ${rep.nombre} cargado a ${ot.folio}.`;

    res.json({ ok: true, bajoMinimo, message });
  });

  // Module 1 Tab 2: Actualizar diagnóstico de panas en taller
  app.post("/api/equipos/:codigo/diagnostico", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { panas_taller, otra_pana_taller } = req.body || {};
    const ahora = ahoraStr();

    const panasActuales = eq.panas_reportadas
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const danosPrevios = panasActuales.filter((p) => p.startsWith("Daño:"));
    const marcadas: string[] = Array.isArray(panas_taller) ? panas_taller : [];
    const nuevasP = [...danosPrevios, ...marcadas];
    if (String(otra_pana_taller || "").trim()) {
      nuevasP.push(`Otra pana: ${String(otra_pana_taller).trim()}`);
    }

    const strPanasTal = nuevasP.join(" | ");
    const obsTal = strPanasTal
      ? `Diagnóstico Taller: ${strPanasTal}`
      : "En revisión de taller.";
    const estTal: EstadoOperativo =
      eq.estado_operativo === ESTADO_EN_PRESUPUESTO
        ? ESTADO_EN_PRESUPUESTO
        : ESTADO_EN_PANA;

    eq.estado_operativo = estTal;
    eq.falla_activa = 1;
    eq.panas_reportadas = strPanasTal;
    eq.ultima_observacion = obsTal;
    eq.fecha_actualizacion = ahora;

    registrarEvento(
      eq.codigo,
      ahora,
      "DIAGNÓSTICO TALLER",
      "Taller",
      0,
      0,
      obsTal
    );
    if (estTal === ESTADO_EN_PANA) {
      abrirOt(
        eq.codigo,
        "CORRECTIVA",
        strPanasTal || "Diagnóstico en taller",
        "Taller",
        ahora
      );
    }

    saveDb();
    res.json({ ok: true, message: "Diagnóstico de panas actualizado." });
  });

  // Module 1 Tab 2: Reparado (cerrar pana)
  app.post("/api/equipos/:codigo/reparar", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { mecanico, costo_rep, detalle_ot } = req.body || {};
    const ahora = ahoraStr();
    const mec = String(mecanico || "Taller Central").trim();
    const costoExtra = Math.max(0, Number(costo_rep) || 0);
    const textoExtra =
      String(detalle_ot || "").trim() || "Reparación sin detalle.";

    let resumen = `Pana cerrada ({${
      eq.panas_reportadas || "sin detalle"
    }}). ${textoExtra}`;
    const { folio: folioCerrada, costoInv } = cerrarOt(
      eq.codigo,
      mec,
      textoExtra,
      costoExtra,
      ahora
    );
    if (folioCerrada) {
      resumen = `${folioCerrada} cerrada. ${resumen}`;
    }

    eq.estado_operativo = ESTADO_DISPONIBLE;
    eq.falla_activa = 0;
    eq.panas_reportadas = "";
    eq.ultima_observacion = `Reparada por ${mec}: ${textoExtra}`;
    eq.fecha_actualizacion = ahora;

    registrarEvento(
      eq.codigo,
      ahora,
      "REPARACIÓN TALLER",
      mec,
      0,
      costoExtra + costoInv,
      resumen
    );
    saveDb();

    const aviso =
      eq.uso_acumulado >= eq.limite_mantencion
        ? " Atención: ya pide mantención preventiva."
        : "";
    res.json({
      ok: true,
      message: `Pana cerrada, máquina de vuelta en patio.${aviso}`,
    });
  });

  // Module 1 Tab 2: Pauta completa (reiniciar uso)
  app.post("/api/equipos/:codigo/pauta", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }
    const { mecanico, costo_rep, detalle_ot, items_completados, total_items } =
      req.body || {};
    const ahora = ahoraStr();
    const mec = String(mecanico || "Taller Central").trim();
    const costoExtra = Math.max(0, Number(costo_rep) || 0);
    const textoExtra =
      String(detalle_ot || "").trim() ||
      "Pauta preventiva estándar realizada.";

    const tienePana =
      Number(eq.falla_activa) === 1 || eq.estado_operativo === ESTADO_EN_PANA;
    const esperaPresupuesto = eq.estado_operativo === ESTADO_EN_PRESUPUESTO;

    let resumenTareas = `Pauta completada (${items_completados || 5}/${
      total_items || 5
    } ítems). ${textoExtra}`;

    let costoInv = 0;
    const otActual = otAbierta(eq.codigo);
    if (otActual && otActual.tipo === "PREVENTIVA") {
      const cerrada = cerrarOt(
        eq.codigo,
        mec,
        resumenTareas,
        costoExtra,
        ahora
      );
      costoInv = cerrada.costoInv;
      if (cerrada.folio) {
        resumenTareas = `${cerrada.folio} cerrada. ${resumenTareas}`;
      }
    }

    eq.uso_acumulado = 0;
    eq.ultima_observacion = `Pauta por ${mec}: ${resumenTareas}`;
    eq.fecha_actualizacion = ahora;
    if (!tienePana && !esperaPresupuesto) {
      eq.estado_operativo = ESTADO_DISPONIBLE;
    }

    registrarEvento(
      eq.codigo,
      ahora,
      "MANTENCIÓN TALLER",
      mec,
      0,
      costoExtra + costoInv,
      resumenTareas
    );
    saveDb();

    const warning = tienePana || esperaPresupuesto;
    res.json({
      ok: true,
      warning,
      message: warning
        ? "Pauta registrada y uso reiniciado. La pana sigue abierta: ciérrala con 'Reparado'."
        : "Pauta registrada, máquina lista.",
    });
  });

  // Module 1 Tab 2: Asistente Técnico IA (Gemini)
  app.post("/api/gemini/diagnose", async (req, res) => {
    const { codigo, modo, consulta } = req.body || {};
    const eq = db.equipos.find((e) => e.codigo === codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const pautaActual =
      PAUTAS_MECANICAS[eq.categoria] ||
      PAUTAS_MECANICAS["Maquinaria con Horómetro"];
    const contextoFalla = eq.panas_reportadas || eq.ultima_observacion;

    let promptBase = String(consulta || "").trim();
    if (!promptBase) {
      if (modo === "pauta") {
        promptBase = `Dame el procedimiento técnico resumido para ejecutar esta pauta en ${eq.categoria}: ${pautaActual.join(", ")}`;
      } else {
        promptBase = `Analiza las siguientes panas reportadas: ${contextoFalla}`;
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      const guiaFallback = [
        `### Guía Técnica de Taller para ${eq.nombre} (${eq.categoria})`,
        `- **Síntoma / Pana registrada:** *${contextoFalla || "Sin pana activa"}*`,
        `- **Puntos clave de verificación en banco:**`,
        ...pautaActual.map((item, i) => `  ${i + 1}. ${item}`),
        `\n*(Configura GEMINI_API_KEY en el panel Secrets para habilitar el análisis generativo en vivo)*`,
      ].join("\n");
      res.json({ ok: true, text: guiaFallback, fallback: true });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const promptCompleto =
        `Actúa como Jefe de Taller Mecánico experto en maquinaria de arriendo (Rental Valdivia). ` +
        `Equipo: ${eq.codigo} - ${eq.nombre} (${eq.categoria}). ` +
        `Panas activas: '${eq.panas_reportadas || "Ninguna"}'. Última observación: '${eq.ultima_observacion}'. ` +
        `Consulta del mecánico: '${promptBase}'. ` +
        `Responde en español, conciso y estructurado en Markdown con: 1) Causa probable, 2) Pruebas en banco de taller, 3) Repuestos e insumos críticos a verificar.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: promptCompleto,
      });

      res.json({
        ok: true,
        text: response.text || "Sin respuesta del asistente.",
        fallback: false,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: `Error al consultar Gemini: ${error?.message || String(error)}`,
      });
    }
  });

  // Module 1 Tab 3: Solicitar Presupuesto
  app.post("/api/equipos/:codigo/presupuesto", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const {
      solicitante,
      prioridad,
      destinatario_tipo,
      destinatario_nombre,
      marcar_espera_pres,
      panas_elegidas,
      otra_pana,
      detalle_trabajos,
      costo_repuestos,
      costo_mano_obra,
      costo_insumos,
    } = req.body || {};

    const ahora = ahoraStr();
    const listaPanas: string[] = Array.isArray(panas_elegidas)
      ? [...panas_elegidas]
      : [];
    if (String(otra_pana || "").trim()) {
      listaPanas.push(`Otra: ${String(otra_pana).trim()}`);
    }
    const panasReales = listaPanas.join(" | ");
    const panasPresStr = panasReales || "Evaluación general en taller";
    const detFinalPres =
      String(detalle_trabajos || "").trim() || "Pendiente desglose fino.";

    const cRep = Math.max(0, Number(costo_repuestos) || 0);
    const cMo = Math.max(0, Number(costo_mano_obra) || 0);
    const cIns = Math.max(0, Number(costo_insumos) || 0);
    const totalCalc = cRep + cMo + cIns;

    db.counters.presupuestos += 1;
    const id = db.counters.presupuestos;
    const folioNuevo = `PRES-${String(id).padStart(4, "0")}`;

    const nuevoPres: Presupuesto = {
      id,
      folio: folioNuevo,
      codigo_equipo: eq.codigo,
      nombre_equipo: eq.nombre,
      categoria: eq.categoria,
      fecha_solicitud: ahora,
      solicitante: String(solicitante || "Jefe de Taller").trim(),
      destinatario_tipo: String(
        destinatario_tipo || "Por definir (En bandeja)"
      ),
      destinatario_nombre:
        String(destinatario_nombre || "").trim() || "Pendiente por definir",
      prioridad: String(prioridad || "Alta (Equipo Bloqueado en Taller)"),
      panas_asociadas: panasPresStr,
      detalle_trabajos: detFinalPres,
      costo_repuestos: cRep,
      costo_mano_obra: cMo,
      costo_insumos: cIns,
      monto_total: totalCalc,
      estado_presupuesto: "PENDIENTE",
      observaciones_resolucion: "En bandeja por definir/aprobar.",
    };

    db.presupuestos.push(nuevoPres);

    const montoFmt =
      "$" + totalCalc.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    if (marcar_espera_pres) {
      eq.estado_operativo = ESTADO_EN_PRESUPUESTO;
      eq.falla_activa = 1;
      eq.panas_reportadas = panasReales || eq.panas_reportadas;
      eq.ultima_observacion = `Presupuesto ${folioNuevo} (${montoFmt} CLP)`;
      eq.fecha_actualizacion = ahora;
    }

    registrarEvento(
      eq.codigo,
      ahora,
      "SOLICITUD PRESUPUESTO",
      nuevoPres.solicitante,
      0,
      0,
      `Folio ${folioNuevo} por ${montoFmt} CLP`
    );
    saveDb();

    res.json({
      ok: true,
      folio: folioNuevo,
      message: `Presupuesto ${folioNuevo} generado.`,
    });
  });

  // Module 1 Tab 4: Ajuste Manual (Jefatura)
  app.post("/api/equipos/:codigo/ajuste-manual", (req, res) => {
    const eq = db.equipos.find((e) => e.codigo === req.params.codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const {
      estado_elegido,
      uso_manual,
      horometro_manual,
      nota_manual,
      limpiar_panas,
    } = req.body || {};

    const ahora = ahoraStr();
    const usoIn = Math.max(0, Number(uso_manual) || 0);
    const horIn = Math.max(0, Number(horometro_manual) || 0);
    const estStr = String(estado_elegido || "").toUpperCase();

    let estOp: EstadoOperativo = ESTADO_EN_PANA;
    let fallaAct = 1;
    let usoFinal = usoIn;

    if (estStr.includes("OPERATIVA") || estStr.includes("🟢")) {
      estOp = ESTADO_DISPONIBLE;
      fallaAct = 0;
      usoFinal = usoIn >= eq.limite_mantencion ? 0 : usoIn;
    } else if (estStr.includes("MANTENCI") || estStr.includes("🟡")) {
      estOp = ESTADO_DISPONIBLE;
      fallaAct = 0;
      usoFinal = Math.max(usoIn, eq.limite_mantencion);
    } else if (estStr.includes("PRESUPUESTO") || estStr.includes("🟣")) {
      estOp = ESTADO_EN_PRESUPUESTO;
      fallaAct = 1;
      usoFinal = usoIn;
    } else {
      estOp = ESTADO_EN_PANA;
      fallaAct = 1;
      usoFinal = usoIn;
    }

    const nota = String(nota_manual || "").trim();
    eq.uso_acumulado = usoFinal;
    eq.horometro_actual = horIn;
    eq.estado_operativo = estOp;
    eq.falla_activa = fallaAct;
    if (limpiar_panas) {
      eq.panas_reportadas = "";
    }
    eq.ultima_observacion = nota;
    eq.fecha_actualizacion = ahora;

    registrarEvento(
      eq.codigo,
      ahora,
      "AJUSTE MANUAL",
      "Admin Taller",
      0,
      0,
      `Cambio a ${estado_elegido}. Nota: ${nota}`
    );

    if (estOp === ESTADO_EN_PANA) {
      abrirOt(
        eq.codigo,
        "CORRECTIVA",
        nota || "Ajuste manual",
        "Jefatura",
        ahora
      );
    } else if (estOp === ESTADO_DISPONIBLE) {
      cerrarOt(
        eq.codigo,
        "Jefatura",
        `Cerrada por ajuste manual: ${nota}`,
        0,
        ahora
      );
    }

    saveDb();
    res.json({ ok: true, message: "Estado actualizado." });
  });

  // Module 2: Acción Rápida en Semáforo de Patio
  app.post("/api/patio/accion-rapida", (req, res) => {
    const { codigo, accion, nota } = req.body || {};
    const eq = db.equipos.find((e) => e.codigo === codigo);
    if (!eq) {
      res.status(404).json({ ok: false, error: "Equipo no encontrado." });
      return;
    }

    const ahora = ahoraStr();
    const obs = String(nota || "").trim() || "Acción desde Semáforo";
    const accStr = String(accion || "").toUpperCase();

    if (accStr.includes("LIBERAR") || accStr.includes("🟢")) {
      eq.uso_acumulado = 0;
      eq.estado_operativo = ESTADO_DISPONIBLE;
      eq.falla_activa = 0;
      eq.panas_reportadas = "";
      eq.ultima_observacion = obs;
      eq.fecha_actualizacion = ahora;
      registrarEvento(eq.codigo, ahora, "LIBERACIÓN PATIO", "Patio", 0, 0, obs);
      cerrarOt(
        eq.codigo,
        "Jefatura",
        `Liberación rápida desde Semáforo: ${obs}`,
        0,
        ahora
      );
    } else if (accStr.includes("PRESUPUESTO") || accStr.includes("🟣")) {
      eq.estado_operativo = ESTADO_EN_PRESUPUESTO;
      eq.falla_activa = 1;
      eq.ultima_observacion = obs;
      eq.fecha_actualizacion = ahora;
      registrarEvento(eq.codigo, ahora, "A PRESUPUESTO", "Patio", 0, 0, obs);
    } else {
      eq.estado_operativo = ESTADO_EN_PANA;
      eq.falla_activa = 1;
      eq.ultima_observacion = obs;
      eq.fecha_actualizacion = ahora;
      registrarEvento(eq.codigo, ahora, "BLOQUEO PATIO", "Patio", 0, 0, obs);
      abrirOt(eq.codigo, "CORRECTIVA", obs, "Patio", ahora);
    }

    saveDb();
    res.json({ ok: true, message: "Acción ejecutada correctamente." });
  });

  // Module 4: Resolver Presupuesto
  app.post("/api/presupuestos/:folio/resolver", (req, res) => {
    const pres = db.presupuestos.find((p) => p.folio === req.params.folio);
    if (!pres) {
      res.status(404).json({ ok: false, error: "Presupuesto no encontrado." });
      return;
    }

    const { estado_presupuesto, destinatario_nombre, observaciones_resolucion } =
      req.body || {};
    const ahora = ahoraStr();

    pres.estado_presupuesto = String(estado_presupuesto || "PENDIENTE");
    pres.destinatario_nombre = String(
      destinatario_nombre || pres.destinatario_nombre
    ).trim();
    pres.observaciones_resolucion = String(
      observaciones_resolucion || ""
    ).trim();

    const eq = db.equipos.find((e) => e.codigo === pres.codigo_equipo);
    if (
      pres.estado_presupuesto === "APROBADO" &&
      eq &&
      eq.estado_operativo === ESTADO_EN_PRESUPUESTO
    ) {
      eq.estado_operativo = ESTADO_EN_PANA;
      eq.falla_activa = 1;
      eq.ultima_observacion = `Presupuesto ${pres.folio} aprobado. Pasa a reparación en taller.`;
      eq.fecha_actualizacion = ahora;
      abrirOt(
        eq.codigo,
        "CORRECTIVA",
        `Reparación según presupuesto ${pres.folio}: ${pres.detalle_trabajos}`,
        "Jefatura",
        ahora
      );
    }

    registrarEvento(
      pres.codigo_equipo,
      ahora,
      "RESOLUCIÓN PRESUPUESTO",
      "Jefatura",
      0,
      0,
      `Folio ${pres.folio}: ${pres.estado_presupuesto}. ${pres.observaciones_resolucion}`
    );
    saveDb();

    res.json({
      ok: true,
      message: `Resolución del presupuesto ${pres.folio} guardada.`,
    });
  });

  // Module 4: Ingresar stock repuesto
  app.post("/api/repuestos/ingreso", (req, res) => {
    const { repuesto_id, cantidad, nuevo_costo } = req.body || {};
    const rep = db.repuestos.find((r) => r.id === Number(repuesto_id));
    if (!rep) {
      res.status(404).json({ ok: false, error: "Repuesto no encontrado." });
      return;
    }
    const cant = Math.max(1, Number(cantidad) || 1);
    const costo = Math.max(0, Number(nuevo_costo) || 0);
    rep.stock += cant;
    if (costo > 0) {
      rep.costo_unitario = costo;
    }
    saveDb();
    res.json({
      ok: true,
      message: `Ingreso de ${cant} unidades guardado.`,
    });
  });

  // Module 4: Crear nuevo repuesto
  app.post("/api/repuestos/crear", (req, res) => {
    const { codigo, nombre, aplica_a, unidad, stock, stock_minimo, costo_unitario } =
      req.body || {};
    const cod = String(codigo || "").toUpperCase().trim();
    const nom = String(nombre || "").trim();
    if (!cod || !nom) {
      res
        .status(400)
        .json({ ok: false, error: "Código y nombre son obligatorios." });
      return;
    }
    if (db.repuestos.some((r) => r.codigo === cod)) {
      res
        .status(409)
        .json({ ok: false, error: `El código ${cod} ya existe.` });
      return;
    }

    db.counters.repuestos += 1;
    db.repuestos.push({
      id: db.counters.repuestos,
      codigo: cod,
      nombre: nom,
      aplica_a: String(aplica_a || "General"),
      unidad: String(unidad || "unidad").trim() || "unidad",
      stock: Math.max(0, Number(stock) || 0),
      stock_minimo: Math.max(0, Number(stock_minimo) || 1),
      costo_unitario: Math.max(0, Number(costo_unitario) || 0),
    });
    saveDb();
    res.json({
      ok: true,
      message: `${cod} — ${nom} creado.`,
    });
  });

  // Vite middleware in dev / static in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Rental Valdivia Server running on http://localhost:${PORT}`);
  });
}

startServer();
