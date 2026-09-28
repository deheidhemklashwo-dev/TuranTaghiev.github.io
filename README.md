# Turan Taghiev

`TURAN.TAGHIEV`

Turan Taghiev writes on trust & safety, platform governance, and AI governance, drawing on direct moderation and technical-support experience across multiple language communities.

**Live site:** https://deheidhemklashwo-dev.github.io/TuranTaghiev.github.io/

## What this repo is

Source code for a personal portfolio and writing site. It's a single static page (`index.html` + `style.css`), no build step, published via GitHub Pages.

## Feed and sitemap

`feed.xml` and `sitemap.xml` are generated from the `ANALYSES` array in `index.html`:

```
node tools/build-feeds.js          # rewrite both files
node tools/build-feeds.js --check  # exit 1 if they are out of date
```

Only live entries are included (not draft, not archived, `publishAt` reached). The `Feed & sitemap check` workflow runs the check on every PR and once a day, so a scheduled entry going live shows up as a failed run until the files are regenerated. The workflow never commits.
