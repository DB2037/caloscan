# CaloScan — AI Meal Calorie Tracker (PWA)

Snap a meal → **Claude vision** estimates calories & macros → you fine‑tune every
portion → log it or save it to your **Meal Bank** for one‑tap reuse. 100% client‑side,
installable on your phone, works offline for the UI.

## Features
- 📷 Photo → calories via Anthropic Claude vision (no server needed).
- 🎚️ Editable per‑item grams with live kcal/macro recalculation (this is what makes it *accurate* — you correct the portions).
- 🍱 **Meal Bank**: save repeat meals with calories pre‑calculated; tap “Log” to add instantly.
- 📅 **Diary**: daily totals, macro breakdown, and progress vs your calorie goal.
- 🌗 Minimalist design, light/dark, metric/imperial.
- 📲 Installable PWA — adds to your home screen and runs like a native app.

## 1. Get an Anthropic API key
1. Sign up / log in at https://console.anthropic.com/
2. Create a key under **API Keys**.
3. Open CaloScan → ⚙️ Settings → paste the key. It is stored **only on your device** (localStorage) and sent directly from your browser to Anthropic.

> The key lives in your browser, not in any server. For a shared/team deployment, point
> “API endpoint” at your own proxy instead.

## 2. Install on your phone
A PWA must be served over **HTTPS** (or `localhost`) for camera + “Add to Home Screen” to work.
Pick any static host (all free, all give HTTPS):

**Easiest — Netlify Drop**
1. Go to https://app.netlify.com/drop
2. Drag the `meal-calories` folder in.
3. Open the given `https://…netlify.app` URL on your phone → browser menu → **Add to Home Screen**.

**Vercel / Cloudflare Pages / GitHub Pages** — deploy the folder as a static site.
For GitHub Pages add an empty `.nojekyll` file so `icons/` and `sw.js` aren’t ignored.

**iOS (Safari):** open the HTTPS URL → Share → **Add to Home Screen**.
**Android (Chrome):** open it → menu → **Install app** / “Add to Home Screen”.

## 3. Local development (desktop)
```bash
cd meal-calories
python3 -m http.server 8000
# open http://localhost:8000  (localhost is a secure context, camera works)
```

## Accuracy tips
No AI can weigh your plate from a photo. CaloScan is most accurate when you:
- shoot in good light,
- include a fork/coin for scale,
- nudge the gram sliders to match what you actually ate.

Meals saved in your **Meal Bank** are exact by definition (you logged the real numbers once).

## Files
- `index.html` / `style.css` / `app.js` — the app (vanilla JS, no build step)
- `manifest.json` / `sw.js` / `icons/` — PWA install + offline shell
