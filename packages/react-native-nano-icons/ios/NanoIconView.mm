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
  // Cached CGColor refs — rebuilt only when colors prop changes
  std::vector<CGColorRef> _cachedCGColors;
  // Cached layout metrics — rebuilt only when font or bounds change
  CGFloat _fitScale;
  CGPoint _baselinePosition;
  BOOL _metricsValid;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const NanoIconViewProps>();
    _props = defaultProps;
    self.opaque = NO;
    self.backgroundColor = [UIColor clearColor];
    _fitScale = 1.0;
    _baselinePosition = CGPointZero;
    _metricsValid = NO;
  }
  return self;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<NanoIconViewComponentDescriptor>();
}

- (void)_releaseCachedColors
{
  for (CGColorRef c : _cachedCGColors) {
    CGColorRelease(c);
  }
  _cachedCGColors.clear();
}

- (void)_rebuildCachedColors
{
  [self _releaseCachedColors];
  _cachedCGColors.resize(_colors.size());
  for (size_t i = 0; i < _colors.size(); i++) {
    uint32_t colorInt = _colors[i];
    CGFloat a = ((colorInt >> 24) & 0xFF) / 255.0;
    CGFloat r = ((colorInt >> 16) & 0xFF) / 255.0;
    CGFloat g = ((colorInt >> 8) & 0xFF) / 255.0;
    CGFloat b = (colorInt & 0xFF) / 255.0;
    _cachedCGColors[i] = CGColorCreateSRGB(r, g, b, a);
  }
}

- (void)_updateMetrics
{
  if (!_font) {
    _metricsValid = NO;
    return;
  }

  CGFloat ascent = CTFontGetAscent(_font);
  CGFloat descent = CTFontGetDescent(_font);
  CGFloat fontTotalHeight = ascent + descent;
  CGFloat viewHeight = self.bounds.size.height;

  _fitScale = (fontTotalHeight > 0) ? (viewHeight / fontTotalHeight) : 1.0;
  _baselinePosition = CGPointMake(0, descent);
  _metricsValid = YES;
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
    _metricsValid = NO;
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
    [self _rebuildCachedColors];
  }

  [super updateProps:props oldProps:oldProps];
  [self setNeedsDisplay];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _metricsValid = NO;
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

  if (!_metricsValid) {
    [self _updateMetrics];
  }

  CGContextSaveGState(context);
  // CoreText draws with y-axis pointing up; UIKit has y-axis pointing down.
  CGContextTranslateCTM(context, 0, self.bounds.size.height);
  CGContextScaleCTM(context, 1.0, -1.0);
  CGContextScaleCTM(context, _fitScale, _fitScale);

  // Batch consecutive same-color glyphs into a single CTFontDrawGlyphs call
  size_t i = 0;
  while (i < _glyphs.size()) {
    if (_glyphs[i] == 0) {
      i++;
      continue;
    }

    // Determine the color for this run
    CGColorRef color = (i < _cachedCGColors.size()) ? _cachedCGColors[i] : NULL;
    if (!color) {
      // Fallback: opaque black
      static CGColorRef sBlack = CGColorCreateSRGB(0, 0, 0, 1);
      color = sBlack;
    }
    CGContextSetFillColorWithColor(context, color);

    // Collect consecutive glyphs with the same color
    size_t batchStart = i;
    size_t batchCount = 0;
    // Use a small stack buffer for positions; heap-allocate only for very large batches
    CGPoint positionsBuf[16];
    CGGlyph glyphsBuf[16];
    CGPoint *positions = positionsBuf;
    CGGlyph *batchGlyphs = glyphsBuf;

    while (i < _glyphs.size()) {
      if (_glyphs[i] == 0) { i++; continue; }

      CGColorRef nextColor = (i < _cachedCGColors.size()) ? _cachedCGColors[i] : NULL;
      // Break batch if color changes
      if (i > batchStart && nextColor != color) break;

      if (batchCount < 16) {
        positions[batchCount] = _baselinePosition;
        batchGlyphs[batchCount] = _glyphs[i];
      }
      batchCount++;
      i++;
    }

    // If batch exceeded stack buffer, allocate and refill
    if (batchCount > 16) {
      positions = (CGPoint *)malloc(batchCount * sizeof(CGPoint));
      batchGlyphs = (CGGlyph *)malloc(batchCount * sizeof(CGGlyph));
      size_t idx = 0;
      for (size_t j = batchStart; j < i; j++) {
        if (_glyphs[j] == 0) continue;
        positions[idx] = _baselinePosition;
        batchGlyphs[idx] = _glyphs[j];
        idx++;
      }
    }

    CTFontDrawGlyphs(_font, batchGlyphs, positions, batchCount, context);

    if (batchCount > 16) {
      free(positions);
      free(batchGlyphs);
    }
  }

  CGContextRestoreGState(context);
}

- (void)dealloc
{
  if (_font) {
    CFRelease(_font);
  }
  [self _releaseCachedColors];
}

@end

Class<RCTComponentViewProtocol> NanoIconViewCls(void)
{
  return NanoIconView.class;
}
