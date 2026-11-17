# avcon Technologies website

Static marketing site for avcon Technologies, which collects and annotates egocentric (first person) data of skilled
human work, from drone repair to manufacturing to custom tasks, to train robots and physical AI.
No framework and no build step: plain HTML, CSS and ES modules.

## Run locally

```bash
cd website
python3 -m http.server 8000
# open http://localhost:8000
```

ES modules need to be served over HTTP, so opening `index.html` straight from disk will not run the scripts.

## Structure

```
website/
  index.html            Single page: hero, context, rig, domains, annotation, streams, uses, process, trust, CTA
  404.html              Not found page
  assets/css/styles.css Design tokens (dark and light), layout, components
  assets/js/main.js     Theme toggle, nav, rig explorer, annotation tabs, carousel, capture log, form
  assets/js/hands.js    Hero animation: tracked hand skeletons repairing a drone, with live labels
  favicon.svg, *.png    Icons and the 1200x630 social share image
  robots.txt, sitemap.xml, site.webmanifest
```

## Request sample form

The "Request sample" buttons open a dialog that asks for name, work email, company, domains needed and a
short note on the task. It validates in the browser and has a hidden honeypot field for spam.

Submissions are emailed to **outreach.pra@gmail.com** through [FormSubmit](https://formsubmit.co), a free
form-to-email service that needs no account or server. Each request arrives as a table with the visitor's name,
email, company, domains, task and the page they sent it from. Hitting Reply answers the visitor.

**One time activation:** the very first submission does not get delivered. FormSubmit instead sends an
"Activate Form" email to outreach.pra@gmail.com. Click it once, from the live domain, and every request after that
is delivered. Check spam if it does not show up.

Optional: after activating, FormSubmit emails you a random alias. Put it in place of the address in
`data-endpoint` (`https://formsubmit.co/ajax/<alias>`) so the inbox address is not visible in the page source.

Settings live on the `<form>` in `index.html`:

- `data-endpoint`: where the form posts. Clear it to fall back to opening the visitor's email app instead.
- `data-mailto`: address used for that fallback and shown in the error message if sending fails.

Link straight to the form with `/#request-sample`.

## Before going live

Replace these placeholders:

- Domain `avcontechnologies.com` in `index.html` (canonical, Open Graph, JSON-LD), `robots.txt` and `sitemap.xml`.
- Footer and JSON-LD use outreach.pra@gmail.com as the contact address; swap in a company address when you have one.
- Rig specs (in `assets/js/main.js`), stream rates, the κ ≥ 0.90 target and the numbers in the Context section,
  if they differ from your real hardware and process.
- Figures in the Context section and the sensor specs in `assets/js/main.js` if they differ from the real hardware.

## Deploy

Any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Point it at the `website/` folder.

## Notes

- Respects `prefers-reduced-motion`: the hero renders a still frame and other motion is switched off.
- The hero animation pauses when off screen or when the tab is hidden.
- Theme defaults to dark, the toggle choice is saved in `localStorage`.

## 3D capture rig

The Capture rig section renders a 3D scene with three.js (loaded from jsDelivr through the import map in
`index.html`) when the section scrolls near. The figure is the rigged "X Bot" character from Mixamo, as
shipped in the three.js examples, stored at `assets/models/xbot.glb` with only its idle animation kept and the mesh
quantized to keep it small (about 1.2 MB). Arms, head and spine are posed every frame in `assets/js/rig3d.js`.
If WebGL or the CDN is unavailable, the SVG drawing in the same figure is shown instead.
