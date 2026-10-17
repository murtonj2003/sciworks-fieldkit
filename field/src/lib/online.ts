// "Is there internet right now?" for the hand-over screen's honest route tags. A tiny request with a short
// timeout (no data sent); no native module, so it works the same in Expo Go and the installed build.
import { Platform } from 'react-native';

export async function checkOnline(timeoutMs = 3000): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // DEV ONLY: a browser blocks reading the reply (CORS), so the preview only asks whether it arrived.
    const web = Platform.OS === 'web';
    const res = await fetch('https://www.gstatic.com/generate_204', { method: 'GET', cache: 'no-store', signal: ctl.signal, ...(web ? { mode: 'no-cors' as RequestMode } : {}) });
    // Only the exact 204: a captive portal (field-station WiFi with a login page) answers 200 and is not online.
    return web || res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
