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

Open `http://127.0.0.1:3001`. For photo analysis, set `OPENAI_API_KEY` in `.env` and restart the server. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The key stays on the server. Analysis uses the cloud API and incurs provider charges; all editing works without a key.

For development, run `npm run dev` and open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Express service. If changing `PORT`, also update Vite's proxy target for development. The production server serves the built frontend and API on the same origin.

## Use your board

- Add notes, edit their text, and select a color from the palette on each note. Drag a note by its top strip; drag its selected corner handles to resize.
- Draw a string from the bottom dot of one note to the top dot of another. Strings are undirected. Select notes or strings, then use the trash button or Delete key. Self-connections and duplicate connections are ignored.
- Pan on the canvas, pinch/scroll to zoom, and use the fit-view control. Undo/redo buttons and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z restore board edits. Text edits are grouped into short typing bursts. History lasts for the open board session, up to 80 changes; switching boards clears history.
- Create and name multiple boards. **Export backup** downloads every board in a versioned JSON file. **Import backup** validates the file and adds copies with new board IDs; existing boards are never overwritten.
- Use **Import photo** for the current board or **Create board from photo** for a new one. Choose JPEG, PNG, or WebP (maximum 10 MB); convert HEIC first. Images are oriented and downsized before sending. Click **Analyze photo** to send the selected photo to OpenAI.
- Review numbered boxes, edit recognized text and colors, remove false detections, and use **Add missed note** then click its position in the photo. Confirm to import. Notes retain relative placement, with minimum readable sizes. Existing-board imports go to the right of existing notes and can be undone together. Physical strings are not detected.

## Storage and privacy

Boards autosave in IndexedDB in this browser on this device. Different browsers, devices, ports, and hostnames have separate storage. No account, sync, server-side board database, or collaboration is included. Browser storage is subject to device quotas and can be removed by clearing site data or private browsing. Export backups regularly. A save failure is shown in the app; export before closing if storage is unavailable.

Photos are held in memory for review and processing, never written to the server or saved in a board. Photos and recognized text are not logged by the app. A chosen photo is only sent after clicking Analyze; provider data handling policies apply. Canceling closes the review and aborts the client request, but cannot retract a request already sent to the provider.

## Phone access on a trusted home network

Use the production build. Set `HOST=0.0.0.0` in `.env`, restart, and open `http://YOUR-COMPUTER-LAN-IP:3001` on your phone on the same trusted network. Allow the port through your local firewall only for your private network. Do not forward the port on your router or expose it publicly: this single-user app has no authentication. Phone boards are saved in the phone's browser; use JSON backups to transfer them. Browser camera capture support varies; the upload picker works where direct camera capture is unavailable. Some mobile browsers restrict IndexedDB or secure APIs over plain LAN HTTP; use a trusted local HTTPS reverse proxy if needed.

## API

`POST /api/analyze-photo`: multipart form with one `image` file. Returns `{notes: [{text, color, x, y, width, height}]}` with normalized bounding boxes. Supported colors: yellow, pink, blue, green, purple, white. Image contents and returned bounds are validated. Uploads are limited to 10 MB and decoded images to 40 million pixels. Analysis times out after 45 seconds. Errors return `{error: string}` with 400 (invalid image), 403 (cross-origin), 413 (too large), 415 (unsupported type), 502 (provider/response failure), 503 (missing key), or 504 (timeout).

## Checks

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Endpoint tests mock the model and cover image validation, response validation, limits, missing credentials, provider failure, and timeout. Browser tests cover editing, history, autosave, board switching, backups, and reviewed/canceled/failed photo imports. A live model check additionally needs a real API key and a representative wall photo; mocked tests do not establish recognition quality.
