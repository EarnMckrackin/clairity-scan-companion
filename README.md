# clAIrity

clAIrity is a first-pass evidence reporting tool for media authenticity review.
It does not try to declare a file "real" or "fake" from one model score. The
prototype builds a local report from file identity, byte-level provenance hints,
lightweight visual signals, reviewer notes, and recommended next steps.

## Run

Open `index.html` in a browser.

No install step is required.

## Browser Extension Prototype

The `extension/` folder contains a lightweight Chrome/Edge Manifest V3 prototype
called clAIrity Surf Guard.

To load it locally:

1. Open Chrome or Edge extensions.
2. Enable developer mode.
3. Load unpacked extension from `extension/`.

The extension scans visible images and videos on the current page and reads each
one's **Content Credentials (C2PA)** to badge it honestly — Verified origin, Made
with AI, Be careful (tampered), or Not confirmed — instead of guessing from
keywords. Provenance is read by the vendored WebAssembly SDK inside an MV3
offscreen document (`offscreen.html` / `offscreen.js`); the raw bytes stay in the
browser. The panel shows the verdict, any credential details, reverse-search
links, and a link to the full Verax app for a deeper (probabilistic) AI check.
It includes a simple-language mode for kids and grandparents.

> The C2PA SDK is vendored under `extension/vendor/` (required: MV3 forbids
> remote code). The offscreen + service-worker flow was de-risked by verifying
> the vendored SDK reads manifests from local files, but load it unpacked in
> Chrome and confirm end-to-end before publishing.

## Current Capabilities

- **Content Credentials (C2PA) verification** — reads the cryptographically
  signed provenance manifest embedded in a file's bytes, entirely in the browser
  via WebAssembly (raw files are never uploaded). This is the one reliable signal
  and it drives an honest three-state verdict:
  - **Verified origin** — credentials present, intact, not AI-flagged
  - **Made or edited with AI** — credentials disclose AI generation/editing
  - **Credentials do not match** — manifest present but bytes were altered
  - **Could not confirm origin** — no credentials found (the common, honest default)
- Local image/video intake
- Image and video preview
- SHA-256 file hash
- File size, MIME type, modified date, and filename capture
- Byte scan for common provenance or generator markers
- Lightweight image texture sampling
- Reviewer source and note fields
- Explicit module cards for:
  - C2PA / Content Credentials checks
  - OpenAI, Google, and known watermark checks
  - EXIF and file-history inspection
  - image-forensics signals
  - video-specific checks
  - reverse image/video source tracing
  - confidence with `unknown`
  - privacy-first local scan mode
  - exportable evidence reports
- JSON export
- Print/PDF export through the browser print dialog

## Optional: AI detector (second opinion)

When a file has **no** Content Credentials (the common case), the app can offer a
probabilistic AI/deepfake estimate from a third-party detector. This is a
*second opinion, not proof*, and it requires sending the file to the provider —
so it is gated behind an explicit per-file opt-in button and is never run
automatically.

It is **off unless configured.** The API key lives only on the server, and the
provider is chosen with `DETECTOR_PROVIDER` (default `sightengine`). With no keys
set, the endpoint reports `configured: false`, the opt-in button stays hidden,
and the app behaves exactly as the credentials-only build.

| Provider (`DETECTOR_PROVIDER`) | Media | Env vars |
| --- | --- | --- |
| `sightengine` (default) | image, video | `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET` |
| `hive` | image, video | `HIVE_API_KEY` |
| `realitydefender` | image, video, **audio** | `REALITY_DEFENDER_API_KEY` |

For audio (voice-clone / fake-voice) detection, use `realitydefender`.

> The `hive` and `realitydefender` adapters are written to each vendor's
> documented API but have **not been verified against live keys** — confirm the
> request/response field names against your account before relying on them. The
> adapter layer (`api/detect.js`) makes adding or fixing a provider isolated.

## Boundaries

This prototype verifies Content Credentials (C2PA) where they exist, but it is
not a general forensic detector. Most media online carries no credentials; for
those files the result is **"unconfirmed," not "real."** Pixel texture, filename,
and page-context signals are shown only as background context — never as an AI
verdict.

## Next Modules

- EXIF / generator-tag extraction for files without C2PA
- SynthID and other vendor watermark detection
- OpenAI Verify / SynthID / vendor watermark integrations where available
- Video frame sampling and audio/visual sync checks
- Exportable PDF or JSON evidence packet
- Configurable detector API providers such as Hive, Sightengine, or Reality Defender
- Safer kid/grandparent mode for the extension, with plain-language warnings and fewer technical details
