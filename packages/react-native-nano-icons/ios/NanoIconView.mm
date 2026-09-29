#import "NanoIconView.h"
#import "NanoIconFontResolver.h"
#import <CoreText/CoreText.h>
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/RNNanoIconsSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNNanoIconsSpec/Props.h>

using namespace facebook::react;

@interface NanoIconView ()
- (void)_resolveFontIfMissing;
@end

static NSHashTable<NanoIconView *> *sNanoIconLiveViews;
static dispatch_once_t sNanoIconLiveViewsOnce;

static void NanoIconTrackLiveView(NanoIconView *view) {
  dispatch_once(&sNanoIconLiveViewsOnce, ^{
    sNanoIconLiveViews = [NSHashTable weakObjectsHashTable];
    [[NSNotificationCenter defaultCenter]
        addObserverForName:(__bridge NSString *)kCTFontManagerRegisteredFontsChangedNotification
                    object:nil
                     queue:[NSOperationQueue mainQueue]
                usingBlock:^(__unused NSNotification *note) {
                  for (NanoIconView *live in [sNanoIconLiveViews allObjects]) {
                    [live _resolveFontIfMissing];
                  }
                }];
  });
  [sNanoIconLiveViews addObject:view];
}

@implementation NanoIconView {
  CTFontRef _font;   // borrowed from the shared resolver cache — do NOT CFRelease
  NSString *_fontFamily;
  CGFloat _fontSize;
  std::vector<CGGlyph> _glyphs;
  std::vector<uint32_t> _colors;
  std::vector<CGColorRef> _cachedCGColors;
  CGFloat _fitScale;
  CGPoint _baselinePosition;
  BOOL _metricsValid;

}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const NanoIconViewProps>();
    _props = defaultProps;
    self.opaque = NO;
    self.backgroundColor = [UIColor clearColor];
    self.clipsToBounds = NO;
    self.contentMode = UIViewContentModeRedraw;

    _fitScale = 1.0;
    _baselinePosition = CGPointZero;
    NanoIconTrackLiveView(self);
  }
  return self;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<NanoIconViewComponentDescriptor>();
}

- (void)updateClippedSubviewsWithClipRect:(__unused CGRect)clipRect
                           relativeToView:(__unused UIView *)clipView {}

#pragma mark - Metrics

// Scale factor to fit the icon font's em square into the view height,
// and the CoreText baseline origin used for all glyph draws.
- (void)_updateMetrics {
  if (!_font) {
    _metricsValid = NO;
    return;
  }
  CGFloat ascent = CTFontGetAscent(_font);
  CGFloat descent = CTFontGetDescent(_font);
  CGFloat totalHeight = ascent + descent;
  _fitScale = (totalHeight > 0) ? (self.bounds.size.height / totalHeight) : 1.0;
  _baselinePosition = CGPointMake(0, descent);
  _metricsValid = YES;
}

- (void)setBounds:(CGRect)bounds {
  if (!CGSizeEqualToSize(self.bounds.size, bounds.size)) {
    _metricsValid = NO;
  }
  [super setBounds:bounds];
}

#pragma mark - Layout

- (void)layoutSubviews {
  [super layoutSubviews];
  if (!_metricsValid) [self _updateMetrics];
}

#pragma mark - Drawing

// Standalone icons draw directly in this view's drawRect:.
- (void)drawRect:(CGRect)rect {
  CGContextRef ctx = UIGraphicsGetCurrentContext();
  if (ctx) [self _drawIconInContext:ctx bounds:self.bounds];
}

// Render multi-color icons by drawing each color layer glyph at the same
// position. Layers stack via painter's order to compose the final icon.
- (void)_drawIconInContext:(CGContextRef)context bounds:(CGRect)bounds {
  if (!_font || _glyphs.empty()) return;
  if (!_metricsValid) [self _updateMetrics];

  CGContextSaveGState(context);
  // Flip to CoreText coordinates (Y-up) and apply fit scale.
  CGContextTranslateCTM(context, 0, bounds.size.height);
  CGContextScaleCTM(context, 1.0, -1.0);
  CGContextScaleCTM(context, _fitScale, _fitScale);

  size_t i = 0;
  while (i < _glyphs.size()) {
    if (_glyphs[i] == 0) { i++; continue; }

    CGColorRef color = (i < _cachedCGColors.size()) ? _cachedCGColors[i] : NULL;
    if (!color) {
      static CGColorRef sBlack = CGColorCreateSRGB(0, 0, 0, 1);
      color = sBlack;
    }
    CGContextSetFillColorWithColor(context, color);

    // Batch consecutive same-color glyphs.
    size_t batchStart = i;
    size_t batchCount = 0;
    CGPoint posBuf[16];
    CGGlyph glyphBuf[16];

    while (i < _glyphs.size()) {
      if (_glyphs[i] == 0) { i++; continue; }
      CGColorRef next = (i < _cachedCGColors.size()) ? _cachedCGColors[i] : NULL;
      if (i > batchStart && next != color) break;
      if (batchCount < 16) {
        posBuf[batchCount] = _baselinePosition;
        glyphBuf[batchCount] = _glyphs[i];
      }
      batchCount++;
      i++;
    }

    CGPoint *positions = posBuf;
    CGGlyph *glyphs = glyphBuf;
    if (batchCount > 16) {
      positions = (CGPoint *)malloc(batchCount * sizeof(CGPoint));
      glyphs = (CGGlyph *)malloc(batchCount * sizeof(CGGlyph));
      size_t idx = 0;
      for (size_t j = batchStart; j < i; j++) {
        if (_glyphs[j] == 0) continue;
        positions[idx] = _baselinePosition;
        glyphs[idx] = _glyphs[j];
        idx++;
      }
    }

    CTFontDrawGlyphs(_font, glyphs, positions, batchCount, context);

    if (batchCount > 16) {
      free(positions);
      free(glyphs);
    }
  }

  CGContextRestoreGState(context);
}

#pragma mark - Props

- (void)_releaseCachedColors {
  for (CGColorRef c : _cachedCGColors) CGColorRelease(c);
  _cachedCGColors.clear();
}

// Convert ARGB uint32 color values into cached CGColorRefs.
- (void)_rebuildCachedColors {
  [self _releaseCachedColors];
  _cachedCGColors.resize(_colors.size());
  for (size_t i = 0; i < _colors.size(); i++) {
    uint32_t ci = _colors[i];
    _cachedCGColors[i] = CGColorCreateSRGB(
        ((ci >> 16) & 0xFF) / 255.0,
        ((ci >> 8)  & 0xFF) / 255.0,
        ( ci        & 0xFF) / 255.0,
        ((ci >> 24) & 0xFF) / 255.0);
  }
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps {
  const auto &oldViewProps = static_cast<const NanoIconViewProps &>(*_props);
  const auto &newViewProps = static_cast<const NanoIconViewProps &>(*props);

  BOOL fontChanged = NO;
  BOOL needsRedraw = NO;

  if (oldViewProps.fontFamily != newViewProps.fontFamily ||
      oldViewProps.fontSize  != newViewProps.fontSize) {
    _fontFamily = [NSString stringWithUTF8String:newViewProps.fontFamily.c_str()];
    _fontSize = newViewProps.fontSize;
    _font = NanoIconResolveFont(_fontFamily, _fontSize);
    _metricsValid = NO;
    fontChanged = YES;
    needsRedraw = YES;
  }

  // Map Unicode codepoints to font glyph IDs, handling surrogate pairs for codepoints > 0xFFFF.
  if (fontChanged || oldViewProps.codepoints != newViewProps.codepoints) {
    [self _mapGlyphs:newViewProps.codepoints];
    needsRedraw = YES;
  }

  if (oldViewProps.colors != newViewProps.colors) {
    const auto &colors = newViewProps.colors;
    _colors.resize(colors.size());
    for (size_t i = 0; i < colors.size(); i++) {
      _colors[i] = (uint32_t)colors[i];
    }
    [self _rebuildCachedColors];
    needsRedraw = YES;
  }

  [super updateProps:props oldProps:oldProps];
  if (needsRedraw) [self _setNeedsRedraw];
}

- (void)_mapGlyphs:(const std::vector<int32_t> &)codepoints {
  _glyphs.assign(codepoints.size(), 0);
  if (!_font) return;
  for (size_t i = 0; i < codepoints.size(); i++) {
    int32_t cp = codepoints[i];
    if (cp <= 0xFFFF) {
      UniChar ch = (UniChar)cp;
      CTFontGetGlyphsForCharacters(_font, &ch, &_glyphs[i], 1);
    } else {
      UniChar surr[2] = {
        (UniChar)(0xD800 + ((cp - 0x10000) >> 10)),
        (UniChar)(0xDC00 + ((cp - 0x10000) & 0x3FF))
      };
      CGGlyph pair[2] = {0, 0};
      CTFontGetGlyphsForCharacters(_font, surr, pair, 2);
      _glyphs[i] = pair[0];
    }
  }
}

- (void)_resolveFontIfMissing {
  if (_font || _fontFamily.length == 0) return;
  _font = NanoIconResolveFont(_fontFamily, _fontSize);
  if (!_font) return;
  const auto &viewProps = static_cast<const NanoIconViewProps &>(*_props);
  [self _mapGlyphs:viewProps.codepoints];
  _metricsValid = NO;
  [self _setNeedsRedraw];
}

- (void)_setNeedsRedraw {
  [self setNeedsDisplay];
}

- (void)dealloc {
  // _font is borrowed from static cache — do not release
  [sNanoIconLiveViews removeObject:self];
  [self _releaseCachedColors];
}

@end

Class<RCTComponentViewProtocol> NanoIconViewCls(void) {
  return NanoIconView.class;
}
