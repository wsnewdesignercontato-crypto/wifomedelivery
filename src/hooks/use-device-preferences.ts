import { useEffect, useState } from "react";
import {
  DEFAULT_DEVICE_PREFERENCES,
  readDevicePreferences,
  subscribeDevicePreferences,
  updateDevicePreference,
} from "@/lib/device-preferences";

export function useDevicePreferences() {
  const [prefs, setPrefs] = useState(DEFAULT_DEVICE_PREFERENCES);
  useEffect(() => {
    const sync = () => setPrefs(readDevicePreferences());
    const stop = subscribeDevicePreferences(sync);
    sync();
    return stop;
  }, []);
  return { prefs, updatePreference: updateDevicePreference };
}
