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

## 3. Publicación AUTOMÁTICA (sin subir archivos a mano)

Configúralo una vez y olvídate: cada cambio se publica solo.

1. Crea un token en GitHub: foto de perfil → **Settings** →
   **Developer settings** → **Personal access tokens → Fine-grained tokens**
   → *Generate new token*.
   - Repository access: **Only select repositories** → elige `cuadrante`.
   - Permissions → Repository permissions → **Contents: Read and write**.
   - Expiración: la máxima que te permita. Copia el token (empieza por
     `github_pat_...`).
2. En la app (en tu dispositivo de trabajo): **Ajustes → Publicación para el
   equipo** → rellena Usuario, Repositorio (`cuadrante`), Rama (`main`) y pega
   el Token → marca **Publicar automáticamente al guardar** → pulsa
   **Guardar conexión y publicar ahora**. Verás "✓ Publicado HH:MM" arriba.
3. Listo: a partir de ahí, cada modificación del cuadrante se sube sola
   (unos segundos después del último cambio). El equipo la ve al abrir la app
   o pulsar «Actualizar» (GitHub Pages tarda ~1 minuto en refrescar).

El token queda guardado SOLO en tu dispositivo (no viaja en data.json ni en
las copias de seguridad). Si configuras la app también en el Mac y en el
iPhone, introduce el token en ambos. Ante cualquier duda, revócalo en GitHub
y crea otro.

### Alternativa manual

Si prefieres no usar token: **Ajustes → Descargar data.json (manual)** y
súbelo al repositorio reemplazando el anterior.

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

## 5. Solicitudes de cambio del equipo

Los compañeros pueden proponer cambios y tú los autorizas:

1. **Configúralo** (una vez): Ajustes → *Solicitudes de cambio* → escribe tu
   correo y/o tu WhatsApp. Se publican con el cuadrante para que la app de
   los compañeros sepa a dónde enviar.
2. **El compañero**: toca la celda que quiere cambiar (o el botón «Solicitar
   cambio») → la app le muestra la asignación actual, elige la propuesta
   (consulta de mañana/tarde, urgencias, ausencia o liberar el día), escribe
   el motivo y pulsa **Enviar por correo** o **WhatsApp**. El mensaje sale ya
   redactado, con un código [SOLICITUD]{…} al final.
3. **Tú**: recibes el mensaje → abres la app → botón **Revisar solicitud** →
   pegas el mensaje completo → la app te muestra quién pide qué, la fecha y
   el cambio (actual → propuesto) → pulsas **Autorizar y aplicar**. El
   cuadrante se actualiza y, con la publicación automática activada, el
   equipo lo ve al momento.

Si no autorizas una solicitud, simplemente no la apliques: nada cambia sin
tu aprobación.
