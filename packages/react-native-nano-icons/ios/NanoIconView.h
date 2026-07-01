#import <React/RCTViewComponentView.h>
#import <Foundation/Foundation.h>

@interface NanoIconView : RCTViewComponentView
@end

// Clears cached CTFontRef entries for `family` so the next render fetches a
// fresh reference after an OTA font re-registration within the same process.
void NanoIconInvalidateFontCache(NSString *family);
