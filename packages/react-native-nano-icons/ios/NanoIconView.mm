#import "NanoIconView.h"
#import <CoreText/CoreText.h>
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/RNNanoIconsSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNNanoIconsSpec/Props.h>

using namespace facebook::react;

// Drawing canvas that can be shifted outside the Yoga frame.
@interface NanoIconDrawingView : UIView
@property (nonatomic, copy) void (^drawBlock)(CGContextRef, CGRect);
@end

@implementation NanoIconDrawingView
- (instancetype)initWithFrame:(CGRect)frame {
    if (self = [super initWithFrame:frame]) {
        self.opaque = NO;
        self.backgroundColor = [UIColor clearColor];
        self.userInteractionEnabled = NO;
    }
    return self;
}
- (void)drawRect:(CGRect)rect {
    if (self.drawBlock) {
        CGContextRef ctx = UIGraphicsGetCurrentContext();
        if (ctx) self.drawBlock(ctx, self.bounds);
    }
}
@end

@implementation NanoIconView {
  CTFontRef _font;
  NSString *_fontFamily;
  CGFloat _fontSize;
  std::vector<CGGlyph> _glyphs;
  std::vector<uint32_t> _colors;
  std::vector<CGColorRef> _cachedCGColors;
  CGFloat _fitScale;
  CGPoint _baselinePosition;
  BOOL _metricsValid;
  NanoIconDrawingView *_drawingView;
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const NanoIconViewProps>();
    _props = defaultProps;
    self.opaque = NO;
    self.backgroundColor = [UIColor clearColor];
    self.clipsToBounds = NO;

    _fitScale = 1.0;
    _baselinePosition = CGPointZero;

    _drawingView = [[NanoIconDrawingView alloc] initWithFrame:self.bounds];
    __weak __typeof(self) weakSelf = self;
    _drawingView.drawBlock = ^(CGContextRef context, CGRect bounds) {
      [weakSelf _drawIconInContext:context bounds:bounds];
    };
    [self addSubview:_drawingView];
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

// Distance from this view's bottom edge to the parent text baseline.
// Returns 0 when standalone or when the icon is taller than the text line.
- (CGFloat)_inlineBaselineOffset {
  UIView *current = self.superview;
  NSAttributedString *attrStr = nil;
  while (current) {
    if ([current respondsToSelector:@selector(attributedText)]) {
      attrStr = [current performSelector:@selector(attributedText)];
      if (attrStr.length > 0) break;
    }
    current = current.superview;
  }
  if (!attrStr) return 0;

  UIFont *f = [attrStr attribute:NSFontAttributeName atIndex:0 effectiveRange:nil];
  if (!f) return 0;

  NSParagraphStyle *style = [attrStr attribute:NSParagraphStyleAttributeName
                                       atIndex:0 effectiveRange:nil];
  CGFloat lineHeight = (style && style.maximumLineHeight > 0)
                     ? style.maximumLineHeight : f.lineHeight;

  NSNumber *bOff = [attrStr attribute:NSBaselineOffsetAttributeName
                              atIndex:0 effectiveRange:nil];
  CGFloat baselineFromLineTop = f.ascender - (bOff ? bOff.doubleValue : 0);

  CGFloat frameBottom = self.frame.origin.y + self.frame.size.height;
  CGFloat posInLine = fmod(frameBottom, lineHeight);
  if (posInLine < 0.01) posInLine = lineHeight;

  return MAX(0, posInLine - baselineFromLineTop);
}

#pragma mark - Layout

- (void)layoutSubviews {
  [super layoutSubviews];
  if (!_metricsValid) [self _updateMetrics];

  CGFloat offset = [self _inlineBaselineOffset];
  _drawingView.frame = CGRectMake(0, -offset,
                                  self.bounds.size.width, self.bounds.size.height);
}

#pragma mark - Drawing

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
    if (_font) { CFRelease(_font); _font = NULL; }
    _fontFamily = [NSString stringWithUTF8String:newViewProps.fontFamily.c_str()];
    _fontSize = newViewProps.fontSize;
    _font = CTFontCreateWithName((__bridge CFStringRef)_fontFamily, _fontSize, NULL);
    _metricsValid = NO;
    fontChanged = YES;
    needsRedraw = YES;
  }

  // Map Unicode codepoints to font glyph IDs, handling surrogate pairs for codepoints > 0xFFFF.
  if (fontChanged || oldViewProps.codepoints != newViewProps.codepoints) {
    const auto &codepoints = newViewProps.codepoints;
    _glyphs.resize(codepoints.size());
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
  if (needsRedraw) [_drawingView setNeedsDisplay];
}

- (void)dealloc {
  if (_font) CFRelease(_font);
  [self _releaseCachedColors];
}

@end

Class<RCTComponentViewProtocol> NanoIconViewCls(void) {
  return NanoIconView.class;
}
