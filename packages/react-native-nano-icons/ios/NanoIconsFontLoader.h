#ifdef RCT_NEW_ARCH_ENABLED
#import <RNNanoIconsSpec/RNNanoIconsSpec.h>

@interface NanoIconsFontLoader : NSObject <NativeNanoIconsFontLoaderSpec>
@end
#else
#import <React/RCTBridgeModule.h>

@interface NanoIconsFontLoader : NSObject <RCTBridgeModule>
@end
#endif
