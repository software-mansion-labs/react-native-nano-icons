#import "NanoIconFontResolver.h"

static NSMutableDictionary *sNanoIconFontCache;
static dispatch_once_t sNanoIconFontCacheOnce;

CTFontRef NanoIconResolveFont(NSString *family, CGFloat size) {
  dispatch_once(&sNanoIconFontCacheOnce, ^{ sNanoIconFontCache = [NSMutableDictionary new]; });

  NSString *key = [NSString stringWithFormat:@"%@:%.1f", family, size];
  @synchronized(sNanoIconFontCache) {
    id existing = sNanoIconFontCache[key];
    if (existing) {
      return (__bridge CTFontRef)existing;
    }

    CTFontRef font = CTFontCreateWithName((__bridge CFStringRef)family, size, NULL);
    if (!font) return NULL;

    NSString *postScriptName = (__bridge_transfer NSString *)CTFontCopyPostScriptName(font);
    if (![postScriptName isEqualToString:family]) {
      CFRelease(font);
      return NULL;
    }

    sNanoIconFontCache[key] = (__bridge id)font;
    return font;
  }
}

BOOL NanoIconIsFontResolvable(NSString *family) {
  return NanoIconResolveFont(family, 12.0) != NULL;
}
