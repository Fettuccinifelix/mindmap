# Threadboard

A quiet space for connected thoughts. A self-hosted digital board with colored notes, strings, and reviewed photo imports from a physical sticky-note wall.

## Run on your computer

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Open `http://127.0.0.1:3001`. The example configuration uses **Ollama** for local vision analysis, with no API key. Install and start Ollama, then run `ollama pull qwen2.5vl:3b` before analyzing photos. After the initial model download, local analysis needs no internet connection. All board editing also works without Ollama running.

### Windows setup with Ollama

1. Install [Ollama for Windows](https://ollama.com/download/windows) and launch it. Update your NVIDIA driver if Ollama does not detect your GPU.
2. In Command Prompt, download the small vision model:

   ```bat
   ollama pull qwen2.5vl:3b
   ollama list
   ```

3. In your existing repository folder, update the app:

   ```bat
   git switch work
   git pull --ff-only origin work
   npm ci
   ```

4. If you do not already have `.env`, run `copy .env.example .env`. If it exists, edit it with `notepad .env` and add or update these lines (preserve other settings):

   ```dotenv
   PHOTO_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=qwen2.5vl:3b
   ```

   An OpenAI key is not needed in Ollama mode. Restart Threadboard after editing `.env`.

5. Build and start:

   ```bat
   npm run build
   npm start
   ```

6. Open `http://127.0.0.1:3001` in the same browser/address you previously used to keep access to your saved boards. Click **Import photo**, choose a well-lit wall photo, and click **Analyze photo**. The dialog should say **Analyzed on your computer with Ollama**. Review and correct the notes before importing.

The first analysis may be slower while Ollama loads the model. The local timeout is three minutes. Start with a small group of notes to assess handwriting accuracy. A 3B model is a starting point for your laptop, not a guarantee of recognition quality or full GPU offload. During analysis, run `ollama ps` in a second window to check GPU/CPU use.

If analysis fails:

- Run `curl http://127.0.0.1:11434/api/tags` to check that Ollama is reachable. If not, launch the Ollama desktop app; alternatively run `ollama serve` in a separate terminal. An address-in-use message usually means Ollama is already running.
- Run `ollama list` and check that the exact configured model name is installed. Use `ollama pull qwen2.5vl:3b` if needed.
- A response-limit message means Ollama stopped before finishing the JSON. The app explicitly requests a 16K context, an 8K output budget, and schema-constrained JSON; large walls may still need several cropped photos. This context uses more memory than Ollama defaults. No partial notes are imported.
- A timeout or invalid response can improve with a sharper photo of fewer notes. Local models can miss handwriting or produce inaccurate boxes; the review step remains important.
- Keep Ollama bound to localhost. The browser talks to Threadboard, which talks to Ollama; no browser CORS changes or public Ollama port are needed.

### Optional OpenAI mode

Set `PHOTO_PROVIDER=openai`, `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-4.1-mini` in `.env`, then restart. This sends selected photos to OpenAI and incurs provider charges. Existing configurations with an OpenAI key and no explicit `PHOTO_PROVIDER` continue using OpenAI; otherwise the default is Ollama. Explicit `PHOTO_PROVIDER=ollama` always uses Ollama even if a key remains configured.

For development, run `npm run dev` and open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Express service. If changing `PORT`, also update Vite's proxy target for development. The production server serves the built frontend and API on the same origin.

## Use your board

- Add notes, edit their text, and select a color from the palette on each note. Drag a note by its top strip; drag its selected corner handles to resize.
- Draw a string from the bottom dot of one note to the top dot of another. Strings are undirected. Select notes or strings, then use the trash button or Delete key. Self-connections and duplicate connections are ignored.
- Pan on the canvas, pinch/scroll to zoom, and use the fit-view control. Undo/redo buttons and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z restore board edits. Text edits are grouped into short typing bursts. History lasts for the open board session, up to 80 changes; switching boards clears history.
- Create and name multiple boards. **Export backup** downloads every board in a versioned JSON file. **Import backup** validates the file and adds copies with new board IDs; existing boards are never overwritten.
- Use **Import photo** for the current board or **Create board from photo** for a new one. Choose JPEG, PNG, or WebP (maximum 10 MB); convert HEIC first. Images are oriented and downsized before sending. Click **Analyze photo** to send the selected photo to the configured model (local Ollama by default).
- Review numbered boxes, edit recognized text and colors, remove false detections, and use **Add missed note** then click its position in the photo. Confirm to import. Notes retain relative placement, with minimum readable sizes. Existing-board imports go to the right of existing notes and can be undone together. Physical strings are not detected.

## Storage and privacy

Boards autosave in IndexedDB in this browser on this device. Different browsers, devices, ports, and hostnames have separate storage. No account, sync, server-side board database, or collaboration is included. Browser storage is subject to device quotas and can be removed by clearing site data or private browsing. Export backups regularly. A save failure is shown in the app; export before closing if storage is unavailable.

Photos are held in memory for review and processing, never written to the server or saved in a board. Photos and recognized text are not logged by the app. A chosen photo is only sent after clicking Analyze; local Ollama processing stays on your computer when using the default loopback URL. If you configure a remote Ollama server, photos are sent to that server. OpenAI mode sends photos to the cloud and its data handling policies apply. Canceling closes the review and aborts the client request, but cannot retract a request already sent to the provider.

## Phone access on a trusted home network

Use the production build. Set `HOST=0.0.0.0` in `.env`, restart, and open `http://YOUR-COMPUTER-LAN-IP:3001` on your phone on the same trusted network. Allow the port through your local firewall only for your private network. Do not forward the port on your router or expose it publicly: this single-user app has no authentication. Phone boards are saved in the phone's browser; use JSON backups to transfer them. Browser camera capture support varies; the upload picker works where direct camera capture is unavailable. Some mobile browsers restrict IndexedDB or secure APIs over plain LAN HTTP; use a trusted local HTTPS reverse proxy if needed.

## API

`POST /api/analyze-photo`: multipart form with one `image` file. Returns `{notes: [{text, color, x, y, width, height}]}` with normalized bounding boxes. Supported colors: yellow, pink, blue, green, purple, white. Image contents and returned bounds are validated. Uploads are limited to 10 MB and decoded images to 40 million pixels. Analysis times out after 180 seconds for Ollama or 45 seconds for OpenAI. Errors return `{error: string}` with 400 (invalid image), 403 (cross-origin), 413 (too large), 415 (unsupported type), 502 (provider/response failure), 503 (invalid provider or missing cloud key), or 504 (timeout).

`GET /api/photo-config` returns the provider, model, timeout and whether Ollama is configured on loopback, without exposing credentials. It describes configuration, not model readiness. `OLLAMA_BASE_URL` is server-only configuration.

## Checks

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Endpoint tests mock the model and cover image validation, response validation, limits, missing credentials, provider failure, and timeout. Browser tests cover editing, history, autosave, board switching, backups, and reviewed/canceled/failed photo imports. Ollama protocol tests also verify base64 image requests, missing models, connection failures, malformed results and cancellation. A live local-model check needs Ollama, the downloaded model and a representative wall photo; OpenAI checks additionally need an API key. Mocked tests do not establish recognition quality.
