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
