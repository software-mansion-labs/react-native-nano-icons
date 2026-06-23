# PR Plan — Support custom asset-catalog symbols in react-navigation

> For a future agent: this is a self-contained plan to upstream **one PR** with
> **two related changes** to **react-navigation/react-navigation**, both fixing
> the same gap — react-navigation can't reference a custom symbol/image that
> lives in the iOS asset catalog (compiled by `actool`), only Apple's built-ins.
>
> **The two changes (keep them in one PR — same theme, "custom catalog symbols"):**
> 1. **New icon type** — add `{ type: 'sfSymbolAsset', name }` to the `Icon`
>    union (`@react-navigation/elements`) and route it in `getPlatformIcon`
>    (`@react-navigation/bottom-tabs`) to screens' name-based `xcasset` type
>    (→ `[UIImage imageNamed:]`). A platform-specific, by-name type that mirrors
>    `sfSymbol` / `materialSymbol` — the *app-provided* counterpart.
> 2. **`<SFSymbol>` component** — `@react-navigation/native`
>    `ReactNavigationSFSymbolView.swift`: fall back to `UIImage(named:)` when
>    `UIImage(systemName:)` returns nil, so the component (and its
>    rendering-mode/effect props) work with custom catalog symbols, not just the
>    built-in library.
>
> Both behaviors are verified working in `examples/BareReactNativeExample` via the
> interim Yarn patches (see "Local patches"). The interim patch implements the
> *fallback* `image` + `{ uri }` routing (adding a real `Icon` type locally would
> also require patching elements' types); the PR's **preferred** shape is the
> explicit `sfSymbolAsset` type below.

## Context / problem

react-navigation 8 native tabs take an `Icon` descriptor
(`@react-navigation/elements`). Its members:

- `{ type: 'sfSymbol', name }` → iOS built-ins via `[UIImage systemImageNamed:]`
  (Apple's library only — a custom `nano.swm` returns nil → blank).
- `{ type: 'materialSymbol', name }` → Android built-ins.
- `{ type: 'image', source }` → an image *source*. `getPlatformIcon` maps it to
  screens' `templateSource` / `imageSource`, which load via **`RCTImageLoader`**.
  `RCTImageLoader` only handles file / remote / packager(`require`) images — it
  **cannot resolve an asset-catalog or drawable name**, so `{ uri: 'nano.swm' }`
  renders **blank** (even though the type doc says `{ uri }` is "Drawable resource
  or xcasset").

So there is **no working way** to reference a custom asset-catalog symbol/image —
yet react-native-screens already exposes the right name-based native targets:

```ts
// react-native-screens
type PlatformIconIOSXcasset = { type: 'xcasset'; name: string };     // -> [UIImage imageNamed:]
type PlatformIconAndroid    = { type: 'drawableResource'; name: string }; // -> drawable by name
```

Verified empirically: our assets compile into `Assets.car` correctly (`assetutil`
shows `"Vector Glyph"` for symbolsets, `"Vector"` for imagesets), `imageNamed:`
resolves them — the only gap is the JS layer never emitting the `xcasset` target.

## Change 1 — new `sfSymbolAsset` icon type

react-navigation deliberately keeps icon types **platform-specific and by-name**
(`sfSymbol` for iOS built-ins, `materialSymbol` for Android built-ins). The custom
forged counterpart should follow that pattern rather than a generic/unified type.

**`@react-navigation/elements` (`src/types.tsx`)** — add to the `Icon` union:

```ts
type IconSFSymbolAsset = {
  /** A custom SF Symbol / image forged into the iOS asset catalog
   *  (Images.xcassets), referenced by name. */
  type: 'sfSymbolAsset';
  name: string;
};
// Future (lands with an Android Material / vector-drawable forge):
// type IconMaterialSymbolAsset = { type: 'materialSymbolAsset'; name: string };

export type Icon =
  | IconSfSymbol
  | IconMaterialSymbol
  | IconImage
  | IconSFSymbolAsset;
```

**`@react-navigation/bottom-tabs` (`src/views/BottomTabViewNativeImpl.tsx`)** —
add a case to `getPlatformIcon` (grep the repo for other navigators with their own
copy):

```ts
case 'sfSymbolAsset':
  return { ios: { type: 'xcasset', name: icon.name }, android: undefined, shared: undefined };
// future:
// case 'materialSymbolAsset':
//   return { ios: undefined, android: { type: 'drawableResource', name: icon.name }, shared: undefined };
```

Native targets already exist in screens, so no native change for this part.

### One type covers BOTH our iOS outputs (verified)

`sfSymbolAsset` handles both forged iOS kinds because they share **one** native
lookup — `[UIImage imageNamed:name]` (screens `xcasset`). The render mode is
**baked into each asset's `Contents.json`** at forge time, not chosen at call time:

- `.symbolset` (mono)      → `symbol-rendering-intent: template`        → symbol image → tab bar **tints** it.
- `.imageset`  (multicolor) → `template-rendering-intent: original` (+ `preserves-vector-representation`) → `.alwaysOriginal` image → **full colors**.

So the JS type needs **no `tinted` flag** and the consumer never branches by kind.
(nano-icons keeps the two organized via separate manifests — `TabiconsSymbols` for
symbolsets, `MciconSymbols` for imagesets.)

### Why this naming

1. **Platform-specific, like the library** — parallels `sfSymbol` / `materialSymbol`;
   the app-provided, by-name counterpart. (A unified `asset` type was considered and
   rejected: react-navigation does not unify icon naming.)
2. **Resembles what we pass** — "SFSymbol" = the kind, "Asset" = app-provided / by
   name from the catalog.
3. **No heuristic** — explicit type, so no `{ uri }`-scheme sniffing to tell a
   resource name from a real image source.

## Files to change

- `packages/elements/src/types.tsx` — add `IconSFSymbolAsset` to the `Icon` union.
- `packages/bottom-tabs/src/views/BottomTabViewNativeImpl.tsx` — `getPlatformIcon`
  case. (Confirm source still matches — the alpha moves fast.)
- Optionally mirror in other navigators with their own `getPlatformIcon`.

## Design notes / fallbacks (raise in the PR description)

- **Naming alternative** if maintainers prefer the platform-native term: expose
  screens' own names directly — `{ type: 'xcasset', name }` (+ future `'drawable'`).
  `sfSymbolAsset` is the recommendation; `xcasset`/`drawable` is the faithful alt.
- **Minimal fallback** if a new type is rejected entirely: fix the existing
  `image` + `{ uri }` path to route a schemeless `{ uri }` to xcasset /
  drawableResource (honoring the documented-but-broken "Drawable resource or
  xcasset" contract). This is what our interim patch does — keep it ready as the
  smaller ask. It reintroduces a `{ uri }`-scheme heuristic, which is the main
  reason the explicit type is preferred.
- **Android (future):** add `materialSymbolAsset` → `drawableResource` when the
  Android forge lands. Android drawable names are `[a-z0-9_]` (no dots/uppercase);
  our names use dots (`nano.swm`, `heart.fill`). Decide where the `nano.swm` →
  `nano_swm` mapping lives — nano-icons' manifest exposing a platform value, or
  normalization in screens. Flag in the PR.

## Testing

- Unit: `getPlatformIcon({ type: 'sfSymbolAsset', name: 'foo' })` →
  `{ ios: { type: 'xcasset', name: 'foo' }, android: undefined, shared: undefined }`.
- Example app: a tab with `{ type: 'sfSymbolAsset', name: '<symbolset>' }` renders
  template-tinted; `{ type: 'sfSymbolAsset', name: '<imageset>' }` renders in
  original colors — both via the one `imageNamed:`/xcasset path.

## Change 2 — `<SFSymbol>` component (`@react-navigation/native`)

The exported `<SFSymbol>` component renders via a native Fabric view whose Swift
impl (`ios/ReactNavigationSFSymbolView.swift`, `symbolImage(...)`) builds the
image **only** with `UIImage(systemName:)` — Apple's built-in library. A custom
catalog symbol name (e.g. `nano.home`) returns nil ⇒ the component renders
**blank**. So `<SFSymbol name="nano.home" renderingMode="palette" colors={…} />`
shows nothing today.

**Fix:** in `symbolImage(...)`, fall back to `UIImage(named:)` (asset catalog)
when `systemName:` is nil, then apply the already-built `SymbolConfiguration`
so the custom symbol gets the same rendering-mode treatment (monochrome /
hierarchical / palette / multicolor / weight / scale):

```swift
// variableValue branch: only return when the system image resolves, else fall through
if #available(iOS 16.0, *) {
  if let systemImage = UIImage(systemName: name, variableValue: Double(variableValue), configuration: configuration) {
    return systemImage
  }
}
// …
return UIImage(systemName: name, withConfiguration: configuration)
  ?? UIImage(named: name)?.applyingSymbolConfiguration(configuration)
```

**File:** `packages/native/ios/ReactNavigationSFSymbolView.swift`. (The `.mm`
host needs no change — same JS props, same native view.)

**Notes for reviewers / edge cases:**
- A compiled custom symbol (`actool`-generated `.symbolset`) IS a real symbol
  image, so `applyingSymbolConfiguration` works on it — hierarchical/palette
  tiers render from the symbol's layer annotations. (Distinct color tiers need a
  *multi-layer* symbol; a single-layer symbol just takes the primary color.)
- `UIImage(named:)` also returns non-symbol catalog images; `applyingSymbolConfiguration`
  is a no-op on those, so behavior degrades gracefully.
- Pure JS/`systemName:` behavior is unchanged — the fallback only triggers when
  the system lookup fails.

**Testing:** render `<SFSymbol name="<custom catalog symbol>" />` in monochrome
+ a rendering mode; confirm it draws (vs blank). Verified in
`examples/BareReactNativeExample/screens/VariantScreens.tsx` (System tab).

## Local patches (interim shim in this repo)

```
.yarn/patches/@react-navigation-bottom-tabs-npm-8.0.0-alpha.38-*.patch   # interim Change 1 (JS, {uri} routing)
.yarn/patches/@react-navigation-native-npm-8.0.0-alpha.32-*.patch        # Change 2 (Swift)
```

- The **bottom-tabs** patch implements the *fallback* approach (schemeless
  `image` + `{ uri }` → xcasset/drawableResource) because adding a real
  `sfSymbolAsset` type locally would also require patching elements' type defs.
  The PR should prefer the explicit `sfSymbolAsset` type; port the routing logic
  accordingly.
- The **native** patch maps 1:1 to `ReactNavigationSFSymbolView.swift` (Change 2).
- Once shipped upstream, remove both patches + the two `patch:` entries in
  `examples/BareReactNativeExample/package.json`, and switch the example's
  `xcasset(name)` helper in `navigation/Tabs.tsx` from
  `{ type:'image', source:{uri:name} }` to `{ type:'sfSymbolAsset', name }`.

## Repo / submission details

- Repo: `react-navigation/react-navigation` (monorepo). Packages touched:
  `packages/elements` (Icon type) + `packages/bottom-tabs` (routing) for Change 1;
  `packages/native` for Change 2.
- **One PR, both changes** — theme: *"support custom asset-catalog symbols, not
  just Apple's built-in SF Symbol library."*
- Follow their contribution guide (changeset/commit conventions, run
  `yarn typescript` + `yarn lint` + tests). The Swift change needs an iOS example
  build to validate (no JS test harness for it).
</content>
