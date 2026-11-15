# avcon Technologies website

Static marketing site for avcon Technologies, an ecocentric environmental data collection company.
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
  index.html            Single page: hero, context, station, catalog, uses, process, ethos, CTA
  404.html              Not found page
  assets/css/styles.css Design tokens (dark and light), layout, components
  assets/js/main.js     Theme toggle, nav state, station explorer, carousel, field log, sample form
  assets/js/field.js    Hero animation: live contour map (marching squares on simplex noise)
  favicon.svg, *.png    Icons and the 1200x630 social share image
  robots.txt, sitemap.xml, site.webmanifest
```

## Request sample form

The "Request sample" buttons open a dialog that asks for name, work email, company, data of interest and a
short note. It validates in the browser and has a hidden honeypot field for spam.

Where submissions go is set on the `<form>` in `index.html`:

- `data-endpoint=""` (default): the visitor's email app opens with the request filled in, addressed to `data-mailto`.
- `data-endpoint="https://formspree.io/f/yourid"` (or any service that accepts a JSON POST): the request is sent
  in the background and the visitor sees a confirmation.

Link straight to the form with `/#request-sample`.

## Before going live

Replace these placeholders:

- Domain `avcontechnologies.com` in `index.html` (canonical, Open Graph, JSON-LD), `robots.txt` and `sitemap.xml`.
- Contact email `hello@avcontechnologies.com` in `index.html` (footer, form `data-mailto`, JSON-LD).
- Figures in the Context section and the sensor specs in `assets/js/main.js` if they differ from the real hardware.

## Deploy

Any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Point it at the `website/` folder.

## Notes

- Respects `prefers-reduced-motion`: the hero renders a still frame and other motion is switched off.
- The hero animation pauses when off screen or when the tab is hidden.
- Theme defaults to dark, the toggle choice is saved in `localStorage`.
