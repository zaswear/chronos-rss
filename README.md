# Chronos RSS · El eco del tiempo

Chronos RSS es un lector de feeds RSS premium y minimalista enfocado en la lectura pausada y la reducción del ruido informativo (infoxicación). Diseñado bajo una estética de **periódico retro-futurista de alta gama**, funciona completamente en el cliente (navegador) de forma rápida y ligera.

---

## 🎨 Sistema de Diseño Editorial
El diseño de la aplicación evoca las columnas impresas de la prensa clásica combinadas con micro-interacciones de la web moderna:
* **Tipografías**: Lora (serif para títulos y logotipo principal), Plus Jakarta Sans (sans-serif legible para lectura e interfaces) y JetBrains Mono (monoespaciada técnica para metadatos).
* **Paleta de Colores**:
  * **Modo Claro (Papel Prensa)**: Tonos crema suaves (`#FAF7F2`), texto tinta negro carbón (`#1F1F1F`) y acentos terracota.
  * **Modo Oscuro (Tinta de Carbón)**: Fondo carbón oscuro (`#121212`), texto crema claro (`#EAE6DF`) y acentos en naranja ámbar.
* **Detalles Premium**: Doble línea editorial en cabeceras, bordes finos definidos, elevaciones de tarjeta planas (`shadow-editorial`), animaciones de shimmer para estados de carga y smooth scroll nativo gracias a Lenis.

---

## ⚡ Características Clave

1. **Suscripciones Traducidas al Español**: Todos los feeds de noticias internacionales en inglés u otros idiomas se traducen automáticamente en la interfaz. El título y resumen del artículo se muestran siempre en español, y el lector enfocado permite traducir el artículo completo párrafo a párrafo conservando el formato.
2. **Botón "Ver Original"**: En cualquier momento, puedes acceder a la fuente original del artículo haciendo clic en el botón de la esquina superior derecha o pulsando un atajo de teclado.
3. **CORS-Proxy Rotativo**: Integra un sistema cliente-side que rota automáticamente a través de múltiples proxies públicos (como `corsproxy.io` o `allorigins`) para recuperar el contenido XML de los feeds sin necesidad de un backend.
4. **Almacenamiento Local Eficiente**: Utiliza `localStorage` para guardar tus suscripciones, favoritos y caché offline. Aplica una cuota inteligente (máximo 40 artículos guardados por feed) para no exceder los límites de almacenamiento del navegador.
5. **Navegación por Teclado (Keyboard Shortcuts)**:
   * `J` / `K` : Moverse al siguiente / anterior artículo.
   * `S` : Guardar / quitar de favoritos.
   * `O` : Abrir el enlace original en una nueva pestaña.
   * `Esc` : Cerrar el artículo activo (o panel en móvil).

---

## 📂 Estructura del Proyecto

* `index.html`: Esqueleto semántico de la SPA (tres columnas: Suscripciones, Artículos y Lector).
* `style.css`: Hojas de estilos del diseño editorial y adaptaciones responsivas para móviles.
* `app.js`: Controlador principal (descarga XML, parseo RSS/Atom, almacenamiento local, traducción y atajos).
* `feeds-default.json`: Listado de periódicos, revistas y blogs sugeridos por defecto.
* `LICENSE`: Licencia de código abierto MIT.

---

## 🚀 Cómo Empezar

Al ser una aplicación 100% estática basada en HTML, CSS y JS puro, puedes ejecutarla de las siguientes maneras:

### Opción A: Servidor local básico (Recomendado)
Para evitar bloqueos de seguridad locales de archivos en algunos navegadores, ejecuta un servidor HTTP simple desde la carpeta del proyecto:

**En Python (WSL / Linux / macOS / Windows):**
```bash
python3 -m http.server 8000
```
Luego abre `http://localhost:8000` en tu navegador.

**En Node.js (con serve):**
```bash
npx serve .
```

### Opción B: Doble Clic
También puedes abrir el archivo `index.html` directamente en tu navegador favorito haciendo doble clic sobre él.

---

## 🛡️ Licencia
Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.
