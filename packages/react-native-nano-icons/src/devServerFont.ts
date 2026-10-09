import { TurboModuleRegistry, type TurboModule } from 'react-native';
import { isFontRegistered } from './fontIntegrity';
import { loadDynamicFont } from './loadDynamicFont';
import NanoIconsFontLoader from './nativeFontLoader';

interface SourceCodeSpec extends TurboModule {
  getConstants(): { scriptURL: string };
}

export const DEV_SERVER_FONT_ROUTE = '/__nanoicons/';

export function devServerFontUri(family: string): string | undefined {
  const scriptURL =
    TurboModuleRegistry.get<SourceCodeSpec>('SourceCode')?.getConstants()
      .scriptURL;

  const origin = scriptURL?.match(/^https?:\/\/[^/]+/)?.[0];

  return origin
    ? `${origin}${DEV_SERVER_FONT_ROUTE}${encodeURIComponent(family)}.ttf`
    : undefined;
}

export async function loadFontFromDevServer(family: string): Promise<boolean> {
  if (!NanoIconsFontLoader) return false;
  if (await isFontRegistered(family)) return true;
  const uri = devServerFontUri(family);
  if (!uri) return false;
  try {
    const head = await fetch(uri, { method: 'HEAD' });
    if (!head.ok) return false;
    await loadDynamicFont(family, { uri });
    return true;
  } catch {
    return false;
  }
}
