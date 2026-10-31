# The Hollow House: Seven Nights — AppDeploy source sync

**Branch:** `codex/appdeploy-source-sync-20261031`  
**Live source of truth:** the existing Hollow House AppDeploy project until this branch is reviewed and merged.

## Source staged

- `src/App.tsx` — current deployed game application
- `src/index.css` — current deployed stylesheet
- `index.html` — current deployed page shell and metadata
- `tests/tests.json` — current AppDeploy test definition
- `.github/workflows/android-beta.yml` and `.github/workflows/ios-simulator-beta.yml` — current AppDeploy workflow definitions
- `backend/index.ts`, `robots.txt`, and `sitemap.xml` — current AppDeploy support files

Existing package, TypeScript, Vite, PostCSS, Tailwind and Capacitor configuration files were already aligned and were left unchanged.

## Artwork state

`public/resources/README.md` records the approved resource filenames: `hollow-house-logo.png`, `hollow-house-sub-logo.png`, and `hollow-house-ui-ux-concept.png`. Those binary assets remain managed by AppDeploy and have not been copied into this branch.

## Integration status

- Changes are staged on this branch only.
- Nothing has been merged to `main`.
- No AppDeploy deployment was started.
- GitHub Actions had no branch workflow runs at the time of the check.
- Before merging, export or upload the approved binary assets, run the web build and test suite, and verify the chapter progression and save/restore flows.
