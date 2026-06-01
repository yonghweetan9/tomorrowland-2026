# Deploy & Update Guide

Quick reference for getting changes live. The app is hosted on **Vercel**,
connected to a **GitHub** repo. Pushing to GitHub auto-deploys to Vercel.

Your live link never changes when you update — anything you've shared keeps working.

---

## Making a change (the normal flow)

1. Tell Claude what you want changed — Claude edits the files in this folder.
2. Open Command Prompt in this folder. Easiest way: open this folder in File
   Explorer, click the address bar, type `cmd`, press Enter. Or paste:

   ```
   cd /d "C:\Users\yongh\OneDrive\Documents\Claude\Projects\Tomorrowland 2026"
   ```

3. Push the update — paste these one at a time (you can edit the message in quotes):

   ```
   git add -A
   ```
   ```
   git commit -m "Update app"
   ```
   ```
   git push
   ```

That's it. Vercel rebuilds and redeploys automatically, usually live within a minute.
No re-importing, no re-adding environment variables, no new link.

### Optional: preview before pushing
To see a change locally before it goes live:

```
npm run dev
```

Open the `http://localhost:5173` link it prints. Press `Ctrl + C` to stop.

### Special cases (Claude will tell you when these apply)
- **New dependency added** → run `npm install` once before the commit.
- **Database change** → Claude gives you SQL to paste into Supabase's
  SQL Editor (same as the original `schema.sql` setup).

---

## Refreshing the lineup later (e.g. when set times are published)

In Command Prompt, in this folder:

```
npm run scrape
```
```
npm run seed
```

`scrape` re-pulls the official Tomorrowland lineup; `seed` upserts it into the
database (no duplicates). New/updated set times then appear in the app and snap
into the Itinerary calendar. Then push the refreshed `lineup_seed.json` so the
bundled fallback stays current:

```
git add -A
git commit -m "Refresh lineup"
git push
```

---

## Inviting friends

Share your Vercel link (e.g. `https://tomorrowland-2026.vercel.app`). Each person
opens it, enters a name once, gets a colour, and joins the same shared world.
The 🔗 button on the Lineup tab copies the link.

---

## Accounts & keys reference

- **GitHub repo:** stores the code. Push to it to deploy.
- **Vercel:** hosts the site. Auto-deploys on every push.
- **Supabase:** the database (project `nwjjwslfgheaibycrdgq`). Already set up.
- **Environment variables** live in two places: your local `.env` file (which is
  NOT uploaded — it's git-ignored) and Vercel's project settings. The
  `SUPABASE_SERVICE_ROLE_KEY` secret is **local only** — never put it on Vercel.
  - On Vercel you need: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
    `VITE_EXCHANGERATE_API_KEY`.
