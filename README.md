# Paperless - Notas Adhesivas de Escritorio

Aplicación nativa de notas adhesivas ("Post-its") flotantes para Windows, macOS y Linux construida con **Electron**.

## Características

- **Lienzo transparente y sin bordes:** Las notas flotan sobre el escritorio y los clics atraviesan las zonas vacías transparentes hacia tus demás ventanas.
- **Comandos `/` estilo Notion:** Escribe `/` para abrir el menú de bloques (listas de tareas interactivas, listas con viñetas/numeradas, encabezados H1/H2, citas, separadores y estilos de texto).
- **Redimensionable y adaptable:** Ajusta el tamaño de cada nota desde la esquina inferior derecha; la barra de herramientas inferior se adapta automáticamente al espacio disponible.
- **Guardado automático local:** El contenido enriquecido, color, tamaño y coordenadas `(x, y)` se guardan automáticamente en un archivo JSON local.

## Desarrollo local

```bash
npm install
npm start
```

## Compilar instaladores localmente

```bash
# Compilar para tu sistema actual
npm run dist

# O específicamente por plataforma:
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Publicar en Producción (Landing Page + GitHub Releases)

1. **Publicar los instaladores automáticamente con GitHub Actions:**
   Al subir un tag de versión, el workflow [`.github/workflows/release.yml`](file:///Users/ivettesanjurjo/Developer/Projects/paperless/.github/workflows/release.yml) compila automáticamente los instaladores para macOS (`.dmg`), Windows (`.exe`) y Linux (`.AppImage`) y los adjunta en **GitHub Releases**:
   ```bash
   git add .
   git commit -m "Release v1.0.0"
   git push origin main
   git tag v1.0.0
   git push origin v1.0.0
   ```
   *(Nota: En GitHub, ve a `Settings` → `Actions` → `General` → `Workflow permissions` y asegúrate de tener marcada la opción **Read and write permissions**, o publica el borrador de la Release desde la pestaña Releases de GitHub).*

2. **Activar la web de descarga (Landing Page en `docs/`):**
   - En tu repositorio de GitHub (`ivetetetete/paperless`), entra en **Settings → Pages**.
   - En **Build and deployment**, selecciona **Deploy from a branch**.
   - Elige la rama `main` y la carpeta **`/docs`** y pulsa **Save**.
   - Tu web quedará publicada en `https://ivetetetete.github.io/paperless/`, detectando automáticamente el sistema operativo de quien la visite y enlazando a los instaladores de tu última Release.