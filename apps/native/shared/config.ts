import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The three phone and tablet apps (club, member, Horus Home) are thin native shells around the live
 * product: the shell loads horus.farm over HTTPS (so the app is always the
 * deployed version, with the service worker and the install-free updates
 * that the web app already has) and adds what only a native app can give:
 * an icon on the home screen and in the store, a splash screen, the status
 * bar in brand colours, universal links (an emailed sign-in link opens the
 * app, not the browser), and a place in device management for a club's
 * tablets.
 *
 * Both apps share this base. The app id is the reverse domain; the names are
 * what the device shows under the icon. Directive 7: the member app's name
 * says only whose account it is.
 */
export const SITE = "https://horus.farm";

export function baseConfig(app: { appId: string; appName: string; startPath: "/club" | "/portal" | "/home" }): CapacitorConfig {
  return {
    appId: app.appId,
    appName: app.appName,
    webDir: "www",
    server: {
      // The live product. The shell's own www/ only shows while this loads.
      url: `${SITE}${app.startPath}`,
      hostname: "horus.farm",
      androidScheme: "https",
      iosScheme: "https",
      allowNavigation: ["horus.farm", "*.horus.farm"],
    },
    ios: {
      contentInset: "automatic",
      // WKWebView runs the site's service worker only for app-bound domains (Info.plist lists horus.farm).
      limitsNavigationsToAppBoundDomains: true,
      scheme: app.appName.replace(/\s+/g, ""),
    },
    android: {
      allowMixedContent: false,
      captureInput: true,
      webContentsDebuggingEnabled: false,
    },
    plugins: {
      SplashScreen: {
        launchShowDuration: 0,
        launchAutoHide: true,
        backgroundColor: "#F1F6F3",
        showSpinner: false,
        splashFullScreen: true,
        splashImmersive: false,
      },
      StatusBar: {
        style: "LIGHT",
        backgroundColor: "#F1F6F3",
        overlaysWebView: false,
      },
    },
  };
}
