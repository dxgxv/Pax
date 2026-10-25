# Plan de Preparación y Subida a GitHub — Rental Valdivia V12

## 1. Objetivo
Dejar el proyecto **Rental Valdivia (Control de Taller & Telemetría NFC)** completamente estructurado, documentado y versionado con Git para subirlo a un **repositorio nuevo en GitHub**, incluyendo tanto la **aplicación web full-stack actual (React + Express + TypeScript)** como el **script original en Python (`pax.v12.py` + `requirements.txt`)**.

---

## 2. Archivos y Estructura que Prepararemos en el Proyecto

1. **Conservación Dual (Web Full-Stack + Python Original)**:
   - Mantendremos toda la arquitectura actual en la raíz (`src/`, `server.ts`, `package.json`, `vite.config.ts`) lista para ejecutarse con `npm install && npm run dev`.
   - Crearemos una carpeta dedicada `/streamlit_legacy/` (además del respaldo en `/public/assets/aistudio/`) con `pax_v12.py` y su archivo `requirements.txt` (`streamlit`, `pandas`, `google-genai`) por si deseas desplegar también la versión Python o conservarla como referencia.

2. **Configuración de Seguridad y `.gitignore`**:
   - Actualizaremos `.gitignore` para excluir `node_modules/`, `dist/`, `.env` (protegiendo tu `GEMINI_API_KEY` y `PASSWORD_JEFE`), archivos temporales y cachés.
   - Mantendremos `.env.example` documentado con todas las variables de entorno necesarias (`GEMINI_API_KEY`, `PASSWORD_JEFE`, `TELEFONO_TALLER`).

3. **Documentación Profesional (`README.md`)**:
   - Crearemos un `README.md` completo en español con:
     - Descripción general del sistema industrial **Rental Valdivia V12** y su estética corporativa (Verde Bosque, Azul Acero y Gris Titanio).
     - Detalle de los 4 módulos (**Estación de Trabajo & NFC**, **Semáforo del Patio**, **Enrolamiento NFC/QR**, **Panel de Jefatura y Bodega**).
     - Instrucciones de instalación local y despliegue tanto para Node.js/React como para Python/Streamlit.
     - Guía rápida para grabar los chips NFC físicos con **NFC Tools**.

4. **Inicialización del Repositorio Git Local y Guía Interactiva**:
   - Inicializaremos el repositorio Git local (`git init`), configuraremos la rama principal `main` y crearemos el commit inicial limpio con todos los archivos del proyecto.
   - Agregaremos un asistente interactivo de **"Subir a GitHub"** en la barra superior de la aplicación con los pasos exactos y comandos listos para copiar según el nombre de tu nuevo repositorio:
     - **Opción A (Sincronización en 1 clic desde AI Studio)**: Cómo usar el icono de GitHub en la esquina superior derecha de Google AI Studio para crear y publicar el repositorio automáticamente.
     - **Opción B (Vía Git / Terminal o Descarga ZIP)**: Comandos listos para copiar (`git remote add origin ...` y `git push -u origin main`).

---

## 3. Fases de Ejecución (Al hacer clic en Proceed)

1. **Paso 1**: Actualizar `.gitignore`, organizar `streamlit_legacy/requirements.txt` y redactar el `README.md` técnico del repositorio.
2. **Paso 2**: Inicializar Git en el espacio de trabajo y realizar el commit consolidado de la versión V12 Industrial.
3. **Paso 3**: Incorporar el botón/modal de **"Guía GitHub"** en el encabezado de la app y presentarte los pasos exactos para completar la subida.
