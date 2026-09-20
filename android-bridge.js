/* Vyapar Desk — native bridge.
   Loaded after the app. In a normal browser it does nothing at all, so the
   web build and the APK run the exact same code with the same UI.
   Inside the APK it replaces three browser-only behaviours with native ones:
     1. file saving  -> Filesystem + Share sheet (browser downloads don't work in a WebView)
     2. wa.me / tel: / mailto: links -> real Android intents
     3. hardware Back button -> close sheet, then go to Dashboard, then exit
*/
(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;
  var P = Cap.Plugins || {};
  var Filesystem = P.Filesystem, Share = P.Share, App = P.App,
      AppLauncher = P.AppLauncher, StatusBar = P.StatusBar;

  function say(msg, kind) { if (typeof window.toast === 'function') window.toast(msg, kind); }

  /* ---------- 1. Saving PDFs, CSVs and backups ---------- */
  function toBase64(data) {
    return new Promise(function (resolve, reject) {
      var blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  var MIME = {
    pdf: 'application/pdf', csv: 'text/csv', json: 'application/json',
    html: 'text/html', txt: 'text/plain', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  window.downloadFile = async function (filename, data, mime) {
    try {
      var b64 = await toBase64(data);
      var ext = String(filename).split('.').pop().toLowerCase();
      var res = await Filesystem.writeFile({
        path: filename,
        data: b64,
        directory: 'DOCUMENTS',      // /storage/emulated/0/Documents/<filename>
        recursive: true
      });
      say('Saved to Documents: ' + filename);
      try {
        await Share.share({
          title: filename,
          text: filename,
          url: res.uri,
          dialogTitle: 'Share ' + filename
        });
      } catch (e) { /* user dismissed the share sheet; the file is already saved */ }
      return res.uri;
    } catch (e) {
      console.warn('native save failed', e);
      say('Could not save the file', 'err');
    }
  };

  /* ---------- 2. WhatsApp, phone and email links ---------- */
  async function openExternal(url) {
    try {
      if (AppLauncher && AppLauncher.openUrl) { await AppLauncher.openUrl({ url: url }); return true; }
    } catch (e) { console.warn('openUrl failed', e); }
    try { window.open(url, '_system'); return true; } catch (e) { return false; }
  }
  var origWhatsApp = window.openWhatsApp;
  window.openWhatsApp = function (phone, msg) {
    var n = typeof window.waNumber === 'function' ? window.waNumber(phone) : String(phone || '').replace(/\D/g, '');
    if (!n) { say('No WhatsApp number saved', 'err'); return; }
    var url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
    openExternal(url).then(function (ok) {
      if (ok) say('Opening WhatsApp');
      else if (typeof origWhatsApp === 'function') origWhatsApp(phone, msg);
    });
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"]');
    if (!a) return;
    e.preventDefault();
    openExternal(a.getAttribute('href'));
  }, true);

  /* ---------- 3. Hardware Back button ---------- */
  if (App && App.addListener) {
    App.addListener('backButton', function () {
      var modal = document.getElementById('modal');
      if (modal && modal.innerHTML.trim()) { if (typeof window.closeModal === 'function') window.closeModal(); return; }
      var v = window.VIEW && window.VIEW.name;
      if (v && v !== 'dashboard' && typeof window.go === 'function') {
        if (window.DRAFT) window.DRAFT = null;
        window.go('dashboard');
        return;
      }
      App.exitApp();
    });
    // Flush anything unsaved when the app goes to the background.
    App.addListener('appStateChange', function (st) {
      if (!st.isActive && typeof window.save === 'function') { try { window.save(); } catch (e) {} }
    });
  }

  /* ---------- 4. Status bar matched to the app's theme ---------- */
  function paintStatusBar() {
    if (!StatusBar) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    try {
      StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
      StatusBar.setBackgroundColor({ color: dark ? '#16201D' : '#FFFFFF' });
    } catch (e) {}
  }
  paintStatusBar();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintStatusBar); } catch (e) {}
  new MutationObserver(paintStatusBar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
