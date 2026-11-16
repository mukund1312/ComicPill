// The app's config is app.json. A side-by-side test build (APP_VARIANT=side-by-side) gets its own app id, name and link scheme, so it
// installs next to the regular ComicPill on the same phone for comparing the two. Store builds never set it.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'side-by-side') return config;
  return {
    ...config,
    name: 'ComicPill Premium',
    scheme: 'comicpill-premium',
    android: { ...config.android, package: 'com.mukund.comicpill.premium' },
    ios: { ...config.ios, bundleIdentifier: 'com.mukund.comicpill.premium' },
  };
};
