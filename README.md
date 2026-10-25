# Rental Valdivia V12 — Control de Taller, Flota & Telemetría NFC

Sistema industrial integral para la gestión operativa de maquinaria de arriendo, control de mantenciones preventivas/correctivas, vinculación mediante chips **NFC / Códigos QR**, órdenes de trabajo (OT), bodega de repuestos y aprobación ejecutiva de presupuestos.

Diseñado con una **interfaz técnica industrial** en paleta **Verde Bosque Corporativo (`#064E3B`)**, **Azul Acero (`#0C4A6E` / `#0284C7`)** y **Gris Titanio (`#0F172A`)**, utilizando iconografía vectorial técnica e indicadores LED de estado.

---

## Arquitectura del Repositorio

Este repositorio incluye **ambas versiones** del sistema:

1. **Aplicación Web Full-Stack (React 19 + TypeScript + Express + Tailwind CSS)** *(Raíz del proyecto)*:
   - **`/src/components/EstacionTrabajo.tsx`**: Ficha técnica por equipo, botón de emergencia de **Pana Fulminante**, recepción en patio con evidencia fotográfica, banco de trabajo mecánico (OTs, pautas preventivas, consumo de repuestos de bodega y diagnóstico asistido por IA), solicitud de presupuestos e historial completo.
   - **`/src/components/SemaforoPatio.tsx`**: Tablero de control en tiempo real con disponibilidad de flota (%), filtros por estado LED (`OPERATIVA`, `PIDE MANTENCIÓN`, `EN PANA`, `ESPERANDO PRESUPUESTO`) y liberación rápida de máquinas.
   - **`/src/components/EnrolarMaquina.tsx`**: Alta técnica de maquinaria nueva, generación automática de enlaces profundos `/?id=CODIGO` para grabación en chips NFC y códigos QR descargables.
   - **`/src/components/PanelJefatura.tsx`**: Módulo protegido por contraseña para resolución de presupuestos, auditoría del libro mayor de OTs, valorización/abastecimiento de bodega y ranking de costos por equipo.
   - **`/server.ts`**: Servidor Express con persistencia automática en `rental_valdivia_db.json`, almacenamiento de evidencias fotográficas y conexión segura con `@google/genai`.

2. **Script Original en Python / Streamlit**:
   - Ubicado en `public/assets/aistudio/pax.v12_53458089.py` junto con `requirements.txt` en la raíz por si deseas ejecutarlo o desplegarlo en **Streamlit Community Cloud**.

---

## Instalación y Ejecución Local (Versión Web React + Node.js)

### 1. Requisitos previos
- **Node.js** v18 o superior.

### 2. Clonar e instalar dependencias
```bash
git clone https://github.com/TU_USUARIO/rental-valdivia-nfc.git
cd rental-valdivia-nfc
npm install
```

### 3. Configurar variables de entorno
Copia el archivo `.env.example` a `.env` y personaliza tus credenciales:
```bash
cp .env.example .env
```
- `PASSWORD_JEFE`: Clave para el Panel de Jefatura (por defecto `valdivia2026`).
- `TELEFONO_TALLER`: Número de WhatsApp receptor de alertas de terreno (ej. `56912345678`).
- `GEMINI_API_KEY`: Clave opcional de Google Gemini para diagnóstico mecánico asistido.

### 4. Iniciar el servidor de desarrollo
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

---

## Ejecución Alternativa en Python (Streamlit)

Si deseas correr el script monolítico original en Python:

```bash
pip install -r requirements.txt
streamlit run public/assets/aistudio/pax.v12_53458089.py
```

---

## Grabación de Chips NFC en Maquinaria

1. En la aplicación, abre el módulo **Enrolar Máquina (NFC)** o selecciona cualquier equipo en la **Estación de Trabajo**.
2. Copia la dirección URL única del equipo (formato: `https://tu-dominio.com/?id=COR-01`).
3. En tu teléfono móvil, abre la aplicación **NFC Tools**:
   - Ve a **Escribir** &rarr; **Añadir un registro** &rarr; **URL / URI**.
   - Pega el enlace del equipo y presiona **Escribir** acercando el teléfono al tag NFC fijado en el chasis.
4. Al acercar cualquier teléfono con NFC al equipo en terreno, se abrirá directamente su ficha operativa lista para reportar recepción, horómetro o **Pana Fulminante**.
