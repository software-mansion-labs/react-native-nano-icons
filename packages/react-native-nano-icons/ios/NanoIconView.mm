#import "NanoIconView.h"
#import <CoreText/CoreText.h>
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/RNNanoIconsSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNNanoIconsSpec/Props.h>

using namespace facebook::react;

// Forward-declare so the layer subclass can call the drawing method.
@interface NanoIconView ()
- (void)_drawIconInContext:(CGContextRef)context bounds:(CGRect)bounds;
@end

// Lightweight sublayer for inline-in-Text icons. Provides a shifted pixel
// buffer so the icon can overflow the Yoga frame without a full UIView.
@interface NanoIconDrawingLayer : CALayer
@property (nonatomic, weak) NanoIconView *owner;
@end

@implementation NanoIconDrawingLayer
- (void)drawInContext:(CGContextRef)ctx {
  [self.owner _drawIconInContext:ctx bounds:self.bounds];
}
@end

// Process-wide CTFontRef cache keyed by (fontFamily, fontSize).
// Avoids 1000× CTFontCreateWithName for identical (family, size) combos.
static CTFontRef NanoIconGetCachedFont(NSString *family, CGFloat size) {
  static NSMutableDictionary *cache;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ cache = [NSMutableDictionary new]; });

  NSString *key = [NSString stringWithFormat:@"%@:%.1f", family, size];
  id existing = cache[key];
  if (existing) return (__bridge CTFontRef)existing;

  CTFontRef font = CTFontCreateWithName((__bridge CFStringRef)family, size, NULL);
  if (font) cache[key] = (__bridge id)font;
  return font;
}

@implementation NanoIconView {
  CTFontRef _font;   // borrowed from static cache — do NOT CFRelease
  NSString *_fontFamily;
  CGFloat _fontSize;
  std::vector<CGGlyph> _glyphs;
  std::vector<uint32_t> _colors;
  std::vector<CGColorRef> _cachedCGColors;
  CGFloat _fitScale;
  CGPoint _baselinePosition;
  BOOL _metricsValid;

  // Inline-in-Text detection — resolved once on first layout, cached until reparenting.
  // Standalone icons (vast majority) skip the superview walk entirely after detection.
  BOOL _inlineDetected;
  BOOL _isInlineInText;
  UIView * __weak _paragraphView;
  CGFloat _cachedBaselineOffset;
  BOOL _baselineOffsetValid;

  // Drawing sublayer for inline icons — provides a shifted pixel buffer so the
  // icon can overflow the Yoga frame. Lighter than a UIView (no responder chain,
  // hit testing, or accessibility). Standalone icons draw directly via drawRect:.
  CALayer *_drawingLayer;
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

    // _drawingLayer is created lazily only when inline in Text
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

// Detect whether this icon is inline inside a <Text> component and, if so,
// compute the baseline offset in a single pass. Deferred to first layout
// (not didMoveToSuperview) because Fabric may assemble the hierarchy bottom-up.
// For standalone icons this completes in 1-3 class name checks with no
// ObjC runtime method resolution or attributed string reads.
- (void)_detectAndCacheInlineState {
  _inlineDetected = YES;
  _isInlineInText = NO;
  _paragraphView = nil;
  _cachedBaselineOffset = 0;
  _baselineOffsetValid = YES;

  // RCTParagraphComponentView is the immediate or near-immediate parent
  // when the icon is inside <Text>. Three levels covers all known layouts.
  UIView *current = self.superview;
  UIView *target = nil;
  for (int i = 0; i < 3 && current; i++) {
    if ([NSStringFromClass([current class]) isEqualToString:@"RCTParagraphComponentView"]) {
      target = current;
      break;
    }
    current = current.superview;
  }

  if (!target) return;

  NSAttributedString *attrStr = nil;
  if ([target respondsToSelector:@selector(attributedText)]) {
    attrStr = [target performSelector:@selector(attributedText)];
  }
  if (!attrStr || attrStr.length == 0) return;

  UIFont *f = [attrStr attribute:NSFontAttributeName atIndex:0 effectiveRange:nil];
  if (!f) return;

  _isInlineInText = YES;
  _paragraphView = target;

  // Derive the distance from this view's bottom edge to the text baseline.
  // Respects custom RN lineHeight (mapped to NSParagraphStyle.maximumLineHeight)
  // and any baseline offset applied by Fabric's text layout.
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

  _cachedBaselineOffset = MAX(0, posInLine - baselineFromLineTop);
}

// Lazily create the drawing sublayer for inline-in-Text icons.
// The sublayer's frame is shifted upward so the icon overflows the Yoga box.
- (void)_ensureDrawingLayer {
  if (_drawingLayer) return;
  NanoIconDrawingLayer *layer = [NanoIconDrawingLayer layer];
  layer.owner = self;
  layer.opaque = NO;
  layer.contentsScale = [UIScreen mainScreen].scale;
  [self.layer addSublayer:layer];
  _drawingLayer = layer;
}

// Re-detect inline state when the view moves to a new parent.
- (void)didMoveToSuperview {
  [super didMoveToSuperview];
  _inlineDetected = NO;
  _baselineOffsetValid = NO;
}

// Invalidate cached offset when size changes (text relayout).
- (void)setBounds:(CGRect)bounds {
  if (!CGSizeEqualToSize(self.bounds.size, bounds.size)) {
    _baselineOffsetValid = NO;
  }
  [super setBounds:bounds];
}

#pragma mark - Layout

// Standalone: no work beyond metrics validation (drawing via drawRect: on self).
// Inline: position the drawing sublayer with the cached baseline offset,
// recomputing only when bounds change or the view is reparented.
- (void)layoutSubviews {
  [super layoutSubviews];
  if (!_metricsValid) [self _updateMetrics];

  if (!_inlineDetected) {
    [self _detectAndCacheInlineState];
  }

  if (_isInlineInText) {
    if (!_baselineOffsetValid) {
      [self _detectAndCacheInlineState];
    }
    BOOL created = !_drawingLayer;
    [self _ensureDrawingLayer];
    CGRect newFrame = CGRectMake(0, -_cachedBaselineOffset,
                                 self.bounds.size.width, self.bounds.size.height);
    if (!CGRectEqualToRect(_drawingLayer.frame, newFrame)) {
      [CATransaction begin];
      [CATransaction setDisableActions:YES];
      _drawingLayer.frame = newFrame;
      [CATransaction commit];
    }
    // First layout after inline detection: the layer missed the initial
    // setNeedsDisplay from updateProps (which targeted self before detection).
    if (created) [_drawingLayer setNeedsDisplay];
  }
  // standalone: draws directly via drawRect: on self
}

#pragma mark - Drawing

// Standalone icons draw directly in this view's drawRect:.
- (void)drawRect:(CGRect)rect {
  if (_isInlineInText) return; // inline icons draw via _drawingLayer
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
    _font = NanoIconGetCachedFont(_fontFamily, _fontSize);
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
  if (needsRedraw) {
    if (_isInlineInText && _drawingLayer) {
      [_drawingLayer setNeedsDisplay];
    } else {
      [self setNeedsDisplay];
    }
  }
}

- (void)dealloc {
  // _font is borrowed from static cache — do not release
  [self _releaseCachedColors];
}

@end

Class<RCTComponentViewProtocol> NanoIconViewCls(void) {
  return NanoIconView.class;
}
