# Font pipeline benchmark

Measurements of the font compiler on the eight icon sets under `test_icons/`. Regenerate with:

```sh
yarn build
yarn benchmark:fonts --runs 5 --label <name> --out <name>.json
yarn benchmark:fonts --compare before.json after.json
```

The script compiles every set N times in sequence, without linking into a native project, and reports the median wall time, the TTF size, the size after deflate at level 9 (what an APK or IPA stores), and whether every run produced byte-identical output.

## Quadratic conversion and deterministic builds

Comparison of `main` (`6adf202`) with the cubic-to-quadratic conversion at a 1/512 em error bound, `post` table format 3, and fixed `head` timestamps. Apple M4 Pro, Node 25.6.0, 5 runs per set.

| Set                    | Icons | TTF before | TTF after |      Δ | Deflated before | Deflated after |      Δ |
| ---------------------- | ----: | ---------: | --------: | -----: | --------------: | -------------: | -----: |
| MaterialIcons baseline | 2,191 |    356,600 |   311,500 | -12.6% |         183,791 |        164,472 | -10.5% |
| MaterialIcons outline  | 2,191 |    395,484 |   345,200 | -12.7% |         204,567 |        183,617 | -10.2% |
| MaterialIcons round    | 2,191 |    473,760 |   422,452 | -10.8% |         239,650 |        217,734 |  -9.1% |
| MaterialIcons sharp    | 2,191 |    321,236 |   277,800 | -13.5% |         170,472 |        151,480 | -11.1% |
| MaterialIcons twotone  | 2,191 |    530,712 |   460,684 | -13.2% |         265,481 |        237,391 | -10.6% |
| SWMIcons outline       |   275 |    109,312 |   107,096 |  -2.0% |          29,801 |         28,620 |  -4.0% |
| SWMIcons duotone       |   275 |    120,168 |   115,604 |  -3.8% |          36,600 |         34,124 |  -6.8% |
| SWMIcons curved        |   275 |    104,728 |   102,524 |  -2.1% |          32,798 |         31,597 |  -3.7% |

The SWM sets are drawn mostly with straight segments and arcs that were already quadratic, so their savings come from the `post` table alone. The Material sets are cubic-heavy.

### Build time

| Set                    | Before, median ms | After, median ms |     Δ |
| ---------------------- | ----------------: | ---------------: | ----: |
| MaterialIcons baseline |             2,762 |            2,587 | -6.3% |
| MaterialIcons outline  |             3,053 |            3,030 | -0.8% |
| MaterialIcons round    |             3,951 |            3,982 | +0.8% |
| MaterialIcons sharp    |             2,291 |            2,457 | +7.2% |
| MaterialIcons twotone  |             3,758 |            3,887 | +3.4% |
| SWMIcons outline       |             1,360 |            1,444 | +6.2% |
| SWMIcons duotone       |             1,430 |            1,488 | +4.1% |
| SWMIcons curved        |             1,296 |            1,327 | +2.4% |

Run-to-run spread within one branch reaches 18% of the median, so none of these differences is distinguishable from noise. The conversion adds no measurable build cost.

### Determinism

Before: every rebuild differs in the `head` table timestamps. After: all eight sets are byte-identical across 3 rebuilds each on Node 20.20, 22.22 and 25.6.

### Validation

All sixteen fonts pass OpenType Sanitizer 9.2.0, parse with fontTools 4.60 and fc-validate.

### Rendering

A grid of 216 glyphs from three fonts at 16, 22, 28, 40 and 120 px was captured on an iPhone 17 Pro simulator (iOS 26.5) and an Android emulator (Medium Phone, API 36), with the before and after fonts swapped in the same installed build. Two captures of the same state differ by zero pixels on both platforms.

| Platform                | Pixels differing at all | Differing by ≥ 32/255 | Differing by ≥ 128/255 | Largest delta |
| ----------------------- | ----------------------: | --------------------: | ---------------------: | ------------: |
| iOS 26.5 simulator      |                   0.41% |                 0.02% |                      0 |       118/255 |
| Android API 36 emulator |                   0.37% |                0.006% |                      0 |        82/255 |

No glyph is missing or changes shape. The differences are edge antialiasing.

## Tarball

`yarn pack` output after excluding `src/core` from the builder-bob module target, dropping `src`, source maps, and test declarations from the package, and pointing the `react-native` field at `lib/module`.

|                |  Before |   After |
| -------------- | ------: | ------: |
| Tarball bytes  | 252,078 |  93,746 |
| Unpacked bytes | 902,489 | 333,362 |
| Files          |     477 |     201 |

Every export resolves identically from a fresh npm consumer under the `require`, `import` and `react-native` conditions, and the CLI binary runs. A release Metro bundle of the Bare example contains the same 8 runtime modules from `lib/module` with package exports enabled (React Native 0.79+) and disabled (0.74 to 0.78, which use the `react-native` field). No pipeline or CLI module is bundled.
