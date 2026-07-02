# Workley - separated file structure

```
ispani_site/
├── index.html         Landing page (hero, flow, categories, Smart Match teaser, featured talent, trust, CTA, footer)
├── catalog.html       Find talent - full browsable talent catalog with filters
├── smart-match.html   Smart Match wizard (dedicated page)
├── profile.html       User profile page
├── css/
│   └── styles.css     All styles for every page
├── js/
│   └── app.js         All behaviour: auth, 2FA, Smart Match, catalog, profile, modals, toasts
└── README.md
```

## How it fits together
- Every page links the **same** `css/styles.css` and `js/app.js`, and shares the header, mobile menu, auth slider, modal, and toast layer.
- Navigation between pages now uses real links (`href="catalog.html"`, etc.) instead of the old in-page overlay toggles.
- `app.js` is null-guarded and self-bootstraps per page (it detects which page it's on via element IDs and renders accordingly).

## Run it
Because pages load `js/app.js` as an external file, open it through a local web server (not file://) so the browser allows the script:

```bash
cd ispani_site
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Important note on state
There is still **no backend**, so the logged-in session lives in memory and **resets when you navigate to another page** (each page is a fresh load). Carrying the session across pages requires real auth + storage on a server - see the security/POPIA spec from earlier. The structure here is exactly what you'd wire that backend into.
