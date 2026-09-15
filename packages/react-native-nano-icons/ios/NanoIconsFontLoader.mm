#import "NanoIconsFontLoader.h"
#import "NanoIconView.h"
#import <CoreText/CoreText.h>

@implementation NanoIconsFontLoader

RCT_EXPORT_MODULE()

// `family` must match the TTF's PostScript/full name — CTFontManager ignores it otherwise.
RCT_EXPORT_METHOD(registerFont:(NSString *)family
                  uri:(NSString *)uri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [uri hasPrefix:@"/"] ? [NSURL fileURLWithPath:uri]
                                    : [NSURL URLWithString:uri];
  if (!url) {
    reject(@"E_NANOICONS_FONT_REGISTER",
           [NSString stringWithFormat:@"Invalid font uri: %@", uri], nil);
    return;
  }

  NSData *data = [NSData dataWithContentsOfURL:url];
  if (!data) {
    reject(@"E_NANOICONS_FONT_REGISTER",
           [NSString stringWithFormat:@"Could not read font at %@", uri], nil);
    return;
  }

  CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)data);
  CGFontRef cgFont = CGFontCreateWithDataProvider(provider);
  CGDataProviderRelease(provider);
  if (!cgFont) {
    reject(@"E_NANOICONS_FONT_REGISTER", @"Invalid font data", nil);
    return;
  }

  NSString *postScriptName = (__bridge_transfer NSString *)CGFontCopyPostScriptName(cgFont);
  NSString *fullName = (__bridge_transfer NSString *)CGFontCopyFullName(cgFont);

  BOOL nameMatches =
      [postScriptName isEqualToString:family] || [fullName isEqualToString:family];
  if (!nameMatches) {
    CGFontRelease(cgFont);
    reject(
        @"E_NANOICONS_FONT_REGISTER",
        [NSString stringWithFormat:
                      @"Font name \"%@\" does not match family \"%@\". "
                      @"On iOS the TTF PostScript/full name must equal glyphMap.m.f.",
                      postScriptName ?: fullName, family],
        nil);
    return;
  }

  CFErrorRef error = NULL;
  bool ok = CTFontManagerRegisterGraphicsFont(cgFont, &error);
  // defer cgFont release — needed for re-registration if name conflict.

  if (!ok && error) {
    NSError *err = (__bridge_transfer NSError *)error;

    if (err.code == kCTFontManagerErrorAlreadyRegistered ||
        err.code == kCTFontManagerErrorDuplicatedName) {
      // OTA reload: process still holds the old font. Swap it out.
      CTFontRef existingCT = CTFontCreateWithName((__bridge CFStringRef)postScriptName, 10.0, NULL);
      if (existingCT) {
        CGFontRef existingCG = CTFontCopyGraphicsFont(existingCT, NULL);
        CFRelease(existingCT);
        if (existingCG) {
          CFErrorRef unregErr = NULL;
          CTFontManagerUnregisterGraphicsFont(existingCG, &unregErr);
          CFRelease(existingCG);
          if (unregErr) CFRelease(unregErr);
        }
      }

      CFErrorRef regErr = NULL;
      bool reok = CTFontManagerRegisterGraphicsFont(cgFont, &regErr);
      CGFontRelease(cgFont);

      if (!reok && regErr) {
        NSError *reErr = (__bridge_transfer NSError *)regErr;
        reject(@"E_NANOICONS_FONT_REGISTER", reErr.localizedDescription, reErr);
        return;
      }
      if (regErr) CFRelease(regErr);

      NanoIconInvalidateFontCache(postScriptName);
      resolve(@(YES));
      return;
    }

    CGFontRelease(cgFont);
    reject(@"E_NANOICONS_FONT_REGISTER", err.localizedDescription, err);
    return;
  }

  CGFontRelease(cgFont);
  resolve(@(YES));
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeNanoIconsFontLoaderSpecJSI>(params);
}
#endif

@end
