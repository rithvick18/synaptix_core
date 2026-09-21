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
app. `agent.enabled` defaults to `false` (`src/agent/config.ts`), and a caregiver has to
turn it on in their own browser before any of it loads.

That inertness is structural, not just conditional. `main.ts` statically imports exactly
one module from `src/agent/` — `enabled.ts`, which reads the flag out of `localStorage`
and imports nothing itself. Everything else sits behind a dynamic `import()` that only
runs after the flag reads true, so Vite emits it as separate chunks the browser never
requests in a default deploy:

```
dist/assets/index-*.js            the app — contains no part of the agent layer
dist/assets/caregiverSetup-*.js   the setup screen, firewall, grammar, llama.cpp adapter
dist/assets/config-*.js           agent config
dist/assets/provider-*.js         the hosted SDK — only if a hosted call is ever made
```

Verify it directly on a fresh build rather than trusting the split:

```bash
npm run build
cd dist/assets
for s in propose_photo_placement llama-server firewall request_caregiver_input anthropic; do
  grep -qi -- "$s" index-*.js && echo "LEAKED: $s" || echo "absent: $s"
done
```

All five must report `absent`. The only agent-related string in the entry chunk is the
`localStorage` key `smriti-agent-config-v1`, which is `enabled.ts` doing its job.

There is no environment variable to set for a production deploy. `VITE_AGENT_API_KEY` /
`VITE_AGENT_MODEL` and the `VITE_AGENT_LLAMACPP_*` settings (`.env.example`) are read
only by the provider adapters, which nothing on the deployed path calls. Do not set them
on a hosting provider for this deployment — there is no code path that would read them,
and no reason to hold a key there.

The local provider (`provider: 'llamacpp'`) is a *local development and caregiver-machine*
option, not a hosted one: it expects a `llama-server` on loopback. A deployed build has no
such server and is not configured to look for one.
