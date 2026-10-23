# Hollow House: Seven Nights — Remaining Work Checklist

Last reviewed: 2026-10-23

Keep the existing repository and project names. **Do not rename or delete** `arorasaatvik2510-cloud/Hollow-house-1`.

- GitHub repository: https://github.com/arorasaatvik2510-cloud/Hollow-house-1
- Existing AppDeploy project: `the-hollow-house-seven-nights-m6nqi0`
- Current live beta: https://the-hollow-house-seven-nights-m6nqi0.v2.appdeploy.ai/

## Current verified state

- [x] Existing AppDeploy game is deployed and marked `ready`.
- [x] AppDeploy source snapshot contains a Vite/React-style project: `index.html`, `package.json`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `vite.config.ts`, `tests/tests.json`, and `capacitor.config.ts`.
- [x] AppDeploy source snapshot includes Android beta and iOS simulator GitHub Actions workflow files.
- [ ] GitHub `main` does **not** contain the game source yet. Its current tree contains only `.gitignore`, `LICENSE`, and `README.md`; there is no `src/`, `index.html`, `package.json`, tests, or workflow directory in this repository.
- [ ] AppDeploy resource/QA checks still report failed image loads for `/resources/hollow-house-logo.png` and `/resources/hollow-house-ui-ux-concept.png`. The required resource list also includes `hollow-house-sub-logo.png`; verify that it loads in the live build rather than relying only on its listed path.
- [ ] The latest AppDeploy QA snapshot reported no frontend/network errors, but historical/current resource warnings still need to be cleared by re-uploading/binding and re-testing the actual image paths.

## P0 — Repair the resource layer without changing approved artwork

- [ ] Upload/validate the approved main logo to `public/resources/hollow-house-logo.png`.
- [ ] Upload/validate the UI/UX concept collage to `public/resources/hollow-house-ui-ux-concept.png`.
- [ ] Upload/validate the approved sub-logo to `public/resources/hollow-house-sub-logo.png`.
- [ ] Bind the completed uploads to this Hollow House AppDeploy project, not FernAlibi or Pocket.
- [ ] Confirm all three public image URLs return successfully in the live app and the browser console has no failed resource requests.
- [ ] Preserve the existing artwork and the existing opening-page design; optimize only loading behavior and file delivery unless a design change is explicitly approved.

## P0 — Sync the actual game into the existing GitHub repository

- [ ] Export/copy the exact, current AppDeploy source snapshot into `Hollow-house-1`, keeping its existing repository identity and `main` branch.
- [ ] Include the source, build configuration, tests, Capacitor configuration, and the intended Android/iOS workflow files.
- [ ] Include required artwork assets under `public/resources/` or document the secure repeatable resource-upload process if binary assets must remain in AppDeploy.
- [ ] Review the source diff before committing; do not replace the live deployment with an untested or partial copy.
- [ ] Expand this README with run/build/test commands and link to this checklist once the source has been synced.

## P1 — Repeatable build and deployment workflow

- [ ] Add a GitHub Actions workflow that installs dependencies reproducibly, runs the available tests, builds the web game, and uploads a build artifact.
- [ ] Define how a tested GitHub commit reaches the existing AppDeploy project. Do not create a second deployment or point users to Netlify; AppDeploy remains the intended web deployment partner.
- [ ] Keep deployment credentials in repository/environment secrets if the chosen AppDeploy deployment mechanism needs them; never commit tokens.
- [ ] Make mobile build workflows explicit: Android build/signing and iOS simulator/device signing/provisioning need separate verification. Do not claim store-ready packages just because a workflow file exists.

## P1 — Game QA and performance

- [ ] Test the opening/title screen on desktop and mobile and record its first-visible-content time; keep its artwork unchanged.
- [ ] Test navigation through all implemented nights/chapters, clue discovery, decisions, endings, restart behavior, and any unlock progression that exists in the current game.
- [ ] Test save/progress persistence after refresh and browser restart; confirm reset/new-game behavior is intentional.
- [ ] Run a clean-browser test and a returning-player test.
- [ ] Verify no broken images, JavaScript errors, missing network assets, overflow, inaccessible controls, or unusable mobile navigation.
- [ ] Test low-bandwidth/slow-load conditions and defer noncritical artwork where possible without delaying the opening screen.
- [ ] Capture new desktop/mobile QA screenshots only after the fixes, and attach them to the project documentation.

## Definition of done

- [ ] The existing `Hollow-house-1` GitHub repository contains the actual source and repeatable instructions.
- [ ] The three required resources load in the live AppDeploy game with no missing-asset warnings.
- [ ] GitHub Actions passes build/test checks and produces the expected artifact.
- [ ] Chapter/night progression and saved progress pass desktop and mobile tests.
- [ ] The tested commit/deployment relationship is documented; the existing live app remains the source of truth until the repository sync is verified.
