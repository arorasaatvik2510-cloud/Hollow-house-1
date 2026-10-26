# Capacitor developer beta setup

This project uses Vite for its web build and Capacitor 8 to wrap the same game for Android and iOS.

## Local setup

1. Install Node.js 22 or newer, Android Studio with its SDK for Android builds, and Xcode on macOS for iOS builds.
2. Run `npm install`.
3. Run `npm run build`.
4. Generate the native projects once: `npx cap add android` and `npx cap add ios` (iOS requires macOS).
5. Sync game files with `npx cap sync`.
6. Open the native project with `npm run cap:android` or `npm run cap:ios`.

## CI workflows

The included GitHub Actions workflows can build an unsigned Android debug APK and an unsigned iOS Simulator app. They run only after these files are committed to a GitHub repository and a workflow is launched there. Android store signing and iOS device/App Store distribution require signing credentials and provisioning that are not configured here.

## Logo

The home screen is wired to `public/resources/hollow-house-logo.png`. The image must be uploaded through the AppDeploy Resources picker before it appears in the deployed web app and in a native bundle. No logo upload is claimed until the resource path is confirmed by AppDeploy.
