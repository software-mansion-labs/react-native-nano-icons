#import "NanoIconView.h"
#import "NanoIconFontResolver.h"
#import <CoreText/CoreText.h>
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/RNNanoIconsSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNNanoIconsSpec/Props.h>
#import "NanoIconInlineBaseline.h"

using namespace facebook::react;

// Forward-declare so the layer subclass can call the drawing method.
@interface NanoIconView ()
- (void)_resolveFontIfMissing;
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
  // Unresolved layer colors — may be trait-dependent (DynamicColorIOS, PlatformColor).
  NSArray<UIColor *> *_layerColors;
  // _layerColors resolved against the current trait collection.
  std::vector<CGColorRef> _cachedCGColors;
  CGFloat _fitScale;
  CGPoint _baselinePosition;
  BOOL _metricsValid;

  // Inline-in-Text detection — resolved once on first layout, cached until reparenting.
  // Standalone icons (vast majority) skip the superview walk entirely after detection.
  BOOL _paragraphResolved;
  UIView * __weak _paragraph;
  CGFloat _baselineOffset;
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
    NanoIconTrackLiveView(self);

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

- (void)invalidateInlineBaseline {
  _baselineOffsetValid = NO;
  [self setNeedsLayout];
}

// The baseline offset depends on where RN placed the view, so a new frame
// invalidates it.
- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics {
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  if (layoutMetrics.frame != oldLayoutMetrics.frame) {
    _baselineOffsetValid = NO;
  }
}

// Lazily create the drawing sublayer for inline-in-Text icons.
// The sublayer's frame is shifted upward so the icon overflows the Yoga box.
- (void)_ensureDrawingLayer {
  if (_drawingLayer) return;
  NanoIconDrawingLayer *layer = [NanoIconDrawingLayer layer];
  layer.owner = self;
  layer.opaque = NO;
  layer.needsDisplayOnBoundsChange = YES;
  layer.contentsScale = [UIScreen mainScreen].scale;
  [self.layer addSublayer:layer];
  _drawingLayer = layer;
}

// Reset inline state when the view moves to a new parent.
- (void)didMoveToSuperview {
  [super didMoveToSuperview];
  _paragraphResolved = NO;
  _paragraph = nil;
  _baselineOffsetValid = NO;
}

// _baselineOffset and _fitScale are both derived from bounds.
- (void)setBounds:(CGRect)bounds {
  if (!CGSizeEqualToSize(self.bounds.size, bounds.size)) {
    _baselineOffsetValid = NO;
    _metricsValid = NO;
  }
  [super setBounds:bounds];
}

#pragma mark - Layout

- (void)layoutSubviews {
  [super layoutSubviews];
  if (!_metricsValid) [self _updateMetrics];
  if (!_paragraphResolved) {
    _paragraph = NanoIconParagraphNeedingBaselineCorrection(self);
    _paragraphResolved = YES;
  }
  if (!_baselineOffsetValid) {
    _baselineOffset = _paragraph ? NanoIconInlineBaselineOffset(self, _paragraph) : 0;
    _baselineOffsetValid = YES;
  }
  [self _layoutDrawingLayer];
}

// Standalone icons draw in drawRect:. An icon that needs a baseline correction
// draws in a sublayer shifted by the offset instead, so it can overflow the
// Yoga frame without moving the view itself.
- (void)_layoutDrawingLayer {
  if (_baselineOffset == 0) {
    if (_drawingLayer) {
      [_drawingLayer removeFromSuperlayer];
      _drawingLayer = nil;
      [self setNeedsDisplay];
    }
    return;
  }
  BOOL created = !_drawingLayer;
  [self _ensureDrawingLayer];
  CGRect frame = CGRectMake(0, -_baselineOffset, self.bounds.size.width, self.bounds.size.height);
  if (!CGRectEqualToRect(_drawingLayer.frame, frame)) {
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    _drawingLayer.frame = frame;
    [CATransaction commit];
  }
  if (created) [_drawingLayer setNeedsDisplay];
}

#pragma mark - Drawing

// Standalone icons draw directly in this view's drawRect:.
- (void)drawRect:(CGRect)rect {
  if (_drawingLayer) return;
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

// Resolve the layer colors against the current traits into cached CGColorRefs.
// Resolving up front (rather than relying on UIKit's current trait collection at
// draw time) keeps the CALayer inline-in-Text path correct — CoreAnimation does
// not install a trait collection around -drawInContext:.
- (void)_rebuildCachedColors {
  [self _releaseCachedColors];
  UITraitCollection *traits = self.traitCollection;
  _cachedCGColors.resize(_layerColors.count);
  for (NSUInteger i = 0; i < _layerColors.count; i++) {
    UIColor *resolved = [_layerColors[i] resolvedColorWithTraitCollection:traits];
    _cachedCGColors[i] = CGColorRetain(resolved.CGColor);
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
    NSMutableArray<UIColor *> *layerColors = [NSMutableArray arrayWithCapacity:colors.size()];
    for (size_t i = 0; i < colors.size(); i++) {
      UIColor *color = RCTUIColorFromSharedColor(colors[i]);
      [layerColors addObject:color ?: [UIColor blackColor]];
    }
    _layerColors = layerColors;
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

// Trait-dependent colors (DynamicColorIOS, PlatformColor) resolve to a different
// CGColor when the interface style or contrast changes. Fabric does not re-send
// props for that, so re-resolve and redraw here.
- (void)traitCollectionDidChange:(UITraitCollection *)previousTraitCollection {
  [super traitCollectionDidChange:previousTraitCollection];

  if (_layerColors.count == 0) return;
  if (![self.traitCollection hasDifferentColorAppearanceComparedToTraitCollection:previousTraitCollection]) {
    return;
  }

  [self _rebuildCachedColors];
  [self _setNeedsRedraw];
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
  if (_drawingLayer) {
    [_drawingLayer setNeedsDisplay];
  } else {
    [self setNeedsDisplay];
  }
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
