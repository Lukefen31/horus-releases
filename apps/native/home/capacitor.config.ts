import type { CapacitorConfig } from "@capacitor/cli";
import { baseConfig } from "../shared/config";

const base = baseConfig({ appId: "farm.horus.home", appName: "Horus Home", startPath: "/home" });

/**
 * "Horus Home": the grow journal for personal growers. Opens at /home. Local-first: the data stays in the shell's own storage.
 * Reminders notify through the Local Notifications plugin (declared in this folder's package.json, which is what `cap sync` reads).
 */
const config: CapacitorConfig = {
  ...base,
  plugins: {
    ...base.plugins,
    // The notification's small icon is the white leaf in android/app/src/main/res/drawable/ic_stat_horus.xml; Android tints it.
    LocalNotifications: { smallIcon: "ic_stat_horus", iconColor: "#4E2A74" },
  },
};

export default config;
