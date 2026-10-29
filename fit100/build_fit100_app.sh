#!/usr/bin/env bash
# Builds a paid Android/iOS app from the 100-Day Fitness Tracker using
# Capacitor (free wrapper) + RevenueCat (handles Apple/Google purchases).
#
# Before running:
#   1. Put 100-day-tracker.html in the same folder as this script.
#   2. Install Node 18+ (nodejs.org). Android: Android Studio. iOS: a Mac with Xcode.
#   3. In RevenueCat (revenuecat.com, free to start): create a project, add your
#      Apple and Google apps, create an entitlement named "pro", create a product
#      (monthly, yearly or one-time) and attach it to an offering marked "current".
#   4. Export your settings:
#        export APP_ID="com.yourname.fit100"        # must match your store listing
#        export APP_NAME="100 Day Fit"
#        export RC_ANDROID_KEY="goog_xxxxxxxx"      # RevenueCat public SDK keys
#        export RC_IOS_KEY="appl_xxxxxxxx"
#        export ENTITLEMENT="pro"                    # optional, defaults to pro
#
# Run:  bash build_fit100_app.sh

set -euo pipefail
: "${APP_ID:?Set APP_ID}"; : "${APP_NAME:?Set APP_NAME}"
: "${RC_ANDROID_KEY:?Set RC_ANDROID_KEY}"; : "${RC_IOS_KEY:?Set RC_IOS_KEY}"
ENTITLEMENT="${ENTITLEMENT:-pro}"
SRC="$(cd "$(dirname "$0")" && pwd)/100-day-tracker.html"
[ -f "$SRC" ] || { echo "Missing $SRC"; exit 1; }

rm -rf fit100app && mkdir fit100app && cd fit100app
npm init -y >/dev/null
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios \
      @capacitor/browser @capacitor/local-notifications \
      @revenuecat/purchases-capacitor

# Create the web assets BEFORE cap init so --web-dir points at a real folder.
mkdir www
cp "$SRC" www/index.html

npx cap init "$APP_NAME" "$APP_ID" --web-dir www

# --- paywall: blocks the app until the "pro" entitlement is active -------
cat > www/paywall.js <<'JS'
(async () => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;   // browser: no gate
  const P = C.Plugins.Purchases, B = C.Plugins.Browser;
  document.addEventListener('click', e => {                          // open video links outside the app
    const a = e.target.closest('a[target=_blank]');
    if (a && B) { e.preventDefault(); B.open({ url: a.href }); }
  });
  const key = C.getPlatform() === 'ios' ? '__RC_IOS__' : '__RC_ANDROID__';
  const ENT = '__ENT__';
  const wall = document.createElement('div');
  wall.style.cssText = 'position:fixed;inset:0;z-index:99;background:#12161c;color:#f2efe8;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;text-align:center;font-family:-apple-system,Arial,sans-serif';
  wall.innerHTML = '<h1 style="margin:0">100-Day Fitness Tracker</h1><p id="pw-t" style="max-width:320px">Unlock the full 100-day plan, tracker and scorecard.</p><button id="pw-b" style="height:48px;padding:0 28px;border:0;border-radius:24px;background:#5ec2b7;color:#10201e;font-size:17px;font-weight:700">Loading…</button><button id="pw-r" style="background:none;border:0;color:#9aa3ad;font-size:15px">Restore purchase</button><div id="pw-e" style="color:#e9a23b;font-size:14px"></div>';
  document.body.appendChild(wall);
  const $ = id => wall.querySelector('#' + id);
  const active = ci => !!(ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[ENT]);
  const open = ok => { wall.style.display = ok ? 'none' : 'flex'; };
  try {
    await P.configure({ apiKey: key });
    const { customerInfo } = await P.getCustomerInfo();
    if (active(customerInfo)) return;
    open(false);
    const { current } = await P.getOfferings();
    const pkg = current && current.availablePackages[0];
    if (!pkg) { $('pw-b').textContent = 'Unavailable'; $('pw-e').textContent = 'No purchase option found. Check your RevenueCat offering.'; return; }
    $('pw-b').textContent = 'Unlock for ' + pkg.product.priceString;
    $('pw-b').onclick = async () => {
      try { const r = await P.purchasePackage({ aPackage: pkg }); if (active(r.customerInfo)) open(true); }
      catch (e) { if (!e.userCancelled) $('pw-e').textContent = 'Purchase failed. Please try again.'; }
    };
    $('pw-r').onclick = async () => {
      try { const r = await P.restorePurchases(); if (active(r.customerInfo)) open(true); else $('pw-e').textContent = 'No purchase found to restore.'; }
      catch (e) { $('pw-e').textContent = 'Restore failed. Please try again.'; }
    };
  } catch (e) { open(false); $('pw-e').textContent = 'Could not reach the store. Check your connection.'; }
})();
JS
sed -i.bak "s/__RC_IOS__/$RC_IOS_KEY/; s/__RC_ANDROID__/$RC_ANDROID_KEY/; s/__ENT__/$ENTITLEMENT/" www/paywall.js && rm www/paywall.js.bak
# --- daily reminders (workout, midday water/protein check, evening nutrition log) ---
# Change the hours below to suit you. Times are the phone's local time.
cat > www/reminders.js <<'JS'
(async () => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const N = C.Plugins.LocalNotifications;
  if (!N) return;
  try {
    const perm = await N.requestPermissions();
    if (perm.display !== 'granted') return;
    await N.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const daily = (id, hour, title, body) => ({ id, title, body, schedule: { on: { hour, minute: 0 }, allowWhileIdle: true } });
    await N.schedule({ notifications: [
      daily(1, 6,  'Workout time', 'Open today\u2019s plan and check off your sets.'),
      daily(2, 12, 'Midday check', 'Log your water and protein so far.'),
      daily(3, 19, 'Log your nutrition', 'Add today\u2019s servings and mark your day complete.')
    ]});
  } catch (e) { /* reminders are optional */ }
})();
JS
# Guard the injection: only rewrite if a lowercase </body> tag is present.
if grep -q '</body>' www/index.html; then
  sed -i.bak 's#</body>#<script src="paywall.js"></script><script src="reminders.js"></script></body>#' www/index.html && rm www/index.html.bak
else
  echo "Warning: no </body> tag found in index.html; appending scripts at EOF."
  printf '\n<script src="paywall.js"></script>\n<script src="reminders.js"></script>\n' >> www/index.html
fi

npx cap add android
if [ "$(uname)" = "Darwin" ]; then npx cap add ios; else echo "Skipping iOS (needs a Mac)."; fi
npx cap sync

cat <<EOF

Done. Project is in ./fit100app

Android:  npx cap open android   -> Build > Generate Signed Bundle (AAB) -> upload to Google Play Console
iOS:      npx cap open ios       -> set your Team under Signing, Product > Archive -> upload via Xcode to App Store Connect

Still on you (no script can do these):
  - Developer accounts: Apple Developer Program (about \$99/yr) and Google Play (one-time \$25)
  - App icon, splash screen, screenshots, store descriptions, privacy policy URL
  - Create the matching in-app product in App Store Connect and Play Console, then link it in RevenueCat
  - Test with sandbox/test accounts before submitting
After editing www/index.html later, run:  npx cap sync
EOF
