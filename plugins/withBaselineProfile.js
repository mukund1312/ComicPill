// Copies profiles/baseline-prof.txt.gz (gunzipped) into the generated Android project, where the Android Gradle plugin turns it into
// a baseline profile: the app's startup code is compiled ahead of time on install, so it launches faster.
// Regenerate the file with `scripts/record-baseline-profile.sh` after big changes to what runs at startup.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

module.exports = function withBaselineProfile(config) {
  return withDangerousMod(config, ['android', (cfg) => {
    const src = path.join(cfg.modRequest.projectRoot, 'profiles', 'baseline-prof.txt.gz');
    const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'baseline-prof.txt');
    if (fs.existsSync(src)) fs.writeFileSync(dest, zlib.gunzipSync(fs.readFileSync(src)));
    return cfg;
  }]);
};
