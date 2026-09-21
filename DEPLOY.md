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
- There are no server-side routes and no environment variables to configure.
- The build fetches Poly Haven textures and the HDRI at runtime from
  `dl.polyhaven.org` (CORS-open). If the host adds a restrictive Content-Security-Policy,
  allow that origin — or leave it blocked and the §1.1 fallback takes over.

## Local vision environment generation

Personalise Home now calls the local vision adapter when Generate is clicked.
`VITE_AGENT_BASE_URL` and `VITE_AGENT_MODEL` are optional build-time settings;
the endpoint defaults to http://127.0.0.1:8080. The user must run a vision-capable
llama-server with its matching projector on their own computer and permit browser
CORS/local-network access. No model server or model weights ship in dist/.
Hosted HTTPS deployments may require a browser-compatible HTTPS loopback endpoint.
There are no API keys in the client; remote inference endpoints are rejected.
Saved environment styles render offline without contacting the model.
