# Vyapar Desk — Android build

## 1. What this project is

**Vyapar Desk is a plain web app**, not React/Vue/Flutter/React Native. Specifically:

| Part | What's used |
|---|---|
| UI | Hand-written HTML + CSS (custom design tokens, no framework, no Tailwind, no build step) |
| Logic | Vanilla ES2017 JavaScript in one classic `<script>` — no modules, no bundler, no transpiler |
| Data | `localStorage` (JSON), plus an optional shared-storage sync layer that is skipped automatically when it isn't available |
| PDF | jsPDF (UMD build) |
| Fonts | IBM Plex Sans via Google Fonts, with a system-font fallback stack |
| Backend | None. Everything runs in the browser. |

It is a single self-contained `index.html` (~190 KB). That is the ideal shape for **Capacitor**: the whole app becomes the WebView payload with nothing to compile.

**Nothing in the app's features or UI was changed.** Three build-only edits were made to `www/index.html`:

1. jsPDF now loads from `vendor/jspdf.umd.min.js` first and falls back to the CDN if that file is missing — so PDFs work offline inside the APK.
2. A local `vendor/fonts.css` is loaded before the Google Fonts link, same fallback idea.
3. `android-bridge.js` is loaded last. In a browser it exits immediately; in the APK it makes downloads, WhatsApp links and the hardware Back button behave natively.

---

## 2. Project layout

```
vyapar-desk-android/
├─ package.json                  Capacitor + plugin dependencies and build scripts
├─ capacitor.config.json         appId com.vyapardesk.distributor, appName "Vyapar Desk"
├─ keystore.properties.example   template for your signing credentials
├─ www/
│  ├─ index.html                 the app (unchanged features and UI)
│  ├─ android-bridge.js          native behaviour, no-op in a browser
│  └─ vendor/fonts.css           offline font declarations
├─ scripts/
│  ├─ fetch-vendor.js            copies jsPDF into www/vendor after npm install
│  ├─ apply-android-config.js    applies the config below onto the generated android/ project
│  └─ make-icons.py              regenerates the launcher icons
└─ android-config/               files copied into android/ by the script above
   └─ app/src/main/
      ├─ AndroidManifest.xml     app label, FileProvider, permissions, Android 11 <queries>
      └─ res/
         ├─ values/strings.xml   app_name "Vyapar Desk"
         ├─ values/colors.xml    brand colours for the icon and splash
         ├─ xml/file_paths.xml   FileProvider paths for sharing invoice PDFs
         └─ mipmap-*/            launcher icons, all densities + adaptive icon
```

`android/` is **not** checked in — it is generated in step 4 and then configured automatically.

---

## 3. Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20 or 22 LTS |
| JDK | **21** (Capacitor 7 requires it; `java -version` must show 21) |
| Android Studio | Ladybug or newer, with **Android SDK Platform 35** and **Build-Tools 35** installed |
| Env vars | `ANDROID_HOME` / `ANDROID_SDK_ROOT` pointing at the SDK, `JAVA_HOME` at JDK 21 |

Capacitor 7 targets `compileSdk`/`targetSdk` 35 and `minSdk` 23 (Android 6.0 and up) — that covers essentially every phone and tablet a distributor's staff will be using.

---

## 4. Build steps, exactly

Run these from the `vyapar-desk-android/` folder.

```bash
# 1. install dependencies
npm install

# 2. put jsPDF inside the app so PDFs work with no internet
npm run vendor

# 3. create the native Android project and apply the Vyapar Desk configuration
npx cap add android
node scripts/apply-android-config.js

# 4. copy www/ and the plugins into the native project
npx cap sync android
```

### Test it first (no signing needed)

```bash
cd android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Create your signing key (once — keep it forever)

Losing this file means you can never update the app on the same install or on Play.

```bash
keytool -genkey -v \
  -keystore vyapar-desk-release.jks \
  -alias vyapardesk \
  -keyalg RSA -keysize 2048 -validity 10000
```

Answer the prompts (name, organisation, city, state, two-letter country code `IN`). Move the `.jks` file into the `android/` folder, then create `android/keystore.properties`:

```properties
storeFile=../vyapar-desk-release.jks
storePassword=your-store-password
keyAlias=vyapardesk
keyPassword=your-key-password
```

(`keystore.properties.example` in the project root is this same template. `.gitignore` already excludes both the keystore and this file.)

### Build the signed APK

```bash
cd android
./gradlew assembleRelease
```

**Output:** `android/app/build/outputs/apk/release/app-release.apk` — signed, ready to install directly or send to staff over WhatsApp/Drive.

Verify the signature:

```bash
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

### For the Play Store instead

```bash
./gradlew bundleRelease
# output: android/app/build/outputs/bundle/release/app-release.aab
```

Upload the `.aab` in the Play Console. Since Play re-signs with its own key, also enrol in Play App Signing and keep your `.jks` for upload signing.

### Or use Android Studio

`npx cap open android`, wait for Gradle sync, then **Build → Generate Signed App Bundle / APK → APK → release**, pointing at the same `.jks`.

---

## 5. After any change to the app

```bash
npx cap sync android          # re-copies www/ into the native project
cd android && ./gradlew assembleRelease
```

Bump `versionCode` (integer, must increase) and `versionName` in `android/app/build.gradle` before each release — or edit the constants at the top of `scripts/apply-android-config.js` and re-run it.

---

## 6. What the native bridge adds (and why it was needed)

| Behaviour in the browser | Behaviour in the APK |
|---|---|
| `<a download>` for PDF/CSV/backup — silently fails in a WebView | Written to **Documents/** with the Filesystem plugin, then the Android share sheet opens so it can go straight to WhatsApp, Drive or email |
| `window.open('https://wa.me/…')` — blocked or opens a blank WebView | Real `ACTION_VIEW` intent, so WhatsApp opens directly with the message pre-filled |
| Back button — nothing | Closes an open sheet → returns to Dashboard → exits the app |
| Status bar — default | Matched to the app's light/dark theme |

No screen, button, label or calculation was touched. If you open `www/index.html` directly in a browser, it behaves exactly as before.

**Storage note:** data lives in the WebView's `localStorage`, which persists across app restarts and updates but is removed if the app is uninstalled or its storage is cleared. Settings → Backup → *Download backup file* now saves a real `.json` into Documents; tell staff to do that weekly. If you later want several devices sharing one set of books, that needs a server — the data model is already relational and ports to Postgres or Firebase without touching the UI.

**Camera:** the barcode scanner uses the browser `BarcodeDetector` API, which Android System WebView supports on most modern devices; where it isn't available the app already falls back to typing the barcode. `CAMERA` permission is declared but marked optional.
