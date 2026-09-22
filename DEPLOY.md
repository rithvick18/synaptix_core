# Deployment — INCOMPLETE

`dist/` builds clean and `npm run preview` serves it correctly, but this environment has no
Vercel or Netlify credentials and no interactive login, so the deploy could not be completed.

Both providers need a one-time browser login. Run **one** of the following from the project
root.

## Vercel

```bash
npm i -g vercel
vercel login          # opens a browser
vercel --prod         # accept the defaults; framework is detected as Vite
```

Answer the prompts with: link to a new project, root directory `./`, build command
`npm run build`, output directory `dist`. The production URL is printed at the end.

## Netlify

```bash
npm i -g netlify-cli
netlify login         # opens a browser
npm run build
netlify deploy --prod --dir=dist
```

## Notes

- `vite.config.ts` sets `base: './'`, so the build works from a subpath as well as a root
  domain — no change is needed for either host.
- There are no server-side routes. Environment variables are optional: `.env.example`
  lists build-time defaults for both setup modes, and none of them is required — the
  setup screen collects what online mode needs, in the browser.
- The build fetches Poly Haven textures and the HDRI at runtime from
  `dl.polyhaven.org` (CORS-open). If the host adds a restrictive Content-Security-Policy,
  allow that origin — or leave it blocked and the §1.1 fallback takes over.

## Vision environment generation — offline and online

On first load the app asks where the model that reads room photographs should run. Both
modes are inert until **Generate** is clicked in Personalise Home, and a saved
environment style renders with no model at all, so a deployment that never generates
needs nothing from this section.

**Offline mode** calls a `llama-server` the user runs themselves. `VITE_AGENT_BASE_URL`
and `VITE_AGENT_MODEL` are optional build-time settings; the endpoint defaults to
`http://127.0.0.1:8080` and any non-loopback address is refused before a socket opens. No
model server or model weights ship in `dist/`. The user must run a vision-capable
llama-server with its matching projector and permit browser CORS/local-network access; a
hosted HTTPS deployment may need a browser-compatible HTTPS loopback endpoint for this to
work at all.

**Online mode** calls Google's `gemini-3.5-flash-lite` at
`https://generativelanguage.googleapis.com`, which is the only host the adapter will talk
to. The API key is entered on the setup screen and kept in the visitor's own browser —
**do not** set `VITE_GEMINI_API_KEY` for a hosted build, because Vite inlines every
`VITE_` variable into the shipped bundle, where it is readable by anyone who loads the
page. If the host sets a restrictive Content-Security-Policy, allow
`generativelanguage.googleapis.com` in `connect-src`, or online mode will fail with an
unreachable-server message and offline mode will still work.
