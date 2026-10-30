import { isWebFontRegistered, registerWebFont } from './webFont';

export const DEV_SERVER_FONT_ROUTE = '/__nanoicons/';

export function devServerFontUri(family: string): string | undefined {
  const origin = (globalThis as { location?: { origin?: string } }).location
    ?.origin;
  return origin
    ? `${origin}${DEV_SERVER_FONT_ROUTE}${encodeURIComponent(family)}.ttf`
    : undefined;
}

export async function loadFontFromDevServer(family: string): Promise<boolean> {
  if (isWebFontRegistered(family)) return true;
  const uri = devServerFontUri(family);
  if (!uri) return false;
  try {
    const head = await fetch(uri, { method: 'HEAD' });
    if (!head.ok) return false;
    await registerWebFont(family, uri);
    return true;
  } catch {
    return false;
  }
}
