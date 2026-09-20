#!/usr/bin/env node
/* Applies the Vyapar Desk Android configuration on top of the project that
   `npx cap add android` generated:
     - copies manifest, strings, colours, icons and file_paths
     - patches android/app/build.gradle with applicationId, version and a
       release signing config that reads keystore.properties
   Safe to run again: every step is idempotent, and originals are kept as *.orig
*/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'android-config');
const dst = path.join(root, 'android');
const APP_ID = 'com.vyapardesk.distributor';
const VERSION_NAME = '1.0.0';
const VERSION_CODE = 1;

if (!fs.existsSync(dst)) {
  console.error('\n  android/ not found. Run:  npx cap add android   first.\n');
  process.exit(1);
}

/* ---------- 1. copy resource overrides ---------- */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, entry.name), t = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(f, t);
    else {
      if (fs.existsSync(t) && !fs.existsSync(t + '.orig')) fs.copyFileSync(t, t + '.orig');
      fs.copyFileSync(f, t);
      console.log('  copied', path.relative(root, t));
    }
  }
}
copyDir(src, dst);

/* ---------- 2. patch app/build.gradle ---------- */
const gradlePath = path.join(dst, 'app', 'build.gradle');
let g = fs.readFileSync(gradlePath, 'utf8');
if (!fs.existsSync(gradlePath + '.orig')) fs.copyFileSync(gradlePath, gradlePath + '.orig');

if (!g.includes('keystore.properties')) {
  const header = `def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

`;
  g = header + g;
}

// applicationId / versionName / versionCode
g = g.replace(/applicationId\s+"[^"]*"/, `applicationId "${APP_ID}"`);
g = g.replace(/namespace\s+"[^"]*"/, `namespace "${APP_ID}"`);
g = g.replace(/versionCode\s+\d+/, `versionCode ${VERSION_CODE}`);
g = g.replace(/versionName\s+"[^"]*"/, `versionName "${VERSION_NAME}"`);

// signingConfigs block
if (!g.includes('signingConfigs {')) {
  const block = `    signingConfigs {
        release {
            if (keystoreProperties['storeFile']) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

`;
  g = g.replace(/(\n\s*buildTypes\s*\{)/, '\n' + block + '$1');
}

// hook the signing config into the release build type
if (!g.includes('signingConfig signingConfigs.release')) {
  g = g.replace(/(buildTypes\s*\{\s*\n\s*release\s*\{)/,
    `$1
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }`);
}

fs.writeFileSync(gradlePath, g);
console.log('  patched', path.relative(root, gradlePath));
console.log('\n  Android configuration applied. Next:  npx cap sync android\n');
