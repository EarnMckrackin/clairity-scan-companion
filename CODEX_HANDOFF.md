# clAIrity Codex Handoff

Use this package as the starting point for continuing the clAIrity design in Codex CLI.

## Project Goal

clAIrity is a friendly consumer app and browser extension that scans media, including videos, pictures, audio, and text, to identify whether it may have been created or altered by AI.

The product should feel welcoming and easy to use for a broad consumer audience, including kids and older adults. The main experience is scanning a webpage or social post, then showing a safety score with a plain-language explanation.

## Current Deliverable

This bundle contains a refreshable Open Design live artifact source set:

- `template.html` - live artifact preview template
- `data.json` - compact sample scan data and product copy
- `artifact.json` - live artifact metadata and refresh declaration
- `provenance.json` - source and transformation notes
- `assets/clarity.css` - shared visual system and screen styles
- `assets/clairity-logo.svg` - scan-lens logo mark with the AI letterform highlighted
- `screens/web-scan.html` - responsive standalone web app scan flow
- `screens/extension-popup.html` - browser extension popup result
- `screens/extension-page-scan.html` - right-click / page scan flow
- `screens/extension-overlay.html` - on-page warning overlay
- `references/*.png` - screenshots from the prior design pass, if included

The registered Open Design artifact ID from the previous run was:

`la-clairity-scan-companion-b07c5972f1c4`

## Design System

Visual direction: human, approachable, high-fidelity consumer utility.

Use:

- bright neutral surfaces
- calm teal primary action color
- soft blue trust/evidence accent
- a clAIrity lockup where the "AI" is visibly highlighted inside the wordmark
- rounded 14-18px modules
- large, plain-language labels
- gentle safety language such as "Use care" instead of accusatory verdicts

Avoid:

- scary security-dashboard language
- overly technical confidence charts as the primary UI
- generic AI-gradient backgrounds
- fake stats or unsupported performance claims

## Product Surfaces

Keep standalone app and browser extension designs separate.

The standalone app is currently represented by `screens/web-scan.html`.

The extension is represented by:

- `screens/extension-popup.html`
- `screens/extension-page-scan.html`
- `screens/extension-overlay.html`

Each distinct user-facing surface should remain its own HTML file. If adding more screens, use `screens/` and link from `template.html`.

## Suggested Codex CLI Prompt

```text
You are continuing the clAIrity design project from the files in this folder.

Goal: improve and extend the high-fidelity designs for clAIrity, a friendly consumer app and browser extension that scans pictures, videos, audio, and text to detect whether media may have been created or altered by AI.

Keep the existing live artifact structure:
- template.html
- data.json
- artifact.json
- provenance.json
- assets/clarity.css
- screens/*.html

Do not combine the standalone app and browser extension into one long page. Keep each user-facing surface as its own HTML file.

Preserve the approachable visual direction: bright neutral UI, calm teal primary actions, soft blue evidence accents, rounded modules, large readable labels, and plain-language safety explanations.

Preserve the logo system in `assets/clairity-logo.svg` and the `.word-ai` treatment in `assets/clarity.css`; the "AI" in clAIrity should stay visually prominent.

Next useful work:
1. Refine the responsive web app flow for uploading/pasting media and scanning a webpage or social post.
2. Expand result detail states for image, video, audio, and text scans.
3. Add a scan history screen and settings/privacy screen as separate HTML files.
4. Make extension interactions feel more product-real: popup actions, selected-page scanning, and on-page warning dismissal.
5. Keep data refreshable through data.json and provenance.json.

Before finishing, verify that all HTML files load, links are valid, and the UI works at mobile and desktop widths.
```

## Local Preview Notes

The source template uses Open Design live-artifact bindings such as `{{data.product.name}}`. In a plain browser, those bindings will not resolve unless rendered by the Open Design live artifact system. The screen files in `screens/` can be opened directly because they are normal HTML files using `assets/clarity.css`.
