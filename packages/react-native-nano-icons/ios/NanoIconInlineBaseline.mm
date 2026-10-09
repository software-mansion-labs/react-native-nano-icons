#import "NanoIconInlineBaseline.h"
#import "NanoIconView.h"
#import <React/RCTVersion.h>
#import <React/RCTViewComponentView.h>
#import <react/renderer/textlayoutmanager/RCTAttributedTextUtils.h>
#import <objc/runtime.h>
#import <vector>

// RN <= 0.81 puts an inline view's bottom exactly on the text baseline.
// Since 0.82 (facebook/react-native#53341) the frame is `line bottom + descender
// of the attachment run's font`, and that run only carries the NSTextStorage
// default font, so the view lands below the baseline by an amount that
// depends on the text's font size and lineHeight.
static BOOL NanoIconReactNativePlacesInlineViewsOffBaseline(void) {
  static BOOL result;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSDictionary *version = RCTGetReactNativeVersion();
    NSInteger major = [version[RCTVersionMajor] integerValue];
    NSInteger minor = [version[RCTVersionMinor] integerValue];
    result = major > 0 || minor >= 82;
  });
  return result;
}

// The paragraph view is the direct superview of an inline icon; a couple of
// extra levels cover wrappers RN may insert. nil for standalone icons and on
// RN <= 0.81, so those never pay for a layout.
static void NanoIconInstallParagraphUpdateHook(Class paragraphClass);

UIView *NanoIconParagraphNeedingBaselineCorrection(UIView *view) {
  if (!NanoIconReactNativePlacesInlineViewsOffBaseline()) return nil;
  UIView *current = view.superview;
  for (int depth = 0; depth < 3 && current; depth++) {
    if ([NSStringFromClass([current class]) isEqualToString:@"RCTParagraphComponentView"]) {
      NanoIconInstallParagraphUpdateHook([current class]);
      return current;
    }
    current = current.superview;
  }
  return nil;
}

// Text is laid out inside the paragraph's content frame (bounds minus
// padding). RCTViewComponentView keeps it in a protected ivar.
static CGRect NanoIconContentFrame(UIView *paragraph) {
  static Ivar ivar = class_getInstanceVariable([RCTViewComponentView class], "_layoutMetrics");
  if (ivar) {
    const auto &metrics = *reinterpret_cast<const facebook::react::LayoutMetrics *>(
        reinterpret_cast<const uint8_t *>((__bridge const void *)paragraph) + ivar_getOffset(ivar));
    facebook::react::Rect content = metrics.getContentFrame();
    if (content.size.width > 0 && content.size.height > 0) {
      return CGRectMake(content.origin.x, content.origin.y, content.size.width, content.size.height);
    }
  }
  return paragraph.bounds;
}

@interface NanoIconParagraphBaselines : NSObject
@property (nonatomic, readonly) std::vector<CGPoint> &entries;
@end

@implementation NanoIconParagraphBaselines {
  std::vector<CGPoint> _entries;
}
- (std::vector<CGPoint> &)entries { return _entries; }
@end

static const void *kNanoIconParagraphBaselinesKey = &kNanoIconParagraphBaselinesKey;

static void NanoIconInvalidateIconsIn(UIView *view, int depth) {
  for (UIView *child in view.subviews) {
    if ([child isKindOfClass:[NanoIconView class]]) {
      [(NanoIconView *)child invalidateInlineBaseline];
    } else if (depth > 1) {
      NanoIconInvalidateIconsIn(child, depth - 1);
    }
  }
}

// A text change that keeps an icon's frame (same line bottom, different font
// or lineHeight) still moves the baseline, and RN only notifies children whose
// layout changed. The paragraph's state update is the one signal that covers
// every text change, so its icons are invalidated from there.
static void NanoIconInstallParagraphUpdateHook(Class paragraphClass) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    SEL selector = @selector(updateState:oldState:);
    Method method = class_getInstanceMethod(paragraphClass, selector);
    if (!method) return;
    using StateRef = const facebook::react::State::Shared &;
    auto original = reinterpret_cast<void (*)(id, SEL, StateRef, StateRef)>(method_getImplementation(method));
    IMP hooked = imp_implementationWithBlock(^(UIView *paragraph, StateRef state, StateRef oldState) {
      original(paragraph, selector, state, oldState);
      objc_setAssociatedObject(paragraph, kNanoIconParagraphBaselinesKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      NanoIconInvalidateIconsIn(paragraph, 3);
    });
    method_setImplementation(method, hooked);
  });
}

// Lays the paragraph out again the way RCTTextLayoutManager does (same
// container settings and lineHeight baseline offset) and records where TextKit
// put the baseline of every attachment. Layout stops after the last attachment.
static NanoIconParagraphBaselines *NanoIconLayOutBaselines(UIView *paragraph, NSAttributedString *text) {
  CGRect content = NanoIconContentFrame(paragraph);
  NSTextContainer *container = [[NSTextContainer alloc] initWithSize:content.size];
  container.lineFragmentPadding = 0;
  container.lineBreakMode = NSLineBreakByClipping;
  NSLayoutManager *layoutManager = [NSLayoutManager new];
  layoutManager.usesFontLeading = NO;
  [layoutManager addTextContainer:container];
  NSTextStorage *storage = [[NSTextStorage alloc] initWithAttributedString:text];
  RCTApplyBaselineOffset(storage);
  [storage addLayoutManager:layoutManager];

  __block NSUInteger lastAttachmentEnd = 0;
  [storage enumerateAttribute:NSAttachmentAttributeName
                      inRange:NSMakeRange(0, storage.length)
                      options:0
                   usingBlock:^(NSTextAttachment *attachment, NSRange range, __unused BOOL *stop) {
                     if (attachment) lastAttachmentEnd = NSMaxRange(range);
                   }];
  if (lastAttachmentEnd == 0) return nil;
  [layoutManager ensureLayoutForCharacterRange:NSMakeRange(0, lastAttachmentEnd)];

  NanoIconParagraphBaselines *baselines = [NanoIconParagraphBaselines new];
  std::vector<CGPoint> &entries = baselines.entries;
  [storage enumerateAttribute:NSAttachmentAttributeName
                      inRange:NSMakeRange(0, lastAttachmentEnd)
                      options:0
                   usingBlock:^(NSTextAttachment *attachment, NSRange range, __unused BOOL *stop) {
                     if (!attachment) return;
                     NSUInteger glyphIndex = [layoutManager glyphRangeForCharacterRange:range actualCharacterRange:NULL].location;
                     CGRect line = [layoutManager lineFragmentRectForGlyphAtIndex:glyphIndex effectiveRange:NULL];
                     CGPoint location = [layoutManager locationForGlyphAtIndex:glyphIndex];
                     entries.push_back(CGPointMake(content.origin.x + location.x,
                                                   content.origin.y + line.origin.y + location.y));
                   }];
  return baselines;
}

// One layout per paragraph per layout pass: the result is kept on the
// paragraph view until the next main-queue turn so sibling icons reuse it.
static NanoIconParagraphBaselines *NanoIconBaselinesForParagraph(UIView *paragraph) {
  NanoIconParagraphBaselines *cached = objc_getAssociatedObject(paragraph, kNanoIconParagraphBaselinesKey);
  if (cached) return cached;

  NSAttributedString *text = nil;
  if ([paragraph respondsToSelector:@selector(attributedText)]) {
    text = [paragraph performSelector:@selector(attributedText)];
  }
  if (text.length == 0) return nil;

  NanoIconParagraphBaselines *baselines = NanoIconLayOutBaselines(paragraph, text);
  if (!baselines) return nil;

  objc_setAssociatedObject(paragraph, kNanoIconParagraphBaselinesKey, baselines, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  __weak UIView *weakParagraph = paragraph;
  dispatch_async(dispatch_get_main_queue(), ^{
    UIView *strongParagraph = weakParagraph;
    if (strongParagraph) {
      objc_setAssociatedObject(strongParagraph, kNanoIconParagraphBaselinesKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
  });
  return baselines;
}

// Distance from the view's bottom edge down to the baseline RN meant it to
// sit on, rounded to the pixel grid. The attachment is matched by x; the
// nearest baseline resolves lines that start at the same x.
CGFloat NanoIconInlineBaselineOffset(UIView *view, UIView *paragraph) {
  NanoIconParagraphBaselines *baselines = NanoIconBaselinesForParagraph(paragraph);
  if (!baselines) return 0;

  CGRect frame = [view.superview convertRect:view.frame toView:paragraph];
  CGFloat bottom = CGRectGetMaxY(frame);
  CGFloat nearest = bottom;
  CGFloat nearestDistance = CGFLOAT_MAX;
  for (const CGPoint &baseline : baselines.entries) {
    if (fabs(baseline.x - frame.origin.x) > 1.5) continue;
    CGFloat distance = fabs(baseline.y - bottom);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = baseline.y;
    }
  }
  CGFloat scale = [UIScreen mainScreen].scale;
  return round((bottom - nearest) * scale) / scale;
}
