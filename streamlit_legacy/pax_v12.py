import streamlit as st
import sqlite3
import pandas as pd
import os
import random
from datetime import datetime, timezone, timedelta
import hmac
from urllib.parse import quote

# Importación segura del SDK actual de Google Gemini (google-genai)
try:
    from google import genai
    GEMINI_INSTALLED = True
except ImportError:
    GEMINI_INSTALLED = False

# ==============================================================================
# 1. CONFIGURACIÓN GENERAL Y DISEÑO VISUAL (OPCIÓN 2 + HOVER + PANA FULMINANTE)
# ==============================================================================
st.set_page_config(
    page_title="Rental Valdivia - Control de Taller & NFC",
    page_icon="🚜",
    layout="wide",
    initial_sidebar_state="collapsed"  
)

st.markdown("""
    <style>
    /* VERSIÓN MODERNA Y EXPERIMENTAL CON HOVER Y PALETA AMIGABLE */
    .stApp { background-color: #F3F4F6; }
    
    /* Tarjetas de Métricas con sombra difuminada y animación */
    div[data-testid="stMetric"] {
        background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
        border: none;
        padding: 18px 24px;
        border-radius: 16px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.025);
        transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    }
    div[data-testid="stMetric"]:hover { 
        transform: translateY(-3px); 
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
    }
    div[data-testid="stMetric"] label { 
        color: #6B7280; font-weight: 700; text-transform: uppercase; 
        font-size: 0.75rem; letter-spacing: 0.05em;
    }
    div[data-testid="stMetric"] div { color: #111827; font-weight: 900; }
    /* En columnas angostas Streamlit corta el valor con "…" ("Contr…", "2026-1…"): se deja partir en líneas. */
    div[data-testid="stMetric"] .stMarkdownEllipsis, div[data-testid="stMetric"] .stMarkdownEllipsis p {
        white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
    }
    div[data-testid="stMetricValue"] { font-size: clamp(1.1rem, 2.2vw, 2rem); line-height: 1.2; }
    
    /* Pestañas Flotantes tipo 'Píldora' */
    /* Streamlit 1.66 cambió las pestañas de BaseWeb (data-baseweb) a React-Aria (role="tab"),
       así que se dejan los dos ganchos para que el píldora se vea igual en ambas. */
    .stTabs [data-baseweb="tab-list"], .stTabs [role="tablist"] {
        gap: 8px; 
        background-color: #FFFFFF; 
        padding: 8px; 
        border-radius: 50px;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
    }
    .stTabs [data-baseweb="tab"], .stTabs [role="tab"] {
        border-radius: 50px; 
        padding: 8px 24px; 
        font-weight: 700; 
        background-color: transparent; 
        color: #9CA3AF;
        border: none;
        transition: all 0.2s;
    }
    .stTabs [data-baseweb="tab"]:hover, .stTabs [role="tab"]:hover {
        color: #3B82F6;
    }
    .stTabs [aria-selected="true"] {
        background: linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%) !important; 
        color: #FFFFFF !important; 
        box-shadow: 0 4px 6px rgba(59,130,246,0.3);
    }
    
    /* Efecto Hover Global para todos los botones */
    div[data-testid="stButton"] button, div[data-testid="stLinkButton"] a {
        border-radius: 12px; 
        font-weight: 700; 
        transition: transform 0.2s, box-shadow 0.2s;
    }
    div[data-testid="stButton"] button:hover, div[data-testid="stLinkButton"] a:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }

    /* DISEÑO NEO-BRUTALISTA: Botón Pana Fulminante */
    /* `:contains()` no existe en CSS: el selector anterior nunca aplicaba. Streamlit agrega
       la clase `st-key-<key>` al contenedor de cada widget con key, así que se apunta ahí. */
    div[class*="st-key-btn_fulm_"] button {
        background-color: #dc2626 !important;
        color: white !important;
        border: 4px solid #7f1d1d !important;
        border-radius: 12px !important;
        font-weight: 900 !important;
        padding: 2rem 1rem !important;
        box-shadow: 0 8px 15px rgba(220, 38, 38, 0.4) !important;
    }
    div[class*="st-key-btn_fulm_"] button:hover {
        transform: translateY(2px) !important;
        box-shadow: 0 4px 8px rgba(220, 38, 38, 0.5) !important;
        background-color: #b91c1c !important;
    }

    .block-container { padding-top: 1.5rem; padding-bottom: 2rem; }
    </style>
""", unsafe_allow_html=True)

DB_NAME = "rental_valdivia.db"
ESTADO_DISPONIBLE = "DISPONIBLE"
ESTADO_EN_PANA = "EN_PANA"
ESTADO_EN_PRESUPUESTO = "EN_PRESUPUESTO"
EVIDENCIAS_DIR = "evidencias"

try:
    from zoneinfo import ZoneInfo
    TZ_CHILE = ZoneInfo("America/Santiago")
except Exception:
    TZ_CHILE = timezone(timedelta(hours=-3))

def ahora_str():
    return datetime.now(TZ_CHILE).strftime("%Y-%m-%d %H:%M")

def flash(tipo, mensaje):
    st.session_state["_flash"] = (tipo, mensaje)

def mostrar_flash():
    msg = st.session_state.pop("_flash", None)
    if msg:
        tipo, texto = msg
        getattr(st, tipo)(texto)

def resetear_formularios(codigo):
    # Los widgets con key guardan su valor en session_state aunque la BD cambie: tras cada
    # guardado se borran los de la máquina para que la ficha vuelva a leer los datos frescos
    # (si no, la pauta queda tickeada y la siguiente vez se libera sin revisar nada).
    for k in list(st.session_state.keys()):
        if k.startswith("btn_"):
            continue
        if k.endswith(f"_{codigo}") or f"_{codigo}_" in k:
            del st.session_state[k]

def casillas_en_dos_columnas(opciones, prefijo_key):
    marcadas = []
    col_a, col_b = st.columns(2)
    for idx, opcion in enumerate(opciones):
        if (col_a if idx % 2 == 0 else col_b).checkbox(opcion, key=f"{prefijo_key}_{idx}"):
            marcadas.append(opcion)
    return marcadas

# ==============================================================================
# 2. CATÁLOGO CONTEXTUALIZADO: PANAS COMUNES Y PAUTAS
# ==============================================================================
PANAS_POR_CATEGORIA = {
    "Cortadora Orbital": [
        "Desgaste o rotura de carbones del motor eléctrico",
        "Falta de engrase / trabamiento en cabezal giratorio o husillo",
        "Juego excesivo o deformación en mordazas de sujeción",
        "Cable blindado cortado o enchufe industrial (Legrand/Mennekes) dañado",
        "Portadisco rodado o seguro de traba roto",
        "Recalentamiento de motor / inducido con olor a quemado"
    ],
    "Placa Compactadora": [
        "Correa centrífuga (embrague) cortada, quemada o destensada",
        "Fuga o bajo nivel de aceite en unidad vibradora (excitador)",
        "Silentblocks (gomas amortiguadoras) cortados o fatigados",
        "Carburador sucio / motor se ahoga o no mantiene ralentí",
        "Piola de aceleración o cuerda de partida retráctil cortada",
        "Fisura en base compactadora o pernos de soporte sueltos"
    ],
    "Unidad Motriz": [
        "Fuga o rotura en acoples rápidos hidráulicos (QDC)",
        "Pérdida de presión hidráulica al tomar temperatura de trabajo",
        "Manguera de alta presión reventada o con malla de acero expuesta",
        "Bajo nivel o contaminación de aceite de motor / hidráulico (agua en aceite)",
        "No enciende en frío (bujía empastada, bobina o filtro saturado)",
        "Válvula de alivio o retorno hidráulico obstruido"
    ],
    "Maquinaria con Horómetro": [
        "Fuga de aceite hidráulico en cilindros, sellos o banco de válvulas",
        "Falla eléctrica de arranque (batería descargada, alternador o motor de partida)",
        "Pérdida de potencia del motor diésel (filtros saturados o inyectores)",
        "Sobrecalentamiento de motor (radiador obstruido, termostato o bomba de agua)",
        "Desgaste / juego excesivo en pasadores, bujes o corona de giro",
        "Oruga destensada / cortada o neumático dañado"
    ],
    "Generador Eléctrico": [
        "Generador enciende pero no entrega voltaje (falla de AVR o carbones)",
        "Disparo constante de automático / disyuntor por sobrecarga o cortocircuito",
        "Fuga de combustible o aire en línea de petróleo (no parte)",
        "Falla en panel digital / horómetro o sensor de presión de aceite",
        "Batería sin carga o bornes sulfatados",
        "Ruido anormal en rodamiento de alternador"
    ],
    "Martillo Demoledor": [
        "Desgaste de carbones o falla en interruptor de gatillo",
        "Pérdida de percusión (desgaste de o-rings de pistón o falta de grasa especial)",
        "Portaherramienta / retenedor de punta o cincel quebrado",
        "Cable de alimentación cortado en prensaestopa",
        "Fuga de grasa por sellos del cabezal"
    ],
    "Motobomba / Bomba Sumergible": [
        "No levanta presión / no succiona (sello mecánico o rodete desgastado)",
        "Entrada de agua al estator eléctrico (falla de aislación / salta diferencial)",
        "Carcasa o difusor obstruido por lodo/piedras de faena",
        "Cuerda de partida o carburador con agua en cuba (motobomba combustión)",
        "Acoples Storz quebrados o sin goma de sello"
    ]
}

# Daños físicos (no mecánicos) que se ven al recibir y que normalmente terminan en presupuesto.
DANOS_FISICOS = [
    "Golpe, abolladura o fisura en chasis / carcasa",
    "Pieza, accesorio o herramienta faltante",
    "Componente quebrado por mal uso u operación indebida",
    "Cable, manguera o enchufe cortado / aplastado",
    "Daño por agua, barro o contaminación en faena",
    "Equipo intervenido o reparado por terceros"
]

PAUTAS_MECANICAS = {
    "Cortadora Orbital": [
        "Revisión y limpieza de carbones del motor eléctrico",
        "Inspección de holgura en cabezal giratorio y mordazas de sujeción",
        "Verificación de estado de portadisco y seguro de traba",
        "Revisión de cableado blindado y enchufe industrial (Legrand/Mennekes)",
        "Engrase general de husillo y puntos móviles"
    ],
    "Placa Compactadora": [
        "Revisión de tensión y desgaste de correa centrífuga (embrague)",
        "Verificación de nivel de aceite en unidad vibradora (excitador)",
        "Inspección de silentblocks (gomas amortiguadoras) y chasis",
        "Limpieza de carburador y filtro de combustible",
        "Ajuste de piola de aceleración y parada de emergencia"
    ],
    "Unidad Motriz": [
        "Cambio de aceite de motor (15W-40) y revisión de fugas",
        "Verificación de nivel y estado de aceite hidráulico / retorno",
        "Limpieza o reemplazo de filtro de aire y revisión de bujía",
        "Inspección de acoples rápidos hidráulicos (QDC) y mangueras de alta presión",
        "Prueba de presión de trabajo y encendido en frío"
    ],
    "Maquinaria con Horómetro": [
        "Cambio de aceite de motor y filtro primario/secundario",
        "Revisión de sistema hidráulico, cilindros y sellos",
        "Inspección de filtros de aire (primario y seguridad) y separador de agua",
        "Engrase de pasadores, bujes y corona de giro",
        "Verificación de sistema eléctrico, alternador y batería"
    ],
    "Generador Eléctrico": [
        "Cambio de aceite de motor, filtro de aceite y filtro de combustible",
        "Medición de voltaje en vacío y con carga (verificación de AVR y frecuencia 50Hz)",
        "Revisión de nivel de refrigerante y tensión de correa de ventilador",
        "Inspección de batería, cargador de mantención y paradas de emergencia",
        "Limpieza de gabinete insonorizado y drenaje de decantador de agua"
    ],
    "Martillo Demoledor": [
        "Revisión de medida de carbones y limpieza de colector del inducido",
        "Reemplazo de grasa especial de percusión y revisión de sellos",
        "Inspección de portaherramienta, pasador de retención y buje guía",
        "Chequeo de continuidad y aislación de cable de poder e interruptor",
        "Apriete general de pernos de carcasa con torque y prueba de golpe"
    ],
    "Motobomba / Bomba Sumergible": [
        "Inspección de rodete (impulsor), voluta y holgura de desgaste",
        "Verificación de sello mecánico y nivel de aceite de cámara de sello",
        "Medición de aislación de bobinado (Megger) y estado de cable sumergible",
        "Revisión de acoples rápidos Storz, empaquetaduras y canastillo de succión",
        "Prueba hidráulica de caudal y presión en banco de prueba"
    ]
}

# ==============================================================================
# 3. MOTOR DE BASE DE DATOS SQLITE DE ALTO RENDIMIENTO (WAL + ÍNDICES)
# ==============================================================================
def get_connection():
    conn = sqlite3.connect(DB_NAME, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA cache_size=-64000;")
    return conn

COLUMNAS_EQUIPOS = [
    "codigo", "nombre", "categoria", "ubicacion_nfc", "tipo_medicion",
    "uso_acumulado", "limite_mantencion", "horometro_actual", "estado_operativo",
    "falla_activa", "panas_reportadas", "ultima_observacion", "fecha_actualizacion"
]
PLACEHOLDERS_EQUIPOS = ",".join(["?"] * len(COLUMNAS_EQUIPOS))
NOMBRES_EQUIPOS = ",".join(COLUMNAS_EQUIPOS)
INSERT_EQUIPOS_SQL = "INSERT INTO equipos (" + NOMBRES_EQUIPOS + ") VALUES (" + PLACEHOLDERS_EQUIPOS + ")"
INSERT_EQUIPOS_IGNORAR_SQL = INSERT_EQUIPOS_SQL.replace("INSERT INTO", "INSERT OR IGNORE INTO")

def registrar_evento(conn, codigo, fecha, tipo_evento, responsable, uso_sumado=0, costo_repuestos=0, detalle=""):
    conn.execute("INSERT INTO historial (codigo_equipo, fecha, tipo_evento, responsable, uso_sumado, costo_repuestos, detalle) VALUES (?,?,?,?,?,?,?)", (codigo, fecha, tipo_evento, responsable, uso_sumado, costo_repuestos, detalle))

def actualizar_equipo(conn, codigo, **campos):
    invalidos = set(campos) - (set(COLUMNAS_EQUIPOS) - {"codigo"})
    if not campos or invalidos: raise ValueError(f"Campos inválidos: {invalidos}")
    sets = ", ".join(f"{k}=?" for k in campos)
    conn.execute(f"UPDATE equipos SET {sets} WHERE codigo=?", (*campos.values(), codigo))

# ------------------------------------------------------------------------------
# Órdenes de trabajo (OT): una abierta por máquina como máximo. Se abre cuando la
# máquina entra a taller y se cierra al repararla; los repuestos usados se cargan a ella.
# ------------------------------------------------------------------------------
OT_ESTADOS_ABIERTOS = ["ABIERTA", "EN PROCESO", "ESPERANDO REPUESTO"]

def ot_abierta(conn, codigo):
    # -> (id, folio, estado, fecha_apertura, tipo, descripcion) o None
    return conn.execute(
        "SELECT id, folio, estado, fecha_apertura, tipo, descripcion FROM ordenes_trabajo "
        "WHERE codigo_equipo=? AND estado!='CERRADA' ORDER BY id DESC LIMIT 1", (codigo,)
    ).fetchone()

def abrir_ot(conn, codigo, tipo, descripcion, responsable, ahora):
    fila = ot_abierta(conn, codigo)
    if fila:
        return fila[1]
    cur = conn.execute(
        "INSERT INTO ordenes_trabajo (codigo_equipo, tipo, estado, fecha_apertura, responsable, descripcion) VALUES (?,?,?,?,?,?)",
        (codigo, tipo, "ABIERTA", ahora, responsable, descripcion)
    )
    folio = f"OT-{cur.lastrowid:04d}"
    conn.execute("UPDATE ordenes_trabajo SET folio=? WHERE id=?", (folio, cur.lastrowid))
    registrar_evento(conn, codigo, ahora, "APERTURA OT", responsable, detalle=f"{folio} ({tipo}): {descripcion}")
    return folio

def cerrar_ot(conn, codigo, responsable, detalle_cierre, costo_otros, ahora):
    # Devuelve (folio, costo de repuestos de inventario) o (None, 0) si no había OT abierta.
    fila = ot_abierta(conn, codigo)
    if not fila:
        return None, 0
    costo_inv = conn.execute("SELECT COALESCE(SUM(cantidad * costo_unitario), 0) FROM ot_repuestos WHERE ot_id=?", (fila[0],)).fetchone()[0]
    conn.execute(
        "UPDATE ordenes_trabajo SET estado='CERRADA', fecha_cierre=?, mecanico=?, detalle_cierre=?, costo_repuestos=?, costo_otros=? WHERE id=?",
        (ahora, responsable, detalle_cierre, costo_inv, costo_otros, fila[0])
    )
    return fila[1], int(costo_inv)

def duracion_legible(desde_str, hasta_str=None):
    try:
        desde = datetime.strptime(desde_str, "%Y-%m-%d %H:%M")
        hasta = datetime.strptime(hasta_str, "%Y-%m-%d %H:%M") if hasta_str else datetime.now(TZ_CHILE).replace(tzinfo=None)
    except (TypeError, ValueError):
        return "—"
    horas = max((hasta - desde).total_seconds() / 3600, 0)
    return f"{horas:.0f} h" if horas < 48 else f"{horas / 24:.1f} días"

def inicializar_db(forzar_reinicio=False):
    conn = get_connection()
    c = conn.cursor()
    
    if forzar_reinicio:
        c.execute("DROP TABLE IF EXISTS equipos")
        c.execute("DROP TABLE IF EXISTS historial")
        c.execute("DROP TABLE IF EXISTS presupuestos")
        c.execute("DROP TABLE IF EXISTS ordenes_trabajo")
        c.execute("DROP TABLE IF EXISTS ot_repuestos")
        c.execute("DROP TABLE IF EXISTS repuestos")

    c.execute("""
        CREATE TABLE IF NOT EXISTS equipos (
            codigo TEXT PRIMARY KEY,
            nombre TEXT,
            categoria TEXT,
            ubicacion_nfc TEXT,
            tipo_medicion TEXT,
            uso_acumulado INTEGER,
            limite_mantencion INTEGER,
            horometro_actual INTEGER,
            estado_operativo TEXT,
            falla_activa INTEGER,
            panas_reportadas TEXT,
            ultima_observacion TEXT,
            fecha_actualizacion TEXT
        )
    """)

    c.execute("PRAGMA table_info(equipos)")
    columnas_equipos = [col[1] for col in c.fetchall()]
    if "panas_reportadas" not in columnas_equipos:
        c.execute("ALTER TABLE equipos ADD COLUMN panas_reportadas TEXT DEFAULT ''")

    c.execute("""
        CREATE TABLE IF NOT EXISTS historial (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_equipo TEXT,
            fecha TEXT,
            tipo_evento TEXT,
            responsable TEXT,
            uso_sumado INTEGER,
            costo_repuestos INTEGER,
            detalle TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS presupuestos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folio TEXT,
            codigo_equipo TEXT,
            nombre_equipo TEXT,
            categoria TEXT,
            fecha_solicitud TEXT,
            solicitante TEXT,
            destinatario_tipo TEXT,
            destinatario_nombre TEXT,
            prioridad TEXT,
            panas_asociadas TEXT,
            detalle_trabajos TEXT,
            costo_repuestos INTEGER,
            costo_mano_obra INTEGER,
            costo_insumos INTEGER,
            monto_total INTEGER,
            estado_presupuesto TEXT,
            observaciones_resolucion TEXT
        )
    """)

    c.execute("CREATE INDEX IF NOT EXISTS idx_equipos_cat_est ON equipos(categoria, estado_operativo);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_hist_codigo_fecha ON historial(codigo_equipo, fecha DESC);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_pres_codigo_est ON presupuestos(codigo_equipo, estado_presupuesto);")

    c.execute("""
        CREATE TABLE IF NOT EXISTS ordenes_trabajo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folio TEXT,
            codigo_equipo TEXT,
            tipo TEXT,
            estado TEXT,
            fecha_apertura TEXT,
            fecha_cierre TEXT,
            responsable TEXT,
            mecanico TEXT,
            descripcion TEXT,
            detalle_cierre TEXT,
            costo_repuestos INTEGER DEFAULT 0,
            costo_otros INTEGER DEFAULT 0
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS repuestos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            nombre TEXT,
            aplica_a TEXT,
            unidad TEXT,
            stock INTEGER,
            stock_minimo INTEGER,
            costo_unitario INTEGER
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS ot_repuestos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ot_id INTEGER,
            repuesto_id INTEGER,
            cantidad INTEGER,
            costo_unitario INTEGER,
            fecha TEXT
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_ot_codigo_est ON ordenes_trabajo(codigo_equipo, estado);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_otrep_ot ON ot_repuestos(ot_id);")

    # Separado de la siembra de equipos para que una BD que ya existía también reciba el inventario.
    c.execute("SELECT COUNT(*) FROM repuestos")
    if c.fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO repuestos (codigo, nombre, aplica_a, unidad, stock, stock_minimo, costo_unitario) VALUES (?,?,?,?,?,?,?)",
            [
                ("REP-001", "Juego de carbones motor eléctrico", "Cortadora Orbital", "juego", 6, 2, 12000),
                ("REP-002", "Correa centrífuga (embrague)", "Placa Compactadora", "unidad", 3, 2, 18500),
                ("REP-003", "Aceite de motor 15W-40", "General", "litro", 20, 8, 6500),
                ("REP-004", "Acople rápido hidráulico QDC (par)", "Unidad Motriz", "par", 2, 2, 32000),
                ("REP-005", "Filtro de aire motor bencinero", "Unidad Motriz", "unidad", 5, 3, 7900),
                ("REP-006", "Bujía", "General", "unidad", 10, 4, 4500),
                ("REP-007", "Grasa especial de percusión", "Martillo Demoledor", "pote", 1, 2, 15000),
                ("REP-008", "Sello mecánico bomba sumergible", "Motobomba / Bomba Sumergible", "unidad", 2, 1, 28000),
                ("REP-009", "Aceite hidráulico ISO 68", "General", "litro", 15, 10, 5200),
            ]
        )
        conn.commit()

    c.execute("SELECT COUNT(*) FROM equipos")
    if c.fetchone()[0] == 0:
        # IMPLEMENTACIÓN NOMENCLATURA RV-NUMERO
        equipos_demo = [
            ("RV-0001", "Cortadora Orbital Tubos 6-12\"", "Cortadora Orbital", "Cara interna base mordaza", "DIAS", 14, 15, 0, ESTADO_DISPONIBLE, 0, "", "Operativa. Próxima a revisión preventiva.", "2026-10-15 09:30"),
            ("RV-0007", "Unidad Motriz Bencinera Honda", "Unidad Motriz", "Tras soporte filtro de aire", "DIAS", 8, 20, 0, ESTADO_EN_PANA, 1, "Fuga o rotura en acoples rápidos", "Ingresó con acople dañado.", "2026-10-19 11:20")
        ]
        c.executemany(INSERT_EQUIPOS_SQL, equipos_demo)
        
        historial_demo = [
            ("RV-0007", "2026-10-19 11:20", "RECEPCIÓN CON FALLA", "Bodega Patio", 4, 0, "Panas: Fuga en acoples QDC | Pérdida de presión. Se bloquea equipo para taller."),
            ("RV-0001", "2026-10-16 12:00", "MANTENCIÓN TALLER", "Mecánico Juan P.", 0, 28500, "Cambio de carbones y pauta preventiva."),
            ("RV-0001", "2026-10-17 18:00", "RECEPCIÓN NORMAL", "Bodega Patio", 6, 0, "Vuelve de faena sin daños visibles.")
        ]
        for hd in historial_demo:
            registrar_evento(conn, hd[0], hd[1], hd[2], hd[3], hd[4], hd[5], hd[6])
        abrir_ot(conn, "RV-0007", "CORRECTIVA", "Fuga o rotura en acoples rápidos", "Bodega Patio", "2026-10-19 11:20")

        presupuestos_demo = [
            ("PRES-0001", "RV-0007", "Unidad Motriz Bencinera Honda", "Unidad Motriz", "2026-10-19 12:00", "Mecánico Jefe", "Por definir (Evaluación Interna)", "Pendiente asignar destinatario", "Alta (Equipo Bloqueado)", "Fuga o rotura en acoples rápidos hidráulicos (QDC) | Pérdida de presión hidráulica", "Reemplazo de juego de acoples rápidos Parker, manguera R2 1/2\" y cambio de aceite hidráulico ISO 68.", 65000, 35000, 18000, 118000, "PENDIENTE", "Esperando definir si se cobra a cliente o pasa por garantía interna.")
        ]
        c.executemany("""
            INSERT INTO presupuestos (
                folio, codigo_equipo, nombre_equipo, categoria, fecha_solicitud,
                solicitante, destinatario_tipo, destinatario_nombre, prioridad,
                panas_asociadas, detalle_trabajos, costo_repuestos, costo_mano_obra,
                costo_insumos, monto_total, estado_presupuesto, observaciones_resolucion
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, presupuestos_demo)
        conn.commit()
    conn.close()

def poblar_flota_masiva(cantidad_objetivo=3000):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM equipos")
    actuales = c.fetchone()[0]
    faltantes = max(0, cantidad_objetivo - actuales)
    if faltantes == 0:
        conn.close()
        return 0

    plantillas = [
        ("Cortadora Orbital", "Cortadora Orbital", "Base protegida", "DIAS", 15),
        ("Placa Compactadora", "Placa Compactadora", "Base manillar", "DIAS", 15),
        ("Unidad Motriz", "Unidad Motriz", "Jaula interna", "DIAS", 20),
        ("Miniexcavadora", "Maquinaria con Horómetro", "Cabina", "HORAS", 250),
    ]
    ahora = ahora_str()
    nuevos = []
    # Los códigos demo (RV-0001, RV-0007) pueden chocar con la numeración generada;
    # se salta cualquier código ya existente para que la flota llegue justo al objetivo.
    existentes = {fila[0] for fila in c.execute("SELECT codigo FROM equipos").fetchall()}
    numero = actuales + 1
    while len(nuevos) < faltantes:
        cod = f"RV-{numero:04d}" # ESTANDAR RV-NUMERO
        numero += 1
        if cod in existentes:
            continue
        existentes.add(cod)
        nom_base, cat, ubic, t_med, lim = random.choice(plantillas)
        uso = random.randint(0, int(lim * 1.3))
        est = ESTADO_DISPONIBLE
        nuevos.append((cod, f"{nom_base} #{numero - 1}", cat, ubic, t_med, uso, lim, 0, est, 0, "", "Demo masiva.", ahora))
    c.executemany(INSERT_EQUIPOS_IGNORAR_SQL, nuevos)
    conn.commit()
    conn.close()
    return len(nuevos)

def obtener_equipos():
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM equipos", conn)
    conn.close()
    return df

def obtener_historial(limite=2000):
    conn = get_connection()
    df = pd.read_sql_query(f"SELECT * FROM historial ORDER BY id DESC LIMIT {int(limite)}", conn)
    conn.close()
    return df

def obtener_presupuestos():
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM presupuestos ORDER BY id DESC", conn)
    conn.close()
    return df

def calcular_semaforo_vectorizado(df):
    cond_pana = (df["falla_activa"] == 1) | (df["estado_operativo"] == ESTADO_EN_PANA)
    cond_pres = (df["estado_operativo"] == ESTADO_EN_PRESUPUESTO)
    cond_mant = (df["uso_acumulado"] >= df["limite_mantencion"])
    
    sem = pd.Series("🟢 OPERATIVA (LISTA)", index=df.index)
    sem = sem.mask(cond_mant, "🟡 PIDE MANTENCIÓN")
    sem = sem.mask(cond_pana, "🔴 EN PANA (TALLER)")
    sem = sem.mask(cond_pres, "🟣 ESPERANDO PRESUPUESTO")
    return sem

def obtener_gemini_key():
    try:
        return st.secrets["GEMINI_API_KEY"]
    except Exception:
        return os.environ.get("GEMINI_API_KEY", "")

def obtener_telefono_taller():
    # Solo dígitos, con código de país (ej. 56912345678), que es lo que espera wa.me.
    try:
        tel = str(st.secrets["TELEFONO_TALLER"])
    except Exception:
        tel = os.environ.get("TELEFONO_TALLER", "")
    return "".join(ch for ch in tel if ch.isdigit())

def check_password_jefatura():
    if st.session_state.get("is_jefe", False):
        return True
    
    st.warning("🔒 Este módulo contiene datos financieros y de rendimiento. Acceso exclusivo para Jefatura.")
    
    clave_secreta = ""
    try:
        clave_secreta = st.secrets["PASSWORD_JEFE"]
    except Exception:
        clave_secreta = os.environ.get("PASSWORD_JEFE", "")
        
    if not clave_secreta:
        st.error("PASSWORD_JEFE no está configurada en secrets.toml. Módulo bloqueado.")
        return False
        
    pwd = st.text_input("Ingresa la contraseña de Jefatura:", type="password")
    
    if st.button("Desbloquear Módulo", type="primary"):
        if hmac.compare_digest(pwd.encode(), clave_secreta.encode()):
            st.session_state.is_jefe = True
            st.rerun()
        else:
            st.error("Contraseña incorrecta.")
    return False

# Inicialización de Datos y Variables de Sesión
inicializar_db()
df_equipos = obtener_equipos()

if not df_equipos.empty:
    for col_num in ["uso_acumulado", "horometro_actual", "falla_activa"]:
        df_equipos[col_num] = pd.to_numeric(df_equipos[col_num], errors="coerce").fillna(0).astype(int)
    df_equipos["limite_mantencion"] = pd.to_numeric(df_equipos["limite_mantencion"], errors="coerce").fillna(1).astype(int).clip(lower=1)
    for col_txt in ["ultima_observacion", "panas_reportadas", "nombre", "categoria", "ubicacion_nfc", "estado_operativo", "tipo_medicion", "fecha_actualizacion"]:
        if col_txt not in df_equipos.columns:
            df_equipos[col_txt] = ""
        df_equipos[col_txt] = df_equipos[col_txt].fillna("").astype(str)
    df_equipos["semaforo"] = calcular_semaforo_vectorizado(df_equipos)
else:
    # Sin esta columna los módulos 2 y 4 se caen con KeyError cuando la flota está vacía.
    df_equipos["semaforo"] = pd.Series(dtype=str)

if "is_jefe" not in st.session_state:
    st.session_state.is_jefe = False

# MENU MODIFICADO: Menús 4 y 5 fusionados
opciones_menu = [
    "🔧 1. Estación de Trabajo (NFC)",
    "🚦 2. Semáforo de Patio",
    "➕ 3. Enrolar Máquina",
    "💼 4. Panel de Jefatura (Finanzas & KPIs)"
]

params = st.query_params
equipo_url = params.get("equipo", None)
lista_codigos = df_equipos["codigo"].tolist() if not df_equipos.empty else []

if "modulo_activo" not in st.session_state or st.session_state.modulo_activo not in opciones_menu:
    st.session_state.modulo_activo = opciones_menu[0]

if "equipo_activo" not in st.session_state:
    st.session_state.equipo_activo = equipo_url if equipo_url in lista_codigos else (lista_codigos[0] if lista_codigos else None)

if equipo_url in lista_codigos and st.session_state.get("ultimo_url") != equipo_url:
    st.session_state.equipo_activo = equipo_url
    st.session_state.ultimo_url = equipo_url
    st.session_state.modulo_activo = opciones_menu[0]

# ==============================================================================
# 5. MENÚ LATERAL EXCLUSIVO
# ==============================================================================
with st.sidebar:
    st.title("🚜 Rental Valdivia")
    st.caption("Sistema de Control y Taller")
    st.divider()

    modo_vista = st.radio(
        "Navegación Principal:",
        opciones_menu,
        index=opciones_menu.index(st.session_state.modulo_activo)
    )
    st.session_state.modulo_activo = modo_vista
    
    st.divider()
    
    if st.session_state.is_jefe:
        st.success("👤 Sesión: Jefatura (Activa)")
        if st.button("Cerrar Sesión Segura"):
            st.session_state.is_jefe = False
            st.rerun()
    else:
        st.info("👤 Sesión: Operador de Patio")

    with st.expander("🛠️ Admin DB (Oculto)"):
        st.caption(f"Flota actual: **{len(df_equipos):,}** equipos")
        if not st.session_state.get("is_jefe", False):
            st.caption("🔒 Requiere sesión de Jefatura.")
        else:
            if st.button("⚡ Simular 3.000 Equipos"):
                creados = poblar_flota_masiva(3000)
                flash("success", f"{creados} creados.")
                st.rerun()
            st.text_input("Escribe BORRAR para confirmar:", key="confirm_reset")
            if st.button("🔄 Volver a Fábrica", disabled=(st.session_state.get("confirm_reset", "").strip() != "BORRAR")):
                inicializar_db(forzar_reinicio=True)
                flash("success", "Reset OK.")
                st.rerun()

api_key_gemini = obtener_gemini_key()

# ==============================================================================
# 6. ENCABEZADO PRINCIPAL Y VISTAS DE MÓDULOS
# ==============================================================================
col_titulo, col_resumen_top = st.columns([2.2, 1.8])
with col_titulo:
    st.markdown("## 🚜 Rental Valdivia — Operaciones")
with col_resumen_top:
    if not df_equipos.empty:
        v_cnt = int((df_equipos["semaforo"].str.contains("🟢")).sum())
        a_cnt = int((df_equipos["semaforo"].str.contains("🟡")).sum())
        r_cnt = int((df_equipos["semaforo"].str.contains("🔴")).sum())
        p_cnt = int((df_equipos["semaforo"].str.contains("🟣")).sum())
        st.caption(f"**Flota ({len(df_equipos):,} eq.):** 🟢 **{v_cnt}** | 🟡 **{a_cnt}** | 🔴 **{r_cnt}** | 🟣 **{p_cnt}**")
st.divider()
mostrar_flash()

# ==============================================================================
# MÓDULO 1: ESTACIÓN DE TRABAJO
# ==============================================================================
if modo_vista == opciones_menu[0]:
    if df_equipos.empty:
        st.warning("No hay máquinas registradas. Ve a la pestaña '➕ 3. Enrolar Máquina'.")
    else:
        with st.container(border=True):
            st.markdown("#### 🔍 Paso 1: Selecciona o Escanea la Máquina")
            b_col1, b_col2, b_col3 = st.columns([1.1, 1.3, 2.2])
            
            with b_col1:
                categorias_disp = ["Todas las categorías"] + sorted(df_equipos["categoria"].unique().tolist())
                cat_filtro_top = st.selectbox("1️⃣ Filtrar Tipo de Máquina:", categorias_disp)
            
            with b_col2:
                texto_buscar_top = st.text_input("2️⃣ Buscar código o nombre:", placeholder="Ej: RV-0001, Honda, Placa...")
            
            df_selector = df_equipos
            if cat_filtro_top != "Todas las categorías":
                df_selector = df_selector[df_selector["categoria"] == cat_filtro_top]
            if texto_buscar_top.strip():
                q = texto_buscar_top.strip()
                df_selector = df_selector[
                    df_selector["codigo"].str.contains(q, case=False, regex=False) |
                    df_selector["nombre"].str.contains(q, case=False, regex=False)
                ]
            
            if df_selector.empty:
                st.warning("Ninguna máquina coincide con ese filtro. Mostrando lista completa.")
                df_selector = df_equipos

            codigos_disp = df_selector["codigo"].tolist()
            mapa_etiquetas = dict(zip(
                df_selector["codigo"],
                df_selector["codigo"] + " — " + df_selector["nombre"] + " [" + df_selector["categoria"] + "] (" + df_selector["semaforo"] + ")"
            ))

            idx_sel = codigos_disp.index(st.session_state.equipo_activo) if st.session_state.equipo_activo in codigos_disp else 0
            
            with b_col3:
                equipo_seleccionado = st.selectbox(
                    "3️⃣ Máquina Activa (o escaneada vía Tag NFC):",
                    options=codigos_disp,
                    index=idx_sel,
                    format_func=lambda c: mapa_etiquetas.get(c, c)
                )
                st.session_state.equipo_activo = equipo_seleccionado

        maq = df_equipos[df_equipos["codigo"] == equipo_seleccionado].iloc[0]
        cat_maq = maq["categoria"]
        unidad_uso = "días" if maq["tipo_medicion"] == "DIAS" else "horas"
        porcentaje_desgaste = min(int((maq["uso_acumulado"] / maq["limite_mantencion"]) * 100), 100) if maq["limite_mantencion"] > 0 else 0

        with st.container(border=True):
            c_head1, c_head2 = st.columns([2.2, 1.8])
            with c_head1:
                st.markdown(f"### 🔧 {maq['codigo']} — {maq['nombre']}")
                st.caption(
                    f"🏷️ **Categoría:** `{cat_maq}`  |  "
                    f"📍 **Chip NFC:** {maq['ubicacion_nfc']}  |  "
                    f"🔗 **Link NFC:** `?equipo={maq['codigo']}`"
                )
            with c_head2:
                estado_actual = maq["semaforo"]
                if "🔴" in estado_actual:
                    st.error(f"**{estado_actual}**\n\n*{maq['ultima_observacion']}*")
                elif "🟣" in estado_actual:
                    st.warning(f"**{estado_actual}**\n\n*{maq['ultima_observacion']}*")
                elif "🟡" in estado_actual:
                    st.warning(f"**{estado_actual}** — Acumula {maq['uso_acumulado']}/{maq['limite_mantencion']} {unidad_uso}.")
                else:
                    st.success(f"**{estado_actual}** — Acumula {maq['uso_acumulado']}/{maq['limite_mantencion']} {unidad_uso}.")

            if maq["panas_reportadas"].strip():
                st.markdown(f"⚠️ **Panas activas registradas en esta máquina:** `{maq['panas_reportadas']}`")

            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Uso Acumulado Ciclo", f"{maq['uso_acumulado']} {unidad_uso}", f"Tope Mant.: {maq['limite_mantencion']} {unidad_uso}")
            m2.metric("Desgaste Preventivo", f"{porcentaje_desgaste}%")
            m3.metric("Horómetro Motor", f"{maq['horometro_actual']} hrs" if maq["tipo_medicion"] == "HORAS" else "Control por Días")
            m4.metric("Último Movimiento", maq["fecha_actualizacion"])
            st.progress(porcentaje_desgaste / 100, text=f"Nivel de desgaste acumulado hacia pauta preventiva ({porcentaje_desgaste}%)")

        st.markdown("#### 🛠️ Paso 2: Ejecuta la Operación sobre esta Máquina")
        tab_rec, tab_taller, tab_pres, tab_manual, tab_hist = st.tabs([
            "📥 1. Recepción e Ingreso de Panas",
            "🔧 2. Taller Mecánico y Pauta + IA",
            "💰 3. Solicitar Presupuesto",
            "⚙️ 4. Forzar Estado / Ajuste",
            "📋 5. Historial del Equipo"
        ], key="tab_ficha", on_change="rerun")  # con key la pestaña activa sobrevive al st.rerun() de cada guardado

        with tab_rec:
            # IMPLEMENTACIÓN: PANA FULMINANTE + WHATSAPP
            with st.container(border=True):
                st.markdown("#### 🚨 DECLARAR EMERGENCIA EN TERRENO")
                col_btn1, col_btn2 = st.columns([1.5, 1])
                
                with col_btn1:
                    if st.button("🚨 DECLARAR PANA FULMINANTE Y BLOQUEAR", type="primary", width="stretch", key=f"btn_fulm_{maq['codigo']}"):
                        ahora = ahora_str()
                        nota_emergencia = "BLOQUEO POR PANA FULMINANTE DESDE TERRENO."
                        conn = get_connection()
                        actualizar_equipo(conn, maq["codigo"], estado_operativo=ESTADO_EN_PANA, falla_activa=1, ultima_observacion=nota_emergencia, fecha_actualizacion=ahora)
                        registrar_evento(conn, maq["codigo"], ahora, "PANA FULMINANTE", "Operador de Terreno", uso_sumado=0, costo_repuestos=0, detalle=nota_emergencia)
                        abrir_ot(conn, maq["codigo"], "CORRECTIVA", nota_emergencia, "Operador de Terreno", ahora)
                        conn.commit()
                        conn.close()
                        resetear_formularios(maq["codigo"])
                        flash("error", "⚠️ Equipo bloqueado por pana fulminante. Avisa al taller con el botón de WhatsApp.")
                        st.rerun()

                with col_btn2:
                    telefono_taller = obtener_telefono_taller()
                    mensaje_wsp = f"🚨 URGENTE: El equipo {maq['codigo']} ({maq['nombre']}) sufrió una PANA FULMINANTE en terreno."
                    if telefono_taller:
                        url_whatsapp = f"https://wa.me/{telefono_taller}?text={quote(mensaje_wsp)}"
                        st.link_button("📲 Avisar por WhatsApp al Taller", url=url_whatsapp, width="stretch")
                    else:
                        st.caption("📲 Configura TELEFONO_TALLER en secrets.toml para avisar por WhatsApp.")

            with st.container(border=True):
                st.subheader(f"📥 Recepción en Patio — {maq['codigo']}")
                st.caption("Elige cómo llega la máquina: según la condición se abren las causas que hay que marcar.")

                rc1, rc2, rc3 = st.columns([1, 1, 1.2])
                with rc1:
                    responsable_rec = st.text_input("Recibido por:", value="Encargado de Patio", key=f"rec_resp_{maq['codigo']}")
                with rc2:
                    if maq["tipo_medicion"] == "DIAS":
                        uso_nuevo = st.number_input("Días de uso a sumar en este ingreso:", min_value=0, max_value=365, value=3, key=f"rec_dias_{maq['codigo']}")
                        nuevo_horometro = int(maq["horometro_actual"])
                    else:
                        nuevo_horometro = st.number_input(
                            f"Horómetro actual de llegada (Anterior: {maq['horometro_actual']} hrs):",
                            min_value=int(maq["horometro_actual"]),
                            value=int(maq["horometro_actual"]) + 12,
                            key=f"rec_hor_{maq['codigo']}"
                        )
                        uso_nuevo = nuevo_horometro - int(maq["horometro_actual"])
                with rc3:
                    foto_evidencia = st.file_uploader(
                        "📸 Foto de evidencia (opcional):",
                        type=["jpg", "png", "jpeg"],
                        key=f"rec_foto_{maq['codigo']}"
                    )

                estado_llegada = st.radio(
                    "¿En qué condición ingresa el equipo?",
                    [
                        "✅ Operativa (sin fallas)",
                        "🔴 EN PANA (bloquear y enviar a Taller)",
                        "🟣 Con daño (requiere presupuesto)"
                    ],
                    horizontal=True,
                    key=f"rec_cond_{maq['codigo']}"
                )

                # Las causas solo aparecen para la condición elegida: así no se cuelan panas
                # marcadas en una máquina que ingresa operativa.
                lista_panas_cat = PANAS_POR_CATEGORIA.get(cat_maq, PANAS_POR_CATEGORIA["Maquinaria con Horómetro"])
                panas_seleccionadas_rec, danos_seleccionados_rec = [], []
                otra_pana_rec, responsable_dano, prioridad_dano = "", "", ""

                if "🔴" in estado_llegada:
                    with st.container(border=True):
                        st.markdown(f"##### 🔴 Causas de pana — {cat_maq}")
                        st.caption("Marca lo que reporta el cliente o se ve al recibir. La máquina queda bloqueada para Taller.")
                        panas_seleccionadas_rec = casillas_en_dos_columnas(lista_panas_cat, f"pana_rec_{maq['codigo']}")
                        otra_pana_rec = st.text_input(
                            "➕ Otra pana (si no está en la lista):",
                            placeholder="Ej: ruido en rodamiento, no corta parejo...",
                            key=f"otra_pana_rec_{maq['codigo']}"
                        )
                elif "🟣" in estado_llegada:
                    with st.container(border=True):
                        st.markdown("##### 🟣 Daños detectados")
                        st.caption("La máquina queda esperando presupuesto.")
                        danos_seleccionados_rec = casillas_en_dos_columnas(DANOS_FISICOS, f"dano_rec_{maq['codigo']}")
                        with st.expander(f"🔧 ¿También presenta panas mecánicas de {cat_maq}?"):
                            panas_seleccionadas_rec = casillas_en_dos_columnas(lista_panas_cat, f"pana_rec_{maq['codigo']}")
                        otra_pana_rec = st.text_input(
                            "➕ Otro daño o falla (si no está en la lista):",
                            placeholder="Ej: falta la llave del portadisco, carcasa trizada...",
                            key=f"otra_pana_rec_{maq['codigo']}"
                        )
                        d1, d2 = st.columns(2)
                        responsable_dano = d1.selectbox(
                            "¿Quién asume el daño?",
                            ["Por definir", "Cliente (daño en faena)", "Desgaste normal (Rental)", "Garantía de proveedor"],
                            key=f"rec_quien_{maq['codigo']}"
                        )
                        prioridad_dano = d2.selectbox(
                            "Prioridad:",
                            ["Alta (se necesita pronto)", "Media", "Baja"],
                            key=f"rec_prio_{maq['codigo']}"
                        )
                else:
                    st.success("Sin causas que registrar: la máquina vuelve a patio sumando su uso.")

                # Recibirla operativa borra la pana abierta; eso debería pasar en Taller con 'Reparado'.
                confirma_sin_pana = True
                if "✅" in estado_llegada and (int(maq["falla_activa"]) == 1 or maq["estado_operativo"] != ESTADO_DISPONIBLE):
                    st.warning(f"⚠️ Esta máquina tiene una falla abierta: *{maq['panas_reportadas'] or maq['ultima_observacion']}*. Si la recibes operativa, se cierra sin pasar por Taller.")
                    confirma_sin_pana = st.checkbox("Confirmo que la falla ya no existe", key=f"rec_conf_{maq['codigo']}")

                obs_adicional_rec = st.text_area(
                    "Observaciones generales de recepción:",
                    placeholder="Detalles de cómo llegó del terreno, accesorios, estado de limpieza, etc.",
                    height=75,
                    key=f"obs_rec_{maq['codigo']}"
                )

                if st.button("💾 Registrar Recepción y Actualizar Estado", type="primary", width="stretch", key=f"btn_save_rec_{maq['codigo']}", disabled=not confirma_sin_pana):
                    ahora = ahora_str()
                    
                    # "Daño: ..." distingue los daños físicos de las panas mecánicas del catálogo.
                    todas_las_panas = [f"Daño: {d}" for d in danos_seleccionados_rec] + list(panas_seleccionadas_rec)
                    if otra_pana_rec.strip():
                        todas_las_panas.append(f"Otra: {otra_pana_rec.strip()}")
                    panas_str = " | ".join(todas_las_panas)

                    tiene_falla = ("🔴" in estado_llegada) or ("🟣" in estado_llegada)

                    nuevo_estado_op = ESTADO_EN_PRESUPUESTO if "🟣" in estado_llegada else (ESTADO_EN_PANA if tiene_falla else ESTADO_DISPONIBLE)
                    falla_flag = 1 if tiene_falla else 0
                    
                    ruta_evidencia = ""
                    if foto_evidencia is not None:
                        os.makedirs(EVIDENCIAS_DIR, exist_ok=True)
                        ext = os.path.splitext(foto_evidencia.name)[1].lower()
                        if ext not in (".jpg", ".jpeg", ".png"):
                            ext = ".jpg"
                        nombre_archivo = f"{maq['codigo']}_{datetime.now(TZ_CHILE).strftime('%Y%m%d_%H%M%S')}{ext}"
                        ruta_evidencia = os.path.join(EVIDENCIAS_DIR, nombre_archivo)
                        with open(ruta_evidencia, "wb") as f:
                            f.write(foto_evidencia.getbuffer())

                    nota_final = f"Panas: {panas_str} — {obs_adicional_rec}".strip(" — ") if panas_str else f"Recepción normal (+{uso_nuevo} {unidad_uso}). {obs_adicional_rec}"
                    if "🟣" in estado_llegada:
                        nota_final += f". Asume: {responsable_dano}. Prioridad: {prioridad_dano}."
                    if ruta_evidencia:
                        nota_final += f" [📸 Foto: {ruta_evidencia}]"

                    conn = get_connection()
                    actualizar_equipo(conn, maq["codigo"], uso_acumulado=int(maq["uso_acumulado"]) + int(uso_nuevo), horometro_actual=nuevo_horometro, estado_operativo=nuevo_estado_op, falla_activa=falla_flag, panas_reportadas=panas_str, ultima_observacion=nota_final, fecha_actualizacion=ahora)
                    registrar_evento(conn, maq["codigo"], ahora, "RECEPCIÓN", responsable_rec, uso_sumado=uso_nuevo, costo_repuestos=0, detalle=nota_final)
                    if nuevo_estado_op == ESTADO_EN_PANA:
                        abrir_ot(conn, maq["codigo"], "CORRECTIVA", panas_str or "Ingreso en pana sin detalle", responsable_rec, ahora)
                    elif nuevo_estado_op == ESTADO_DISPONIBLE:
                        cerrar_ot(conn, maq["codigo"], responsable_rec, "Cerrada en recepción: la falla ya no existe.", 0, ahora)
                    conn.commit()
                    conn.close()
                    resetear_formularios(maq["codigo"])
                    flash("success", "✅ Recepción registrada.")
                    st.rerun()

        with tab_taller:
            col_taller_izq, col_taller_der = st.columns([1.35, 1])

            with col_taller_izq:
                tiene_pana = int(maq["falla_activa"]) == 1 or maq["estado_operativo"] == ESTADO_EN_PANA
                espera_presupuesto = maq["estado_operativo"] == ESTADO_EN_PRESUPUESTO

                conn = get_connection()
                ot_actual = ot_abierta(conn, maq["codigo"])
                df_inventario = pd.read_sql_query("SELECT * FROM repuestos ORDER BY nombre", conn)
                df_rep_ot = pd.read_sql_query(
                    "SELECT r.codigo, r.nombre, o.cantidad, r.unidad, o.costo_unitario, o.cantidad * o.costo_unitario AS subtotal "
                    "FROM ot_repuestos o JOIN repuestos r ON r.id = o.repuesto_id WHERE o.ot_id = ? ORDER BY o.id",
                    conn, params=(ot_actual[0] if ot_actual else -1,)
                )
                conn.close()

                with st.container(border=True):
                    if ot_actual is None:
                        st.markdown("##### 🧾 Orden de Trabajo")
                        st.caption("Sin OT abierta. Se abre sola cuando la máquina entra en pana; para una mantención, ábrela acá.")
                        ot1, ot2 = st.columns([1, 1])
                        tipo_nueva_ot = ot1.selectbox("Tipo de OT:", ["CORRECTIVA", "PREVENTIVA"], index=0 if tiene_pana else 1, key=f"ot_tipo_{maq['codigo']}", label_visibility="collapsed")
                        if ot2.button("➕ Abrir OT", width="stretch", key=f"btn_ot_abrir_{maq['codigo']}"):
                            ahora = ahora_str()
                            conn = get_connection()
                            desc = maq["panas_reportadas"] or ("Mantención preventiva" if tipo_nueva_ot == "PREVENTIVA" else "Revisión en taller")
                            folio_ot = abrir_ot(conn, maq["codigo"], tipo_nueva_ot, desc, "Taller", ahora)
                            conn.commit()
                            conn.close()
                            resetear_formularios(maq["codigo"])
                            flash("success", f"🧾 {folio_ot} abierta.")
                            st.rerun()
                    else:
                        id_ot, folio_ot, estado_ot, apertura_ot, tipo_ot, desc_ot = ot_actual
                        st.markdown(f"##### 🧾 {folio_ot} · {tipo_ot} · en taller hace **{duracion_legible(apertura_ot)}**")
                        st.caption(f"Abierta el {apertura_ot} — {desc_ot}")
                        oe1, oe2 = st.columns([1.4, 1])
                        nuevo_estado_ot = oe1.selectbox("Estado de la OT:", OT_ESTADOS_ABIERTOS, index=OT_ESTADOS_ABIERTOS.index(estado_ot) if estado_ot in OT_ESTADOS_ABIERTOS else 0, key=f"ot_est_{maq['codigo']}")
                        oe2.write("")
                        if oe2.button("Actualizar estado", width="stretch", key=f"btn_ot_est_{maq['codigo']}", disabled=(nuevo_estado_ot == estado_ot)):
                            ahora = ahora_str()
                            conn = get_connection()
                            conn.execute("UPDATE ordenes_trabajo SET estado=? WHERE id=?", (nuevo_estado_ot, id_ot))
                            registrar_evento(conn, maq["codigo"], ahora, "ESTADO OT", "Taller", detalle=f"{folio_ot}: {estado_ot} → {nuevo_estado_ot}")
                            conn.commit()
                            conn.close()
                            resetear_formularios(maq["codigo"])
                            flash("success", f"{folio_ot} pasó a {nuevo_estado_ot}.")
                            st.rerun()

                        st.markdown("**📦 Repuestos usados en esta OT**")
                        if df_rep_ot.empty:
                            st.caption("Todavía no se cargan repuestos.")
                        else:
                            st.dataframe(df_rep_ot, width="stretch", hide_index=True)
                            st.caption(f"Total repuestos de inventario: **${int(df_rep_ot['subtotal'].sum()):,.0f} CLP**".replace(",", "."))

                        if not df_inventario.empty:
                            # Primero los que aplican a esta categoría o son de uso general.
                            relevantes = df_inventario["aplica_a"].isin([cat_maq, "General"])
                            df_opc = pd.concat([df_inventario[relevantes], df_inventario[~relevantes]])
                            etiquetas_rep = {
                                int(r.id): f"{'⚠️ ' if r.stock <= r.stock_minimo else ''}{r.nombre} — stock {r.stock} {r.unidad}"
                                for r in df_opc.itertuples()
                            }
                            ar1, ar2, ar3 = st.columns([2.2, 0.8, 1])
                            rep_sel = ar1.selectbox("Repuesto:", list(etiquetas_rep), format_func=lambda i: etiquetas_rep[i], key=f"ot_rep_{maq['codigo']}")
                            cant_sel = ar2.number_input("Cant.:", min_value=1, value=1, step=1, key=f"ot_cant_{maq['codigo']}")
                            ar3.write("")
                            if ar3.button("Agregar", width="stretch", key=f"btn_ot_rep_{maq['codigo']}"):
                                fila_rep = df_inventario[df_inventario["id"] == rep_sel].iloc[0]
                                if cant_sel > fila_rep["stock"]:
                                    st.error(f"No alcanza: quedan {fila_rep['stock']} {fila_rep['unidad']} de {fila_rep['nombre']}.")
                                else:
                                    ahora = ahora_str()
                                    conn = get_connection()
                                    conn.execute("INSERT INTO ot_repuestos (ot_id, repuesto_id, cantidad, costo_unitario, fecha) VALUES (?,?,?,?,?)",
                                                 (id_ot, int(rep_sel), int(cant_sel), int(fila_rep["costo_unitario"]), ahora))
                                    conn.execute("UPDATE repuestos SET stock = stock - ? WHERE id=?", (int(cant_sel), int(rep_sel)))
                                    conn.commit()
                                    conn.close()
                                    resetear_formularios(maq["codigo"])
                                    queda = int(fila_rep["stock"]) - int(cant_sel)
                                    if queda <= int(fila_rep["stock_minimo"]):
                                        flash("warning", f"📦 Cargado a {folio_ot}. Ojo: quedan {queda} {fila_rep['unidad']} de {fila_rep['nombre']} (mínimo {fila_rep['stock_minimo']}).")
                                    else:
                                        flash("success", f"📦 {cant_sel} × {fila_rep['nombre']} cargado a {folio_ot}.")
                                    st.rerun()

                with st.container(border=True):
                    st.subheader(f"🔧 Diagnóstico y Pauta de Taller — {cat_maq}")

                    firma_panas_actual = f"{cat_maq}||{maq['panas_reportadas']}"
                    if st.session_state.get(f"firma_panas_{maq['codigo']}") != firma_panas_actual:
                        st.session_state[f"firma_panas_{maq['codigo']}"] = firma_panas_actual
                        panas_guardadas = [p.strip() for p in maq["panas_reportadas"].split("|") if p.strip()]
                        # Recepción y Presupuesto guardan la pana libre como "Otra: ...", el Taller la escribe
                        # como "Otra pana: ..."; se aceptan los dos formatos para no perder lo que dijo patio.
                        otras_guardadas = [p.split(":", 1)[1].strip() for p in panas_guardadas
                                           if p.startswith(("Otra pana:", "Otra:")) and ":" in p]
                        for idx_fs, pana_fs in enumerate(PANAS_POR_CATEGORIA.get(cat_maq, [])):
                            st.session_state[f"tal_pana_{maq['codigo']}_{cat_maq}_{idx_fs}"] = pana_fs in panas_guardadas
                        st.session_state[f"tal_otra_pana_{maq['codigo']}"] = ", ".join(otras_guardadas)
                        st.session_state[f"pres_multi_panas_{maq['codigo']}"] = panas_guardadas

                    with st.expander("🔍 Diagnosticar / Modificar Panas Detectadas en Taller", expanded=bool(maq["panas_reportadas"].strip())):
                        st.caption(f"Causas frecuentes específicas para **{cat_maq}**:")
                        panas_actuales_lista = [p.strip() for p in maq["panas_reportadas"].split("|") if p.strip()]
                        panas_taller_marcadas = []
                        for idx_pt, pana_t in enumerate(PANAS_POR_CATEGORIA.get(cat_maq, [])):
                            if st.checkbox(pana_t, key=f"tal_pana_{maq['codigo']}_{cat_maq}_{idx_pt}"):
                                panas_taller_marcadas.append(pana_t)
                        
                        otra_pana_taller = st.text_input(
                            "➕ Otra pana detectada en desarme:",
                            key=f"tal_otra_pana_{maq['codigo']}"
                        )
                        
                        if st.button("📌 Actualizar Diagnóstico de Panas (Sin liberar aún)", width="stretch", key=f"btn_upd_pana_{maq['codigo']}"):
                            ahora = ahora_str()
                            # Los daños de recepción no tienen casilla en el taller: se conservan tal cual.
                            nuevas_p = [p for p in panas_actuales_lista if p.startswith("Daño:")] + list(panas_taller_marcadas)
                            if otra_pana_taller.strip():
                                nuevas_p.append(f"Otra pana: {otra_pana_taller.strip()}")
                            str_panas_tal = " | ".join(nuevas_p)
                            obs_tal = f"Diagnóstico Taller: {str_panas_tal}" if str_panas_tal else "En revisión de taller."
                            # Si ya espera presupuesto, el diagnóstico no lo devuelve a rojo.
                            est_tal = ESTADO_EN_PRESUPUESTO if maq["estado_operativo"] == ESTADO_EN_PRESUPUESTO else ESTADO_EN_PANA
                            conn = get_connection()
                            actualizar_equipo(conn, maq["codigo"], estado_operativo=est_tal, falla_activa=1, panas_reportadas=str_panas_tal, ultima_observacion=obs_tal, fecha_actualizacion=ahora)
                            registrar_evento(conn, maq["codigo"], ahora, "DIAGNÓSTICO TALLER", "Taller", detalle=obs_tal)
                            if est_tal == ESTADO_EN_PANA:
                                abrir_ot(conn, maq["codigo"], "CORRECTIVA", str_panas_tal or "Diagnóstico en taller", "Taller", ahora)
                            conn.commit()
                            conn.close()
                            resetear_formularios(maq["codigo"])
                            flash("success", "Diagnóstico de panas actualizado.")
                            st.rerun()

                    st.markdown(f"##### ✅ Checklist de Mantención Preventiva ({cat_maq})")
                    pauta_actual = PAUTAS_MECANICAS.get(cat_maq, PAUTAS_MECANICAS["Maquinaria con Horómetro"])
                    tareas_marcadas = []
                    for idx_t, tarea in enumerate(pauta_actual):
                        if st.checkbox(tarea, key=f"chk_pauta_{maq['codigo']}_{cat_maq}_{idx_t}"):
                            tareas_marcadas.append(tarea)

                    st.divider()
                    tc1, tc2 = st.columns(2)
                    with tc1:
                        mecanico = st.text_input("Mecánico ejecutante:", value="Taller Central", key=f"mec_nom_{maq['codigo']}")
                        costo_rep = st.number_input("Otros costos fuera de inventario ($ CLP):", min_value=0, step=5000, value=0, key=f"mec_cost_{maq['codigo']}",
                                                    help="Servicios externos o compras puntuales. Los repuestos cargados a la OT se suman solos.")
                    with tc2:
                        detalle_ot = st.text_area(
                            "Repuestos reemplazados / Trabajo realizado:",
                            key=f"mec_det_{maq['codigo']}"
                        )

                    # Reparar (correctivo) y hacer la pauta (preventivo) son trabajos distintos:
                    # reparar cierra la pana sin tocar el uso; la pauta reinicia el uso sin cerrar panas.
                    pauta_completa = len(tareas_marcadas) == len(pauta_actual)

                    bt1, bt2 = st.columns(2)
                    with bt1:
                        reparar = st.button("🔧 Reparado (cerrar pana)", type="primary", width="stretch", key=f"btn_rep_{maq['codigo']}", disabled=(not tiene_pana or espera_presupuesto))
                        if espera_presupuesto:
                            st.caption("🟣 Espera aprobación del presupuesto en Jefatura.")
                        elif not tiene_pana:
                            st.caption("Sin pana abierta.")
                    with bt2:
                        hacer_pauta = st.button("✅ Pauta completa (reiniciar uso)", type="primary", width="stretch", key=f"btn_lib_{maq['codigo']}", disabled=not pauta_completa)
                        if not pauta_completa:
                            st.caption(f"⚠️ Faltan {len(pauta_actual) - len(tareas_marcadas)} ítems de la pauta.")

                    if reparar:
                        ahora = ahora_str()
                        texto_extra = detalle_ot.strip() if detalle_ot.strip() else "Reparación sin detalle."
                        resumen = f"Pana cerrada ({maq['panas_reportadas'] or 'sin detalle'}). {texto_extra}"
                        conn = get_connection()
                        folio_cerrada, costo_inv = cerrar_ot(conn, maq["codigo"], mecanico, texto_extra, int(costo_rep), ahora)
                        if folio_cerrada:
                            resumen = f"{folio_cerrada} cerrada. {resumen}"
                        actualizar_equipo(conn, maq["codigo"], estado_operativo=ESTADO_DISPONIBLE, falla_activa=0, panas_reportadas='', ultima_observacion=f"Reparada por {mecanico}: {texto_extra}", fecha_actualizacion=ahora)
                        registrar_evento(conn, maq["codigo"], ahora, "REPARACIÓN TALLER", mecanico, uso_sumado=0, costo_repuestos=int(costo_rep) + costo_inv, detalle=resumen)
                        conn.commit()
                        conn.close()
                        resetear_formularios(maq["codigo"])
                        aviso = " Ojo: ya pide mantención preventiva." if maq["uso_acumulado"] >= maq["limite_mantencion"] else ""
                        flash("success", f"🔧 Pana cerrada, máquina de vuelta en patio.{aviso}")
                        st.rerun()

                    if hacer_pauta:
                        ahora = ahora_str()
                        texto_extra = detalle_ot.strip() if detalle_ot.strip() else "Pauta preventiva estándar realizada."
                        resumen_tareas = f"Pauta completada ({len(tareas_marcadas)}/{len(pauta_actual)} ítems). {texto_extra}"
                        # Si además tiene una pana abierta, sigue bloqueada hasta que se repare.
                        campos = dict(uso_acumulado=0, ultima_observacion=f"Pauta por {mecanico}: {resumen_tareas}", fecha_actualizacion=ahora)
                        if not tiene_pana and not espera_presupuesto:
                            campos["estado_operativo"] = ESTADO_DISPONIBLE
                        conn = get_connection()
                        # Una OT preventiva se cierra con la pauta; una correctiva sigue abierta hasta 'Reparado'.
                        costo_inv = 0
                        if ot_actual and ot_actual[4] == "PREVENTIVA":
                            folio_cerrada, costo_inv = cerrar_ot(conn, maq["codigo"], mecanico, resumen_tareas, int(costo_rep), ahora)
                            resumen_tareas = f"{folio_cerrada} cerrada. {resumen_tareas}"
                        actualizar_equipo(conn, maq["codigo"], **campos)
                        registrar_evento(conn, maq["codigo"], ahora, "MANTENCIÓN TALLER", mecanico, uso_sumado=0, costo_repuestos=int(costo_rep) + costo_inv, detalle=resumen_tareas)
                        conn.commit()
                        conn.close()
                        resetear_formularios(maq["codigo"])
                        if tiene_pana or espera_presupuesto:
                            flash("warning", "✅ Pauta registrada y uso reiniciado. La pana sigue abierta: ciérrala con 'Reparado'.")
                        else:
                            flash("success", "🟢 Pauta registrada, máquina lista.")
                        st.rerun()

            with col_taller_der:
                with st.container(border=True):
                    st.subheader("🤖 Asistente Técnico IA (Gemini)")
                    st.caption(f"Contextualizado para: **{maq['nombre']}** (`{cat_maq}`)")
                    if maq["panas_reportadas"]:
                        st.info(f"**Panas activas:** {maq['panas_reportadas']}")
                    else:
                        st.markdown(f"**Última nota:** *{maq['ultima_observacion']}*")

                    consulta_mecanico = st.text_area(
                        "Consulta técnica o síntoma en banco de prueba:",
                        placeholder=f"Ej: ¿Cómo diagnosticar paso a paso esta falla en {maq['nombre']}?",
                        height=100,
                        key=f"ia_q_{maq['codigo']}"
                    )

                    b_ia1, b_ia2 = st.columns(2)
                    preguntar_ia = b_ia1.button("🔍 Diagnosticar Pana", type="secondary", width="stretch", key=f"btn_ia1_{maq['codigo']}")
                    sugerir_pauta = b_ia2.button("📋 Paso a Paso Pauta", width="stretch", key=f"btn_ia2_{maq['codigo']}")

                    if preguntar_ia or sugerir_pauta:
                        contexto_falla = maq["panas_reportadas"] if maq["panas_reportadas"] else maq["ultima_observacion"]
                        prompt_base = consulta_mecanico.strip() if consulta_mecanico.strip() else f"Analiza las siguientes panas reportadas: {contexto_falla}"
                        if sugerir_pauta and not consulta_mecanico.strip():
                            prompt_base = f"Dame el procedimiento técnico resumido para ejecutar esta pauta en {cat_maq}: {', '.join(pauta_actual)}"

                        if not GEMINI_INSTALLED or not api_key_gemini:
                            st.info(
                                f"💡 **Guía Rápida de Taller para {maq['nombre']} ({cat_maq}):**\n\n"
                                f"- **Síntoma / Pana:** *{contexto_falla}*\n"
                                f"- **Puntos clave a verificar:**\n"
                                f"  1. *{pauta_actual[0]}*\n"
                                f"  2. *{pauta_actual[1]}*\n"
                                f"*(La API Key de Gemini no está configurada en secrets.toml)*"
                            )
                        else:
                            with st.spinner("Generando diagnóstico mecánico..."):
                                try:
                                    cliente_ia = genai.Client(api_key=api_key_gemini)
                                    prompt_completo = (
                                        f"Actúa como Jefe de Taller Mecánico experto. Equipo: {maq['codigo']} - {maq['nombre']} ({cat_maq}). "
                                        f"Panas: '{maq['panas_reportadas']}'. Consulta: '{prompt_base}'. "
                                        f"Responde estructurado: 1) Causa probable, 2) Pruebas en banco, 3) Repuestos."
                                    )
                                    respuesta = cliente_ia.models.generate_content(model="gemini-flash-latest", contents=prompt_completo)
                                    st.success("Diagnóstico Técnico:")
                                    st.markdown(respuesta.text)
                                except Exception as e:
                                    st.error(f"Error al consultar Gemini: {e}")

        with tab_pres:
            with st.container(border=True):
                st.subheader(f"💰 Solicitud de Presupuesto — {maq['codigo']}")

                pc1, pc2, pc3 = st.columns(3)
                with pc1:
                    solicitante_pres = st.text_input("Solicitado por:", value="Jefe de Taller", key=f"pres_sol_{maq['codigo']}")
                    prioridad_pres = st.selectbox("Prioridad:", ["Alta (Equipo Bloqueado en Taller)", "Media", "Baja"], key=f"pres_prio_{maq['codigo']}")
                with pc2:
                    destinatario_tipo = st.selectbox(
                        "Destinatario / Uso:",
                        ["Por definir (En bandeja)", "Aprobación Interna (Gerencia)", "Cobro a Cliente (Daño en faena)", "Cotización a Proveedor"],
                        key=f"pres_dest_t_{maq['codigo']}"
                    )
                    destinatario_nombre = st.text_input("Referencia / Nombre:", value="Pendiente por definir", key=f"pres_dest_n_{maq['codigo']}")
                with pc3:
                    marcar_espera_pres = st.checkbox("🟣 Dejar en estado 'ESPERANDO PRESUPUESTO'", value=True, key=f"pres_chk_est_{maq['codigo']}")

                st.divider()
                lista_panas_pres = PANAS_POR_CATEGORIA.get(cat_maq, [])
                panas_activas_maq = [p.strip() for p in maq["panas_reportadas"].split("|") if p.strip()]
                
                panas_elegidas_pres = st.multiselect(
                    f"Panas asociadas de {cat_maq}:",
                    options=list(dict.fromkeys(lista_panas_pres + panas_activas_maq)),
                    key=f"pres_multi_panas_{maq['codigo']}"
                )
                
                otra_pana_pres = st.text_input("➕ Agregar otra pana al presupuesto:", key=f"pres_otra_p_{maq['codigo']}")
                detalle_repuestos_pres = st.text_area("Listado de repuestos y mano de obra requerida:", height=100, key=f"pres_det_rep_{maq['codigo']}")

                cost1, cost2, cost3, cost4 = st.columns(4)
                with cost1:
                    c_rep = st.number_input("Costo Repuestos ($ CLP):", min_value=0, step=5000, value=0, key=f"pres_c_rep_{maq['codigo']}")
                with cost2:
                    c_mo = st.number_input("Mano de Obra ($ CLP):", min_value=0, step=5000, value=0, key=f"pres_c_mo_{maq['codigo']}")
                with cost3:
                    c_ins = st.number_input("Insumos / Externos ($ CLP):", min_value=0, step=2000, value=0, key=f"pres_c_ins_{maq['codigo']}")
                total_pres_calc = int(c_rep + c_mo + c_ins)
                with cost4:
                    st.metric("💰 Total Presupuesto (Neto)", f"${total_pres_calc:,.0f} CLP".replace(",", "."))

                if st.button("📨 Generar y Guardar Solicitud", type="primary", width="stretch", key=f"btn_crear_pres_{maq['codigo']}"):
                    ahora = ahora_str()
                    todas_panas_p = list(panas_elegidas_pres)
                    if otra_pana_pres.strip():
                        todas_panas_p.append(f"Otra: {otra_pana_pres.strip()}")
                    # panas_reales va a la máquina; el texto de relleno solo al presupuesto.
                    panas_reales = " | ".join(todas_panas_p)
                    panas_pres_str = panas_reales if panas_reales else "Evaluación general en taller"
                    det_final_pres = detalle_repuestos_pres.strip() if detalle_repuestos_pres.strip() else "Pendiente desglose fino."

                    conn = get_connection()
                    c = conn.cursor()
                    # El folio sale del id autoincremental: COUNT(*)+1 se repite si dos guardan a la vez.
                    folio_nuevo = None

                    c.execute("""
                        INSERT INTO presupuestos (
                            folio, codigo_equipo, nombre_equipo, categoria, fecha_solicitud,
                            solicitante, destinatario_tipo, destinatario_nombre, prioridad,
                            panas_asociadas, detalle_trabajos, costo_repuestos, costo_mano_obra,
                            costo_insumos, monto_total, estado_presupuesto, observaciones_resolucion
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, (
                        folio_nuevo, maq["codigo"], maq["nombre"], cat_maq, ahora,
                        solicitante_pres, destinatario_tipo, destinatario_nombre, prioridad_pres,
                        panas_pres_str, det_final_pres, c_rep, c_mo, c_ins, total_pres_calc,
                        "PENDIENTE", "En bandeja por definir/aprobar."
                    ))
                    folio_nuevo = f"PRES-{c.lastrowid:04d}"
                    c.execute("UPDATE presupuestos SET folio=? WHERE id=?", (folio_nuevo, c.lastrowid))

                    if marcar_espera_pres:
                        actualizar_equipo(conn, maq["codigo"], estado_operativo=ESTADO_EN_PRESUPUESTO, falla_activa=1, panas_reportadas=panas_reales or maq["panas_reportadas"],ultima_observacion=f"Presupuesto {folio_nuevo} (${total_pres_calc:,.0f} CLP)".replace(",", "."), fecha_actualizacion=ahora)

                    registrar_evento(conn, maq["codigo"], ahora, "SOLICITUD PRESUPUESTO", solicitante_pres, uso_sumado=0, costo_repuestos=0, detalle=f"Folio {folio_nuevo} por ${total_pres_calc:,.0f} CLP".replace(",", "."))
                    conn.commit()
                    conn.close()
                    resetear_formularios(maq["codigo"])
                    flash("success", f"✅ Presupuesto **{folio_nuevo}** generado.")
                    st.rerun()

                df_pres_maq = obtener_presupuestos()
                df_pres_maq = df_pres_maq[df_pres_maq["codigo_equipo"] == maq["codigo"]] if not df_pres_maq.empty else pd.DataFrame()
                if not df_pres_maq.empty:
                    st.divider()
                    st.markdown(f"##### 📂 Presupuestos Asociados")
                    st.dataframe(df_pres_maq[["folio", "fecha_solicitud", "estado_presupuesto", "destinatario_tipo", "monto_total", "panas_asociadas"]], width="stretch", hide_index=True)

        with tab_manual:
            if not st.session_state.is_jefe:
                st.info("🔒 Forzar estados salta el flujo de taller. Inicia sesión en '💼 4. Panel de Jefatura' para usarlo.")
            else:
                with st.container(border=True):
                    cm1, cm2, cm3 = st.columns(3)
                    with cm1:
                        estado_elegido = st.selectbox("Nuevo Estado:", ["🟢 OPERATIVA (Disponible)", "🟡 PIDE MANTENCIÓN", "🔴 EN PANA / TALLER", "🟣 ESPERANDO PRESUPUESTO"], key=f"man_est_{maq['codigo']}")
                    with cm2:
                        uso_manual = st.number_input(f"Ajustar Uso:", min_value=0, max_value=10000, value=int(maq["uso_acumulado"]), key=f"man_uso_{maq['codigo']}")
                        horometro_manual = st.number_input("Ajustar Horómetro:", min_value=0, max_value=100000, value=int(maq["horometro_actual"]), key=f"man_hor_{maq['codigo']}")
                    with cm3:
                        nota_manual = st.text_input("Nota / Motivo:", value=maq["ultima_observacion"], key=f"man_nota_{maq['codigo']}")
                        limpiar_panas_man = st.checkbox("Limpiar panas", value=("🟢" in estado_elegido), key=f"man_clr_{maq['codigo']}")

                    if st.button("⚡ Aplicar Ajuste Manual", type="primary", width="stretch", key=f"btn_man_{maq['codigo']}"):
                        ahora = ahora_str()
                        if "🟢" in estado_elegido: est_op, falla_act, uso_final = ESTADO_DISPONIBLE, 0, (0 if uso_manual >= maq["limite_mantencion"] else uso_manual)
                        elif "🟡" in estado_elegido: est_op, falla_act, uso_final = ESTADO_DISPONIBLE, 0, max(uso_manual, int(maq["limite_mantencion"]))
                        elif "🟣" in estado_elegido: est_op, falla_act, uso_final = ESTADO_EN_PRESUPUESTO, 1, uso_manual
                        else: est_op, falla_act, uso_final = ESTADO_EN_PANA, 1, uso_manual

                        panas_final = "" if limpiar_panas_man else maq["panas_reportadas"]
                        conn = get_connection()
                        actualizar_equipo(conn, maq["codigo"], uso_acumulado=uso_final, horometro_actual=horometro_manual, estado_operativo=est_op, falla_activa=falla_act, panas_reportadas=panas_final, ultima_observacion=nota_manual, fecha_actualizacion=ahora)
                        registrar_evento(conn, maq["codigo"], ahora, "AJUSTE MANUAL", "Admin Taller", uso_sumado=0, costo_repuestos=0, detalle=f"Cambio a {estado_elegido}. Nota: {nota_manual}")
                        if est_op == ESTADO_EN_PANA:
                            abrir_ot(conn, maq["codigo"], "CORRECTIVA", nota_manual or "Ajuste manual", "Jefatura", ahora)
                        elif est_op == ESTADO_DISPONIBLE:
                            cerrar_ot(conn, maq["codigo"], "Jefatura", f"Cerrada por ajuste manual: {nota_manual}", 0, ahora)
                        conn.commit()
                        conn.close()
                        resetear_formularios(maq["codigo"])
                        flash("success", "Estado actualizado.")
                        st.rerun()

        with tab_hist:
            with st.container(border=True):
                conn = get_connection()
                df_h_maq = pd.read_sql_query("SELECT * FROM historial WHERE codigo_equipo = ? ORDER BY id DESC", conn, params=(maq["codigo"],))
                conn.close()
                if df_h_maq.empty:
                    st.info("Sin eventos registrados en el historial.")
                else:
                    st.dataframe(df_h_maq, width="stretch", hide_index=True)

# ==============================================================================
# MÓDULO 2: SEMÁFORO DE PATIO (SIN TABLA DE DATOS, SOLO ACCIONES Y MOOD)
# ==============================================================================
elif modo_vista == opciones_menu[1]:
    st.subheader("🚦 Semáforo de Patio y Taller en Tiempo Real")

    total_maq = len(df_equipos)
    verdes = int((df_equipos["semaforo"].str.contains("🟢")).sum())
    amarillas = int((df_equipos["semaforo"].str.contains("🟡")).sum())
    rojas = int((df_equipos["semaforo"].str.contains("🔴")).sum())
    moradas = int((df_equipos["semaforo"].str.contains("🟣")).sum())
    
    disp_pct = round(((verdes + amarillas) / max(total_maq, 1)) * 100, 1) if total_maq > 0 else 100

    # DINÁMICA DE HUMOR/COLOR SEGÚN ESTADO DE LA FLOTA
    if disp_pct >= 85:
        mood_color = "#d1fae5" # Verde esmeralda claro
        mood_border = "#059669"
        mood_text = "Flota en Óptimas Condiciones"
        mood_emoji = "✨"
    elif disp_pct >= 65:
        mood_color = "#fef3c7" # Naranja claro
        mood_border = "#d97706"
        mood_text = "Precaución: Aumento de máquinas en taller"
        mood_emoji = "⚠️"
    else:
        mood_color = "#fee2e2" # Rojo claro
        mood_border = "#dc2626"
        mood_text = "Alerta Crítica: Demasiadas máquinas inoperativas"
        mood_emoji = "🚨"

    st.markdown(f"""
    <div style="background-color: {mood_color}; border-left: 8px solid {mood_border}; padding: 18px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <h4 style="margin: 0; color: #1f2937; font-weight: 800;">{mood_emoji} Estado General: {mood_text} ({disp_pct}% Operatividad)</h4>
    </div>
    """, unsafe_allow_html=True)

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Total Flota", f"{total_maq:,}")
    m2.metric("🟢 Operativas", f"{verdes:,}")
    m3.metric("🟡 Mantención", f"{amarillas:,}")
    m4.metric("🔴 En Pana", f"{rojas:,}")
    m5.metric("🟣 Presupuesto", f"{moradas:,}")

    with st.container(border=True):
        st.markdown("#### ⚡ Acción Rápida (Operador de Patio)")
        st.caption("Selecciona una máquina inoperativa para ejecutar una acción inmediata sin entrar a su ficha.")
        
        f1, f2, f3 = st.columns(3)
        with f1: filtro_sem = st.multiselect("Filtrar Estado:", df_equipos["semaforo"].unique(), default=df_equipos["semaforo"].unique())
        with f2: filtro_cat = st.multiselect("Filtrar Categoría:", df_equipos["categoria"].unique(), default=df_equipos["categoria"].unique())
        with f3: busqueda = st.text_input("🔍 Buscar código o falla:")

        df_filtrado = df_equipos[(df_equipos["semaforo"].isin(filtro_sem)) & (df_equipos["categoria"].isin(filtro_cat))]
        if busqueda.strip():
            q = busqueda.strip()
            df_filtrado = df_filtrado[df_filtrado["codigo"].str.contains(q, case=False, regex=False) | df_filtrado["nombre"].str.contains(q, case=False, regex=False) | df_filtrado["panas_reportadas"].str.contains(q, case=False, regex=False)]

        st.divider()
        ac1, ac2, ac3 = st.columns([1.2, 1.5, 1.3])
        codigos_filtrados = df_filtrado["codigo"].tolist()
        
        if codigos_filtrados:
            mapa_eq_sem = dict(zip(df_filtrado["codigo"], df_filtrado["codigo"] + " — " + df_filtrado["semaforo"]))
            maq_patio = ac1.selectbox("Seleccionar Equipo:", codigos_filtrados[:500], format_func=lambda c: mapa_eq_sem.get(c, c))
            acciones_patio = ["🔧 Abrir Ficha Completa del Equipo", "🔴 Bloquear por Falla (Pana)", "🟣 Enviar a Presupuesto (Daño Severo)"]
            # Liberar sin pauta solo lo puede hacer Jefatura; el operador libera desde el Taller.
            if st.session_state.is_jefe:
                acciones_patio.insert(1, "🟢 Liberar Rápido (Volver a Patio)")
            accion_rapida = ac2.selectbox("Acción a Ejecutar:", acciones_patio)
            nota_rapida = ac3.text_input("Nota rápida (Opcional):")
            
            if st.button("🚀 Ejecutar Acción", type="primary", width="stretch"):
                if "🔧" in accion_rapida:
                    st.session_state.equipo_activo = maq_patio
                    st.session_state.modulo_activo = opciones_menu[0]
                else:
                    ahora = ahora_str()
                    obs = nota_rapida.strip() if nota_rapida.strip() else "Acción desde Semáforo"
                    conn = get_connection()
                    if "🟢" in accion_rapida:
                        actualizar_equipo(conn, maq_patio, uso_acumulado=0, estado_operativo=ESTADO_DISPONIBLE, falla_activa=0, panas_reportadas='', ultima_observacion=obs, fecha_actualizacion=ahora)
                        registrar_evento(conn, maq_patio, ahora, "LIBERACIÓN PATIO", "Patio", uso_sumado=0, costo_repuestos=0, detalle=obs)
                        cerrar_ot(conn, maq_patio, "Jefatura", f"Liberación rápida desde Semáforo: {obs}", 0, ahora)
                    elif "🟣" in accion_rapida:
                        actualizar_equipo(conn, maq_patio, estado_operativo=ESTADO_EN_PRESUPUESTO, falla_activa=1, ultima_observacion=obs, fecha_actualizacion=ahora)
                        registrar_evento(conn, maq_patio, ahora, "A PRESUPUESTO", "Patio", uso_sumado=0, costo_repuestos=0, detalle=obs)
                    else:
                        actualizar_equipo(conn, maq_patio, estado_operativo=ESTADO_EN_PANA, falla_activa=1, ultima_observacion=obs, fecha_actualizacion=ahora)
                        registrar_evento(conn, maq_patio, ahora, "BLOQUEO PATIO", "Patio", uso_sumado=0, costo_repuestos=0, detalle=obs)
                        abrir_ot(conn, maq_patio, "CORRECTIVA", obs, "Patio", ahora)
                    conn.commit()
                    conn.close()
                    resetear_formularios(maq_patio)
                    flash("success", "✅ Acción ejecutada correctamente.")
                st.rerun()
        else:
            st.info("No hay equipos que coincidan con los filtros actuales.")

# ==============================================================================
# MÓDULO 3: ENROLAR MÁQUINA
# ==============================================================================
elif modo_vista == opciones_menu[2]:
    st.subheader("➕ Enrolar Nueva Máquina")
    with st.container(border=True):
        with st.form("nuevo_equipo"):
            c1, c2 = st.columns(2)
            with c1:
                nuevo_cod = st.text_input("Código (ej. RV-0005):").upper().strip()
                nuevo_nom = st.text_input("Nombre / Marca / Modelo:").strip()
                nueva_cat = st.selectbox("Categoría Técnica:", list(PANAS_POR_CATEGORIA.keys()))
                estado_inicial = st.selectbox("Estado Inicial:", [ESTADO_DISPONIBLE, ESTADO_EN_PANA, ESTADO_EN_PRESUPUESTO])
            with c2:
                nuevo_tipo = st.selectbox("Control de Desgaste por:", ["DIAS", "HORAS"])
                nuevo_lim = st.number_input("Límite de Mantención (Ciclo):", min_value=1, max_value=5000, value=15)
                horometro_ini = st.number_input("Horómetro Inicial (Hrs):", min_value=0, max_value=100000, value=0)
                nueva_ubic = st.text_input("Ubicación física del Tag NFC:").strip()

            if st.form_submit_button("💾 Registrar Máquina en Flota", type="primary"):
                if nuevo_cod and nuevo_nom:
                    ahora = ahora_str()
                    conn = None
                    try:
                        conn = get_connection()
                        conn.execute(INSERT_EQUIPOS_SQL, (nuevo_cod, nuevo_nom, nueva_cat, nueva_ubic if nueva_ubic else "Chasis", nuevo_tipo, 0, nuevo_lim, horometro_ini, estado_inicial, 1 if estado_inicial != ESTADO_DISPONIBLE else 0, "", "Ingreso nuevo a flota.", ahora))
                        registrar_evento(conn, nuevo_cod, ahora, "ENROLAMIENTO", "Admin", uso_sumado=0, costo_repuestos=0, detalle=f"Alta {nueva_cat}")
                        conn.commit()
                        st.success(f"✅ Máquina {nuevo_cod} registrada con éxito.")
                        st.info(f"📲 **Link para grabar en Tag NFC:** `https://TU-APP.streamlit.app/?equipo={nuevo_cod}`")
                    except sqlite3.IntegrityError:
                        if conn is not None: conn.rollback()
                        st.error(f"❌ El código {nuevo_cod} ya existe en la base de datos.")
                    except Exception as e:
                        if conn is not None: conn.rollback()
                        st.error(f"❌ Error crítico al registrar: {e}")
                    finally:
                        if conn is not None: conn.close()
                else:
                    st.warning("⚠️ El Código y el Nombre son campos obligatorios.")

# ==============================================================================
# MÓDULO 4: PANEL DE JEFATURA (PRESUPUESTOS Y KPIs FUSIONADOS)
# ==============================================================================
elif modo_vista == opciones_menu[3]:
    if check_password_jefatura():
        st.subheader("💼 Centro de Jefatura: Finanzas y Rendimiento")
        
        tab_presupuestos, tab_ots, tab_inventario, tab_kpis = st.tabs(["💰 Gestión de Presupuestos", "🧾 Órdenes de Trabajo", "📦 Inventario", "📊 KPIs y Costos de Taller"], key="tab_jefatura", on_change="rerun")
        
        # --- SUB-PESTAÑA 1: PRESUPUESTOS ---
        with tab_presupuestos:
            df_pres = obtener_presupuestos()
            if df_pres.empty:
                st.info("No hay presupuestos generados en el sistema.")
            else:
                kp1, kp2, kp3 = st.columns(3)
                kp1.metric("Folios Pendientes", len(df_pres[df_pres["estado_presupuesto"] == "PENDIENTE"]))
                kp2.metric("Monto Pendiente / En Revisión", f"${df_pres[df_pres['estado_presupuesto'].isin(['PENDIENTE', 'EN REVISIÓN'])]['monto_total'].sum():,.0f} CLP".replace(",", "."))
                kp3.metric("Monto Total Aprobado", f"${df_pres[df_pres['estado_presupuesto'] == 'APROBADO']['monto_total'].sum():,.0f} CLP".replace(",", "."))

                with st.container(border=True):
                    st.dataframe(df_pres, width="stretch", hide_index=True)
                    
                    st.markdown("#### ⚡ Resolución de Presupuestos")
                    col_g1, col_g2 = st.columns([1.3, 1.7])
                    with col_g1:
                        folio_sel = st.selectbox("Seleccionar Folio a resolver:", df_pres["folio"].tolist())
                        fila_p = df_pres[df_pres["folio"] == folio_sel].iloc[0]
                        nuevo_est_p = st.selectbox("Actualizar Estado:", ["PENDIENTE", "EN REVISIÓN", "APROBADO", "RECHAZADO / DADO DE BAJA"], index=["PENDIENTE", "EN REVISIÓN", "APROBADO", "RECHAZADO / DADO DE BAJA"].index(fila_p["estado_presupuesto"]) if fila_p["estado_presupuesto"] in ["PENDIENTE", "EN REVISIÓN", "APROBADO", "RECHAZADO / DADO DE BAJA"] else 0)
                        nuevo_dest_n = st.text_input("Destinatario Final / Referencia (Ej. Cliente o Centro Costo):", value=fila_p["destinatario_nombre"])
                        obs_res = st.text_input("Nota Gerencial de resolución:", value=fila_p["observaciones_resolucion"])

                        if st.button("💾 Guardar Resolución", type="primary", width="stretch"):
                            ahora = ahora_str()
                            cod_p = fila_p["codigo_equipo"]
                            conn = get_connection()
                            conn.execute("UPDATE presupuestos SET estado_presupuesto=?, destinatario_nombre=?, observaciones_resolucion=? WHERE folio=?", (nuevo_est_p, nuevo_dest_n, obs_res, folio_sel))
                            # Aprobado = se repara: la máquina sale de 🟣 y pasa al taller (🔴), donde se
                            # libera con la pauta. Solo si sigue esperando, para no pisar otro estado.
                            fila_eq = conn.execute("SELECT estado_operativo FROM equipos WHERE codigo=?", (cod_p,)).fetchone()
                            if nuevo_est_p == "APROBADO" and fila_eq and fila_eq[0] == ESTADO_EN_PRESUPUESTO:
                                actualizar_equipo(conn, cod_p, estado_operativo=ESTADO_EN_PANA, falla_activa=1, ultima_observacion=f"Presupuesto {folio_sel} aprobado. Pasa a reparación en taller.", fecha_actualizacion=ahora)
                                abrir_ot(conn, cod_p, "CORRECTIVA", f"Reparación según presupuesto {folio_sel}: {fila_p['detalle_trabajos']}", "Jefatura", ahora)
                            registrar_evento(conn, cod_p, ahora, "RESOLUCIÓN PRESUPUESTO", "Jefatura", detalle=f"Folio {folio_sel}: {nuevo_est_p}. {obs_res}")
                            conn.commit()
                            conn.close()
                            resetear_formularios(cod_p)
                            flash("success", f"Resolución del presupuesto {folio_sel} guardada.")
                            st.rerun()
                    with col_g2:
                        st.code(f"=== DETALLE PRESUPUESTO {fila_p['folio']} ===\nEquipo Asociado: {fila_p['codigo_equipo']} - {fila_p['nombre_equipo']}\nDestinatario: {fila_p['destinatario_nombre']}\nEstado Actual: {fila_p['estado_presupuesto']}\n\nDesglose:\n- Repuestos: ${fila_p['costo_repuestos']:,.0f}\n- Mano de Obra: ${fila_p['costo_mano_obra']:,.0f}\n- Insumos: ${fila_p['costo_insumos']:,.0f}\n\nTOTAL NETO: ${fila_p['monto_total']:,.0f} CLP".replace(",", "."), language="text")

        # --- SUB-PESTAÑA: ÓRDENES DE TRABAJO ---
        with tab_ots:
            conn = get_connection()
            df_ot = pd.read_sql_query("SELECT * FROM ordenes_trabajo ORDER BY id DESC", conn)
            conn.close()
            if df_ot.empty:
                st.info("Todavía no hay órdenes de trabajo.")
            else:
                apertura = pd.to_datetime(df_ot["fecha_apertura"], errors="coerce")
                cierre = pd.to_datetime(df_ot["fecha_cierre"], errors="coerce")
                ahora_dt = pd.Timestamp(datetime.now(TZ_CHILE).replace(tzinfo=None))
                df_ot["horas_en_taller"] = ((cierre.fillna(ahora_dt) - apertura).dt.total_seconds() / 3600).round(1)
                df_ot["costo_total"] = df_ot["costo_repuestos"].fillna(0) + df_ot["costo_otros"].fillna(0)
                abiertas = df_ot[df_ot["estado"] != "CERRADA"]
                cerradas = df_ot[df_ot["estado"] == "CERRADA"]

                o1, o2, o3, o4 = st.columns(4)
                o1.metric("OT abiertas", len(abiertas))
                o2.metric("Esperando repuesto", int((df_ot["estado"] == "ESPERANDO REPUESTO").sum()))
                o3.metric("Tiempo prom. reparación", f"{cerradas['horas_en_taller'].mean():.0f} h" if not cerradas.empty else "—")
                o4.metric("Costo OT cerradas", f"${cerradas['costo_total'].sum():,.0f}".replace(",", "."))

                ver_ot = st.radio("Mostrar:", ["Abiertas", "Cerradas", "Todas"], horizontal=True, key="ot_filtro")
                df_ver = abiertas if ver_ot == "Abiertas" else (cerradas if ver_ot == "Cerradas" else df_ot)
                st.dataframe(
                    df_ver[["folio", "codigo_equipo", "tipo", "estado", "fecha_apertura", "fecha_cierre", "horas_en_taller", "mecanico", "descripcion", "costo_total"]],
                    width="stretch", hide_index=True,
                    column_config={
                        "horas_en_taller": st.column_config.NumberColumn("Horas en taller", format="%.1f h"),
                        "costo_total": st.column_config.NumberColumn("Costo total", format="$%d"),
                    }
                )

        # --- SUB-PESTAÑA: INVENTARIO ---
        with tab_inventario:
            conn = get_connection()
            df_inv = pd.read_sql_query("SELECT * FROM repuestos ORDER BY nombre", conn)
            conn.close()
            bajo_stock = df_inv[df_inv["stock"] <= df_inv["stock_minimo"]]

            i1, i2, i3 = st.columns(3)
            i1.metric("Repuestos registrados", len(df_inv))
            i2.metric("Bajo stock mínimo", len(bajo_stock))
            i3.metric("Valor en bodega", f"${int((df_inv['stock'] * df_inv['costo_unitario']).sum()):,.0f} CLP".replace(",", "."))
            if not bajo_stock.empty:
                st.warning("📦 **Reponer:** " + " · ".join(f"{r.nombre} ({r.stock}/{r.stock_minimo} {r.unidad})" for r in bajo_stock.itertuples()))

            df_inv_ver = df_inv.drop(columns=["id"]).copy()
            df_inv_ver.insert(0, "alerta", ["⚠️" if s <= m else "✅" for s, m in zip(df_inv["stock"], df_inv["stock_minimo"])])
            st.dataframe(df_inv_ver, width="stretch", hide_index=True,
                         column_config={"costo_unitario": st.column_config.NumberColumn("Costo unitario", format="$%d")})

            inv_c1, inv_c2 = st.columns(2)
            with inv_c1:
                with st.form("form_ingreso_stock", clear_on_submit=True):
                    st.markdown("##### ➕ Ingresar stock (compra)")
                    if df_inv.empty:
                        st.caption("Primero crea un repuesto.")
                        rep_ing = None
                    else:
                        mapa_inv = dict(zip(df_inv["id"].astype(int), df_inv["nombre"] + " — stock " + df_inv["stock"].astype(str)))
                        rep_ing = st.selectbox("Repuesto:", list(mapa_inv), format_func=lambda i: mapa_inv[i])
                    cant_ing = st.number_input("Cantidad que entra:", min_value=1, value=1, step=1)
                    costo_ing = st.number_input("Nuevo costo unitario (0 = mantener):", min_value=0, value=0, step=500)
                    if st.form_submit_button("Guardar ingreso", type="primary") and rep_ing is not None:
                        conn = get_connection()
                        conn.execute("UPDATE repuestos SET stock = stock + ? WHERE id=?", (int(cant_ing), int(rep_ing)))
                        if costo_ing > 0:
                            conn.execute("UPDATE repuestos SET costo_unitario=? WHERE id=?", (int(costo_ing), int(rep_ing)))
                        conn.commit()
                        conn.close()
                        flash("success", f"📦 Ingreso de {cant_ing} unidades guardado.")
                        st.rerun()
            with inv_c2:
                with st.form("form_nuevo_repuesto", clear_on_submit=True):
                    st.markdown("##### 🆕 Nuevo repuesto")
                    nr_cod = st.text_input("Código (ej. REP-010):").upper().strip()
                    nr_nom = st.text_input("Nombre:").strip()
                    nr_aplica = st.selectbox("Aplica a:", ["General"] + list(PANAS_POR_CATEGORIA.keys()))
                    nr_a, nr_b, nr_c = st.columns(3)
                    nr_uni = nr_a.text_input("Unidad:", value="unidad").strip()
                    nr_stock = nr_b.number_input("Stock:", min_value=0, value=0, step=1)
                    nr_min = nr_c.number_input("Mínimo:", min_value=0, value=1, step=1)
                    nr_costo = st.number_input("Costo unitario ($ CLP):", min_value=0, value=0, step=500)
                    if st.form_submit_button("Crear repuesto", type="primary"):
                        if not nr_cod or not nr_nom:
                            st.warning("Código y nombre son obligatorios.")
                        else:
                            conn = get_connection()
                            try:
                                conn.execute("INSERT INTO repuestos (codigo, nombre, aplica_a, unidad, stock, stock_minimo, costo_unitario) VALUES (?,?,?,?,?,?,?)",
                                             (nr_cod, nr_nom, nr_aplica, nr_uni or "unidad", int(nr_stock), int(nr_min), int(nr_costo)))
                                conn.commit()
                                flash("success", f"🆕 {nr_cod} — {nr_nom} creado.")
                                st.rerun()
                            except sqlite3.IntegrityError:
                                st.error(f"El código {nr_cod} ya existe.")
                            finally:
                                conn.close()

        # --- SUB-PESTAÑA 2: KPIs ---
        with tab_kpis:
            df_hist = obtener_historial(limite=5000)
            
            indisponibles = int((df_equipos["semaforo"].str.contains("🔴|🟣")).sum())
            disp_pct = round(((len(df_equipos) - indisponibles) / max(len(df_equipos), 1)) * 100, 1)

            k1, k2, k3 = st.columns(3)
            k1.metric("Disponibilidad Mecánica Global", f"{disp_pct}%")
            # La tabla de abajo trae solo los últimos 5000 eventos; el total se suma sobre todo el historial.
            conn = get_connection()
            gasto_total = conn.execute("SELECT COALESCE(SUM(costo_repuestos), 0) FROM historial").fetchone()[0]
            conn.close()
            k2.metric("Gasto Total en Repuestos (Histórico)", f"${gasto_total:,.0f} CLP".replace(",", "."))
            k3.metric("Máquinas Totalmente Detenidas", f"{indisponibles} unidades")

            g_col1, g_col2 = st.columns(2)
            with g_col1:
                with st.container(border=True):
                    st.markdown("##### 💸 Ranking de Gasto en Repuestos por Equipo ($ CLP)")
                    if df_hist['costo_repuestos'].sum() > 0:
                        st.bar_chart(df_hist.groupby("codigo_equipo")["costo_repuestos"].sum().reset_index().set_index("codigo_equipo"))
                    else:
                        st.info("Sin gastos registrados en el sistema de historial.")

            with g_col2:
                with st.container(border=True):
                    st.markdown("##### 🔧 Distribución de Fallas Activas por Categoría")
                    df_panas = df_equipos[df_equipos["falla_activa"] == 1].groupby("categoria").size()
                    if not df_panas.empty:
                        st.bar_chart(df_panas)
                    else:
                        st.info("No hay fallas activas reportadas en este momento.")

            with st.container(border=True):
                st.markdown("##### 📋 Auditoría Completa de Movimientos (Historial de Taller)")
                st.dataframe(df_hist, width="stretch", hide_index=True)