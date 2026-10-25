// Signs release builds with your own key when one exists, and falls back to the debug key when it doesn't, so
// `./gradlew assembleRelease` always works. The key lives OUTSIDE the repo (never commit it):
//   ~/.comicpill-signing/keystore.properties   (or point COMICPILL_KEYSTORE_PROPERTIES at another file)
//   storeFile=/path/to/comicpill-release.keystore  storePassword=…  keyAlias=comicpill  keyPassword=…
// Lose the keystore and you can never update the app on Google Play. Back it up somewhere safe.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes('comicpillRelease')) return cfg;

    const loader = [
      'def comicpillKeyProps = new Properties()',
      "def comicpillKeyFile = file(System.getenv('COMICPILL_KEYSTORE_PROPERTIES') ?: (System.getProperty('user.home') + '/.comicpill-signing/keystore.properties'))",
      'if (comicpillKeyFile.exists()) { comicpillKeyFile.withInputStream { comicpillKeyProps.load(it) } }',
      '',
    ].join('\n');
    g = g.replace(/^android \{/m, loader + 'android {');

    g = g.replace(/signingConfigs \{\n(\s*)debug \{/, (m, indent) => [
      'signingConfigs {',
      `${indent}comicpillRelease {`,
      `${indent}    if (comicpillKeyProps['storeFile']) {`,
      `${indent}        storeFile file(comicpillKeyProps['storeFile'])`,
      `${indent}        storePassword comicpillKeyProps['storePassword']`,
      `${indent}        keyAlias comicpillKeyProps['keyAlias']`,
      `${indent}        keyPassword comicpillKeyProps['keyPassword']`,
      `${indent}    }`,
      `${indent}}`,
      `${indent}debug {`,
    ].join('\n'));

    g = g.replace(/(release \{[\s\S]*?)signingConfig signingConfigs\.debug/, "$1signingConfig comicpillKeyProps['storeFile'] ? signingConfigs.comicpillRelease : signingConfigs.debug");
    cfg.modResults.contents = g;
    return cfg;
  });
};
