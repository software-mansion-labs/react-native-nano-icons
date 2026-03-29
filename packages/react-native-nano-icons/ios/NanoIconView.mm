#import "NanoIconView.h"

#import <CoreText/CoreText.h>
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/RNNanoIconsSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNNanoIconsSpec/Props.h>

using namespace facebook::react;

@implementation NanoIconView {
  CTFontRef _font;
  NSString *_fontFamily;
  CGFloat _fontSize;
  std::vector<CGGlyph> _glyphs;
  std::vector<uint32_t> _colors;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const NanoIconViewProps>();
    _props = defaultProps;
    self.opaque = NO;
    self.backgroundColor = [UIColor clearColor];
  }
  return self;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<NanoIconViewComponentDescriptor>();
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldViewProps = static_cast<const NanoIconViewProps &>(*_props);
  const auto &newViewProps = static_cast<const NanoIconViewProps &>(*props);

  // Recreate font if fontFamily or fontSize changed
  BOOL fontChanged = NO;
  if (oldViewProps.fontFamily != newViewProps.fontFamily || oldViewProps.fontSize != newViewProps.fontSize) {
    if (_font) {
      CFRelease(_font);
      _font = NULL;
    }
    NSString *family = [NSString stringWithUTF8String:newViewProps.fontFamily.c_str()];
    _fontFamily = family;
    _fontSize = newViewProps.fontSize;
    _font = CTFontCreateWithName((__bridge CFStringRef)family, _fontSize, NULL);
    fontChanged = YES;
  }

  // Update glyphs if codepoints changed or font changed
  BOOL codepointsChanged = fontChanged || (oldViewProps.codepoints != newViewProps.codepoints);
  if (codepointsChanged && _font) {
    const auto &codepoints = newViewProps.codepoints;
    _glyphs.resize(codepoints.size());

    for (size_t i = 0; i < codepoints.size(); i++) {
      int32_t cp = codepoints[i];
      // Handle BMP and supplementary plane characters
      if (cp <= 0xFFFF) {
        UniChar ch = (UniChar)cp;
        CTFontGetGlyphsForCharacters(_font, &ch, &_glyphs[i], 1);
      } else {
        // Supplementary plane (private use area): use surrogate pair
        UniChar surrogates[2];
        surrogates[0] = (UniChar)(0xD800 + ((cp - 0x10000) >> 10));
        surrogates[1] = (UniChar)(0xDC00 + ((cp - 0x10000) & 0x3FF));
        CGGlyph glyphPair[2] = {0, 0};
        CTFontGetGlyphsForCharacters(_font, surrogates, glyphPair, 2);
        _glyphs[i] = glyphPair[0];
      }
    }
  }

  // Update colors
  if (oldViewProps.colors != newViewProps.colors) {
    const auto &colors = newViewProps.colors;
    _colors.resize(colors.size());
    for (size_t i = 0; i < colors.size(); i++) {
      _colors[i] = (uint32_t)colors[i];
    }
  }

  [super updateProps:props oldProps:oldProps];
  [self setNeedsDisplay];
}

- (void)drawRect:(CGRect)rect
{
  if (!_font || _glyphs.empty()) {
    return;
  }

  CGContextRef context = UIGraphicsGetCurrentContext();
  if (!context) {
    return;
  }

  // CoreText draws with y-axis pointing up; UIKit has y-axis pointing down.
  // We flip the context and then scale/position using the actual font metrics
  // so the glyph fits exactly within the view bounds.
  CGContextSaveGState(context);
  CGContextTranslateCTM(context, 0, self.bounds.size.height);
  CGContextScaleCTM(context, 1.0, -1.0);

  // Use actual CTFont metrics to position the baseline correctly.
  // CoreText may report slightly different ascent/descent than what we set in the TTF.
  CGFloat ascent = CTFontGetAscent(_font);
  CGFloat descent = CTFontGetDescent(_font);
  CGFloat fontTotalHeight = ascent + descent;
  CGFloat viewHeight = self.bounds.size.height;

  // Scale so the font's full extent (ascent + descent) fits the view height
  if (fontTotalHeight > 0) {
    CGFloat fitScale = viewHeight / fontTotalHeight;
    CGContextScaleCTM(context, fitScale, fitScale);
  }

  // Position baseline at y=descent from the bottom so descenders fit below
  // and ascent fills upward to exactly the view top
  CGPoint position = CGPointMake(0, descent);

  for (size_t i = 0; i < _glyphs.size(); i++) {
    if (_glyphs[i] == 0) {
      continue; // Skip invalid glyphs
    }

    // Extract RGBA from processColor() result (iOS returns 0xAABBGGRR)
    uint32_t colorInt = (i < _colors.size()) ? _colors[i] : 0xFF000000;
    CGFloat a = ((colorInt >> 24) & 0xFF) / 255.0;
    CGFloat r = ((colorInt >> 16) & 0xFF) / 255.0;
    CGFloat g = ((colorInt >> 8) & 0xFF) / 255.0;
    CGFloat b = (colorInt & 0xFF) / 255.0;

    CGColorRef color = CGColorCreateSRGB(r, g, b, a);
    CGContextSetFillColorWithColor(context, color);
    CGColorRelease(color);

    CTFontDrawGlyphs(_font, &_glyphs[i], &position, 1, context);
  }

  CGContextRestoreGState(context);
}

- (void)dealloc
{
  if (_font) {
    CFRelease(_font);
  }
}

@end

Class<RCTComponentViewProtocol> NanoIconViewCls(void)
{
  return NanoIconView.class;
}
