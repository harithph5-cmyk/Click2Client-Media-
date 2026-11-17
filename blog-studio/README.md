# Click2Client Blog Studio

Separate publishing portal for click2clientmedia.com. It never touches the site's design; it publishes through a token-secured REST API (`server/blog-api.js`, mounted at `/api/blog-api`).

## Run
1. `cp blog-studio/.env.example blog-studio/.env` and fill it in (at least `STUDIO_PASSWORD`).
2. `npm run studio` → http://localhost:4300 (Node 22.13+; storage is a local SQLite file in `blog-studio/data/`).

## Connect to the website (one time)
1. Generate a token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set it as `BLOG_API_TOKEN` on the website (Hostinger env) **and** in `blog-studio/.env`; deploy the site.
3. Settings → "Test website connection".

Until then Publish fails with an explanation and publishes nothing; use Export (HTML / Markdown / JSON).

## How it maps to the existing site
Posts live in the site's `settings` table (`blog`), rendered server-side at `/blog/<slug>`; `/sitemap.xml` is generated from the same store, so publishing updates the sitemap automatically. Scheduled posts go live on their own once their time passes (checked per request, no cron).

## Checks
`node blog-studio/analyze.js` · `node server/blog.js`
