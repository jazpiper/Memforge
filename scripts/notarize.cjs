const { notarize } = require("@electron/notarize");

module.exports = async function notarizeApp(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    if (process.env.CI === "true" || process.env.MEMFORGE_REQUIRE_NOTARIZATION === "1") {
      throw new Error("Missing Apple notarization credentials for macOS release packaging.");
    }
    return;
  }

  const { appOutDir, electronPlatformName, packager } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = packager.appInfo.productFilename;
  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
};
