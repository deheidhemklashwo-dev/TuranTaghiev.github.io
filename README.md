# Turan Taghiev

`TURAN.TAGHIEV`

Turan Taghiev writes on trust & safety, platform governance, and AI governance, drawing on direct moderation and technical-support experience across multiple language communities.

**Live site:** https://deheidhemklashwo-dev.github.io/TuranTaghiev.github.io/

## What this repo is

Source code for a personal portfolio and writing site. It's a single static page (`index.html` + `style.css`), no build step, published via GitHub Pages.

## Feed and sitemap

`feed.xml` and `sitemap.xml` are generated from the `ANALYSES` array in `index.html` by `tools/build-feeds.js`. Only live entries are included (not draft, not archived, `publishAt` reached). Nothing needs to run locally:

- **Feed & sitemap update** runs daily at 00:15 UTC. If the files change (for example a scheduled entry's day has come), it pushes them to `bot/update-feeds` and opens a PR against `main`. Merging that PR is the only manual step. It never commits to `main`.
- **Feed & sitemap check** runs only on PRs that touch `feed.xml`, `sitemap.xml` or `tools/build-feeds.js`, and fails only when those files don't match `ANALYSES` (for example a hand edit). Entry PRs that only change `index.html` don't run it; the daily update picks them up. A scheduled entry whose day has come but isn't in the feed yet is not a failure.

Both can also be run by hand from the Actions tab (the update job takes an optional date).
