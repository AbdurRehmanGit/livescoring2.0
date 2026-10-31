# Livescoring

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://livescoring.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/887d994b-1b44-4edc-8f91-f4c33becf725).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Supabase persistence

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the
browser, and `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for server rendering.
The Supabase schema and row-level security policies must be applied before
running the app.

Team rosters are loaded from and saved to Supabase. Starting a match creates a
match row; scoring changes and undo update the match summary and innings totals
and synchronize delivery rows. Completed match history is loaded from
`matches.summary` and replayed to render the batting and bowling scorecards.
The active match can be resumed from Supabase after a page reload.

This project currently uses public anonymous RLS policies. Anyone with the
application can read, insert, update, and delete shared scoring data. Do not use
that policy for private or production-sensitive match data without restricting
access.
