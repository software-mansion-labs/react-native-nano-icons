# React Native iOS: inline view placement inside `<Text>`

How RN positions a native view nested in `<Text>` (an `NSTextAttachment`) on iOS, per version, and why the view drifts from the text baseline. Sources read from `facebook/react-native` at the listed tags on 2026-10-08.

## Where the frame is computed

Fabric: `packages/react-native/ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTTextLayoutManager.mm`, `_measureTextStorage:` enumerates `NSAttachmentAttributeName` and builds `frame` from `glyphRect = [layoutManager boundingRectForGlyphRange:range inTextContainer:textContainer]` and `attachmentSize = attachment.bounds.size`.

Paper: `packages/react-native/Libraries/Text/Text/RCTTextShadowView.mm`, `layoutSubviewsWithContext:`.

Two formulas appear in the history:

- Formula A (descender): `y = glyphRect.origin.y + glyphRect.size.height - attachmentSize.height + font.descender`, `font` read from the attachment run.
- Formula B (TextKit baseline): `y = glyphRect.origin.y + [layoutManager locationForGlyphAtIndex:range.location].y - attachmentSize.height`.

## Version table

| RN | Fabric formula | Attachment run has `NSFontAttributeName`? | lineHeight baseline offset (`RCTApplyBaselineOffset`) |
|---|---|---|---|
| 0.74.0 | A | No | whole string, applied in `RCTNSAttributedStringFromAttributedString` |
| 0.76.0 | B if `enableAlignItemsBaselineOnFabricIOS` (default true), else A | No | whole string, applied on the `NSTextStorage` in `_textStorageAndLayoutManagerWithAttributesString:` |
| 0.78.0 | B (flag removed, #48607) | No | whole string |
| 0.80.0 | B | No | whole string |
| 0.81.0 | B | No | whole string by default; per line when `enableIOSTextBaselineOffsetPerLine` (default false, #51344) |
| 0.82.0 | A (#53341, commit 6da351a5) | No | same as 0.81 |
| 0.83.0 | A | No | same |
| 0.84.0 | A | No | same |
| 0.86.0 | A | No | same |
| 0.88.0-rc.4 | A | No | same, plus `enableIOSCompressedTextFrameAdjustment` (default false) lets the offset apply when `lineHeight < font.lineHeight` |
| main | A | No | same as 0.88 |
| Paper (all tags 0.74-0.86) | A, each term passed through `RCTRoundPixelValue` | No | whole string, `postprocessAttributedText:` |

"Attachment run has font": in Fabric the attachment fragment is built by `RCTNSAttributedStringFragmentFromFragment` in `RCTAttributedTextUtils.mm` as `[[NSMutableAttributedString attributedStringWithAttachment:attachment] mutableCopy]`; the only attribute added afterwards is `RCTAttributedStringEventEmitterKey`. In Paper, `RCTBaseTextShadowView attributedTextWithBaseTextAttributes:` appends `[NSAttributedString attributedStringWithAttachment:]` plus `RCTBaseTextShadowViewEmbeddedShadowViewAttributeName`; `RCTTextShadowView attributedTextWithMeasuredAttachmentsThatFitSize:` later replaces the attachment object. No font is ever set on the run on either architecture, so `font` in formula A is `nil` and `font.descender` evaluates to `0`.

Baseline offset: `RCTApplyBaselineOffsetForRange` computes `(maximumLineHeight - maximumFontLineHeight) / 2` from the paragraph style and the fonts in the range and adds `NSBaselineOffsetAttributeName` over the range (including attachment runs). It returns early when `lineHeight` is not set, or when `lineHeight < font.lineHeight` (unless `enableIOSCompressedTextFrameAdjustment`).

Other relevant pieces, unchanged 0.74 to main:

- `ParagraphShadowNode.cpp`, `getContentWithMeasuredAttachments`: the child is measured, then `size.width += 0.01f; size.height += 0.01f; size = roundToPixel<&ceil>(size, pointScaleFactor)`. This is the size written into `attachment.bounds`, so a child whose measured height already lies on the pixel grid grows by one physical pixel.
- `ParagraphShadowNode.cpp`, `layout`: `attachmentSize = roundToPixel<&ceil>(frame.size)`, `attachmentOrigin = roundToPixel<&round>(frame.origin)`; the origin is rounded to the nearest pixel, the size is ceiled again.
- Android, `TextLayoutManager.kt` (`.java` before 0.81): `placeholderTopPosition = layout.getLineBaseline(line) - placeholderHeight`. The view bottom sits exactly on the Android line baseline.

## Analysis of formula A with `font == nil`

With `font.descender == 0`:

```
frame.origin.y = glyphRect.origin.y + glyphRect.size.height - attachmentSize.height
frame.maxY     = glyphRect.maxY
```

The view bottom is pinned to the bottom of whatever `boundingRectForGlyphRange:` returns for the single attachment glyph, and nothing in the formula references the baseline.

What that rect is vertically in TextKit 1 is not documented by Apple (the Discussion section of `boundingRect(forGlyphRange:in:)` is empty). Two candidates:

1. Line-fragment height: `glyphRect` spans the line fragment used rect of the line containing the glyph. Then `frame.maxY = lineFragment.maxY = baseline + |descender| (+ half of any extra lineHeight)`, so the view sits `|descender|` below the baseline, more with `lineHeight > font.lineHeight`. Formula A was written for this case: with a real font, `+ font.descender` (negative) pulls the bottom back up onto the baseline. RN's own PR #46172 treats `glyphRect.origin.y` as the line origin, which also assumes this case.
2. Attachment cell rect: `glyphRect` equals the attachment bounds placed by TextKit, whose origin sits on the baseline (`attachment.bounds.origin == CGPointZero`). Then `frame.maxY = baseline` already and formula A with a real font would overshoot upward by `|descender|`.

Which case holds, and whether `NSBaselineOffsetAttributeName` on the attachment run moves the rect, is to be verified empirically. The pre-0.82 formula B avoided the question by reading the glyph baseline directly (`locationForGlyphAtIndex:` is relative to the line fragment origin, hence the `glyphRect.origin.y` term added in #46172).

Secondary drift comes from the pixel rounding above: `+0.01` then `ceil` on the size, `round` on the origin, applied after the TextKit value, so the bottom edge can move by up to one physical pixel independently of the baseline.

## Verified on device (RN 0.83.4, iOS 27 simulator, 3x)

Measured by rebuilding the paragraph's `NSTextStorage` from `RCTParagraphComponentView.attributedText` with RN's container setup and comparing against the frame RN assigned to the nested view:

- `boundingRectForGlyphRange:` for a lone attachment glyph is case 1: `origin.y` is the line fragment top and `size.height` is the line fragment height (e.g. `{{305.24, 224}, {33.33, 32}}` for a 32 pt `lineHeight`).
- The attachment run does carry a font at measurement time: `NSTextStorage` attribute fixing adds the default `Helvetica 12`, so `font.descender` is about `-2.67` pt (pixel-rounded), not 0. Formula A therefore puts the view bottom at `line bottom - 2.67`, which equals the baseline only for a 12 pt Helvetica line.
- Resulting view-bottom-to-baseline error: 5.5 pt at `fontSize 22 / lineHeight 32`, 3.3 pt at 25 pt without `lineHeight`, 9.8 pt at 34 pt, 6.3–6.8 pt on lines mixing 22 pt and 35 pt text. `NSBaselineOffsetAttributeName` from `RCTApplyBaselineOffset` is present on the attachment run and `locationForGlyphAtIndex:` already reflects it (baseline 23.82 from the line top for 22 pt text in a 32 pt line).
- On RN 0.81.5 (formula B) the same reconstruction reports the view bottom exactly on the baseline (offset 0.00).

## How RN could fix it

(a) Return to formula B. `locationForGlyphAtIndex:` is TextKit's own baseline for that glyph and does not depend on attributes RN forgot to set. 0.82 dropped it in #53341 because with `lineHeight` set the inline view was misaligned (issue #53092, RN 0.79.5); the PR body gives no root cause, only "use glyph height instead of baseline from layout manager" to match Paper. The likely interaction is the whole-string `NSBaselineOffsetAttributeName` from `RCTApplyBaselineOffset`, which shifts the text glyphs but is applied to the string before measurement in a way formula B did not account for. A fix on this path would keep formula B and add the baseline offset of the run (`[textStorage attribute:NSBaselineOffsetAttributeName ...]`) to the computed baseline, or verify that `locationForGlyphAtIndex:` already includes it.

(b) Keep formula A and copy the parent fragment's text attributes (at least `NSFontAttributeName`) onto the attachment run in `RCTNSAttributedStringFragmentFromFragment`, so `font.descender` is the real descender. That restores the intent of formula A for the no-`lineHeight` case. With a custom `lineHeight`, `RCTApplyBaselineOffset` moves the baseline by `(lineHeight - font.lineHeight) / 2` through `NSBaselineOffsetAttributeName`; formula A does not read that attribute, so the view would still be off by the offset unless the formula also adds it (or TextKit folds it into `glyphRect`, see "to be verified" above). Per-line mode (`enableIOSTextBaselineOffsetPerLine`) changes the value per line but not this gap. Setting the font on the attachment run also changes `maximumFontLineHeight` enumeration in `RCTApplyBaselineOffsetForRange` only if the attachment font is larger than the text fonts, which is not the case when copying the parent's font.

Either fix leaves the `+0.01`/`ceil` size inflation in `ParagraphShadowNode.cpp` in place; aligning the bottom edge exactly also needs the inflated height to be accounted for (the view is one pixel taller than the measured child).

## Related issues (facebook/react-native, since 2025)

The GitHub search API was not available from this environment; the list below comes from the issues this document's PRs reference plus a title scan of recent issues.

| Issue | Status | Title |
|---|---|---|
| #53092 | closed 2026-03-26 (stale bot) | Nested Text Alignment Broken In New Architecture iOS when `lineHeight` is provided |
| #54422 | open (2025-11-05) | Fractional metrics with inline Views cause inconsistent Text wrapping |
| #52941 | closed 2025-08-08 | alignItems: 'center' behaves differently on multiline Text under RN 0.79 |
| #58315 | open (2026-09-03) | iOS: nested Text with mixed fonts + lineHeight paints glyphs shifted/clipped under tail truncation |
| #54826 | open (2025-12-09) | Padding does not apply to Text nested inside another Text (iOS and Android) |

Issue #53092 comment thread (2025-09-18): the PR author notes RN aligns the nested `View` to the parent baseline, not the nested text, and suggests `transform: [{translateY: <descender>}]` as a workaround.

## Links

- Commit 6da351a5 "fix(iOS)(Fabric) inline view alignment inside of a Text with line height": https://github.com/facebook/react-native/commit/6da351a5ed80a10138a5558afcb380410c8a93c9 (merged 2025-08-20, first in v0.82.0; not in v0.81.0)
- PR #53341: https://github.com/facebook/react-native/pull/53341
- Issue #53092: https://github.com/facebook/react-native/issues/53092
- PR #45102 (formula B introduced with `enableAlignItemsBaselineOnFabricIOS`): https://github.com/facebook/react-native/pull/45102
- PR #46172 (adds `glyphRect.origin.y` line offset to formula B): https://github.com/facebook/react-native/pull/46172
- PR #48607 (removes the flag): https://github.com/facebook/react-native/pull/48607
- PR #51344 (`enableIOSTextBaselineOffsetPerLine`): https://github.com/facebook/react-native/pull/51344
- Apple, `boundingRect(forGlyphRange:in:)`: https://developer.apple.com/documentation/uikit/nslayoutmanager/boundingrect(forglyphrange:in:)
- Apple, `location(forGlyphAt:)` (relative to line fragment origin): https://developer.apple.com/documentation/appkit/nslayoutmanager/1403239-locationforglyphatindex
- Apple, `attachmentBounds(for:proposedLineFragment:glyphPosition:characterIndex:)`: https://developer.apple.com/documentation/uikit/nstextattachmentcontainer
