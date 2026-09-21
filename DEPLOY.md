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

## The agent layer ships fully inert (SPEC.md §10)

Checkpoint F (`src/agent/`) is in this repository but is not reachable from the deployed
app. `agent.enabled` defaults to `false` (`src/agent/config.ts`), and nothing under
`src/agent/` is imported from `main.ts` or anything else on the boot path — `npm run
build`'s module count is unchanged by its presence (still 20 modules transformed as of
this checkpoint; `grep -rl "from '\./agent" src/main.ts src/ui.ts` finds nothing). There
is no environment variable to set for a production deploy: `VITE_AGENT_BASE_URL` /
`VITE_AGENT_MODEL` (`.env.example`) are read only by `src/agent/llamaCpp.ts`, which
nothing calls yet. Do not set them on a hosting provider for this deployment — there is
no code path that would read them.

There is also no secret to leak. Inference is local (SPEC.md §10.6): the agent talks to a
`llama-server` on loopback, so there is no API key anywhere in this repository, nothing to
configure on a host, and — since the adapter refuses a non-loopback `baseUrl` — no way for
a deployed build to reach an inference endpoint even if one were configured.
