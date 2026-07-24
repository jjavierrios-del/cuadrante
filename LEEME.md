# Cuadrante · App instalable (PWA) para iOS y Android

Esta carpeta contiene una aplicación web progresiva (PWA): una vez alojada en
internet, se instala con icono propio en iPhone, iPad, Android, Mac y PC, y
funciona incluso sin conexión.

## 1. Publicar la app (una sola vez, ~10 minutos, gratis)

Opción recomendada: **GitHub Pages**

1. Crea una cuenta gratuita en https://github.com si no tienes.
2. Pulsa **New repository** → nombre: `cuadrante` → Public → Create.
3. En el repositorio: **Add file → Upload files** y arrastra TODOS los archivos
   de esta carpeta (index.html, manifest.webmanifest, sw.js, icon-*.png).
   Commit changes.
4. Ve a **Settings → Pages** → en "Branch" elige `main` y carpeta `/ (root)` → Save.
5. En 1-2 minutos tu app estará en:
   `https://TUUSUARIO.github.io/cuadrante/`

Alternativa: Netlify (https://app.netlify.com → "Add new site → Deploy manually"
y arrastrar la carpeta).

## 2. Instalarla en los móviles del equipo

Comparte el enlace por el grupo del servicio.

- **iPhone / iPad**: abrir el enlace en **Safari** → botón Compartir (cuadrado
  con flecha) → **Añadir a pantalla de inicio** → Añadir.
- **Android**: abrir el enlace en **Chrome** → aparecerá "Instalar aplicación"
  (o menú ⋮ → **Instalar aplicación** / "Añadir a pantalla de inicio").

La app se abre a pantalla completa, con su icono, sin barra del navegador.

## 3. Flujo de trabajo del jefe de servicio

1. Abre la app (o el archivo index.html en tu Mac) y edita el cuadrante con
   normalidad: equipo, ausencias, Generar mes…
2. Cuando quieras que el equipo vea la versión nueva:
   **Ajustes → Publicar para el equipo → Descargar data.json**
3. Sube ese `data.json` al repositorio de GitHub (Add file → Upload files),
   reemplazando el anterior.

## 4. Qué ve el equipo

- Al abrir la app, si existe `data.json` publicado y el dispositivo no tiene
  datos propios, entra en **modo Solo consulta**: ven el cuadrante, la
  cobertura de cada día, el equipo y las estadísticas, sin poder modificar nada.
- El botón **Actualizar** recarga la última publicación.
- Nadie puede alterar lo publicado: solo quien tenga acceso al repositorio
  (tú) puede subir un data.json nuevo. Esa es la protección real.

## Notas

- La app funciona sin conexión con los últimos datos descargados.
- Los festivos precargados de 2026 deben verificarse frente al calendario
  laboral oficial (BOE / Junta de Andalucía) y completarse con los locales.
- El archivo data.json contiene los nombres del equipo: publícalo solo si te
  parece adecuado (el repositorio es público). Si prefieres privacidad total,
  usa el artefacto compartido de Claude, que exige inicio de sesión.
