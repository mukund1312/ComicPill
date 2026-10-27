// iOS 27's SDK refuses to launch an app that doesn't use the UIScene life cycle. Expo ships the scene delegate (EXExpoAppSceneDelegate)
// but the generated project doesn't wire it up yet; this plugin does, so every fresh `expo prebuild` is launchable.
const { withInfoPlist, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSceneManifest = (config) => withInfoPlist(config, (c) => {
  c.modResults.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' }],
    },
  };
  return c;
});

const withSceneAppDelegate = (config) => withDangerousMod(config, ['ios', async (c) => {
  const dir = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName);
  const file = path.join(dir, 'AppDelegate.swift');
  if (!fs.existsSync(file)) return c;
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('ExpoReactNativeFactoryProvider')) return c;
  src = src.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  // The scene delegate creates the window and starts React Native now.
  src = src.replace(/#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\n#endif\n/, '');
  fs.writeFileSync(file, src);
  return c;
}]);

module.exports = (config) => withSceneAppDelegate(withSceneManifest(config));
