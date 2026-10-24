# Food scanning

Initial implementation based on main c41fc1f729561c329bb355df2386954b04893f22. Built and reviewed in an isolated local preview before release.

## User flow

Diary → Add food → Scan barcode / Scan label. Both modes have a Start camera button using the rear-facing camera where available. Barcode mode scans continuously. Label mode captures a still image with Capture label. Photo selection and manual entry remain available. Camera tracks stop on close, switch, capture, page hide or cancellation; late permission responses are discarded.

Barcode lookup uses Open Food Facts API v2 product lookup with a checksum-validated GTIN and app identifier. Product attribution and ODbL links appear in review and food-source notes. Label recognition uses locally hosted Tesseract English OCR; images and raw recognized text are not stored in diary entries or uploaded. Scanner scripts, WASM and language files load only when used.

Review is mandatory. The original label image can be expanded for comparison. Users must choose the correct per-100-g or serving column, enter its weight if required, check every value and confirm. OCR can misread digits; it does not bypass review. This first version supports calories, protein, carbohydrate, fat, saturates, sugars, fibre and salt. English labels only. Unknown optional nutrients and amino acids remain unavailable rather than becoming zero. Multi-column labels require particular care. Liquids require an explicit gram weight for the stated volume.

Reviewed nutrition travels with the diary entry and saved meal. It never overwrites an atlas food with the same name. Snapshot validation protects loading/sync paths; shared profile links are disabled for scanned foods until their encoding can preserve this extra data. Image export remains available.

## Validation

93 automated tests passed, including unit conversions, missing values, invalid barcodes, diary reload, sync snapshot changes, rear-camera constraints, camera track cleanup, late permission response, and permission-denied fallback. Production build passed.

Browser checks in isolated sample account: barcode-image decoding → real Open Food Facts product; label-photo OCR → corrections and confirmation → 50 g entry with 100 kcal and 7.5 g protein; same values after reload and after saving/reusing the meal in Dinner. Phone-sized layout checked at 390 × 844. No real account diary data used.

Physical camera capture on iPhone and Android is not yet verified. Mobile testing requires a trusted HTTPS deployment (or a secure development tunnel); plain HTTP LAN addresses do not provide camera access. Camera permission is requested only after Start camera. First OCR download may be slow on mobile.

## Release and device follow-up

Recheck current main and merge these changes onto it, preserving changes from other devices. Test actual iPhone Safari and Android Chrome camera permission, capture, backgrounding and retry. Verify cloud saved-meal sync in a test account, hosting of WASM/language files and Open Food Facts request limits. No subscription/billing gate is implemented. Review ODbL obligations for the intended public integration; the current approach keeps reviewed entries separate from the shared atlas and retains attribution.

## Local supplement / portion update (2026-10-23, not released)

Scan label now opens the camera immediately, followed by Take photo. Mobile file upload controls are hidden; desktop retains photo selection. Manual entry is still available when camera access fails.

Supplement labels use an editable review form for serving count/unit and ingredient rows. Recognised vitamins, minerals, fats and macros map to existing nutrient definitions. Other ingredients remain label-only, visible in the diary and CSV, with no invented target. Users can add/remove rows or correct any match. IU values, vitamin K2, DFE folate, mineral compound weights and other ambiguous definitions do not silently convert to existing targets. This is English OCR with mandatory review, not guaranteed recognition of every label or a dosage recommendation.

Storage contract: for `food.supplement === true`, the legacy `entry.g` scalar represents the quantity in `food.doseUnit`, NOT physical grams. `serving_g` is the label serving count. Nutrients are normalized per 100 of that unit for compatibility with existing arithmetic, and validated from the original reviewed ingredients on reload. All food snapshots remain gram-based. Supplement quantity labels, source breakdown, saved-meal editor, recent foods and CSV use the declared unit. CSV preserves existing columns and appends quantity/unit/label ingredients; its grams column stays blank for non-gram supplements. Unlisted macros remain null and are marked unknown/partial.

USDA SR Legacy food_portion records now provide food-specific household measures for matching food IDs, including spoons, cups and slices. No global tablespoon-to-gram assumption is used. Existing portions are not changed when the displayed unit changes; legacy saved unit selections remain supported. Source/provenance and regeneration instructions are in scripts/import-portions.py and data/portions_usda.json.

Actual supplied omega-3 photo: adaptive threshold OCR read serving size 3 softgels and amounts 3600/2160/1300/860. Faint unit text was unreadable and was left blank for explicit review. Browser review confirmed mg, then logged 3 softgels with 1300 mg EPA and 860 mg DHA. Editing to 1 softgel and reloading preserved 433.3 mg EPA, 286.7 mg DHA and 720 mg total omega-3. Fish oil is retained separately as a label ingredient; it is not added to its fatty-acid components or fabricated into total fat/calories. No photograph or OCR text is stored with entries.

## Local scan review improvements (pending release)

Supplement names are prefilled from parsed ingredients (for example Omega-3 fish oil, Vitamin D3 or Creatine monohydrate), with a generic fallback when nothing readable is available. Users can edit the name; a previously entered product name is retained. Brand names and health claims are not invented. The separate confirmation checkbox has been removed from both food and supplement review; Add remains the explicit save action, and existing amount/unit validation remains in place.

Label capture requests a higher-resolution back-camera image and retains up to 3200 pixels on the longest edge. Weak OCR retries with alternate whole-table segmentation and threshold settings, up to three passes. The most useful coherent result is chosen; values from different passes are never merged. Unreadable results display a prominent Retake photo action and explain how to frame the table. This improves the general food-label path; the reported sunflower-seed photo has not been provided, so that specific failure remains unverified.

106 automated tests pass; build passes. Browser-tested automatic Omega-3 fish oil naming and adding without a checkbox in the isolated local sample diary.

### Local follow-up: mobile notices and difficult food labels

Notifications now share a vertical stack above the measured mobile navigation height. The update notice says “An update is ready.” and keeps its Refresh button visible. The standalone iPhone status-bar style is explicitly set to default; physical iPhone verification is still needed.

Food parsing supports UK `Energy kJ/kcal 2815/660` rows, table-border separators and parenthesised “of which sugars” rows. Food OCR only counts a read as usable when all four main macro fields are present and basic amount checks pass. Failed scans can optionally select a rectangular nutrition-table crop with touch, mouse or keyboard-accessible edge sliders. Cropping and OCR remain on-device; the photo is kept in memory and discarded when the scanner closes. No AI fallback or photo upload was added, per the user's preference.

Validation: 108 tests pass; production build passes. At 320 px and 390 px, both notices fit horizontally and remain separated from each other and the bottom navigation. Actual sunflower-seed photo tested through the browser, including crop selection: OCR still fails to recover all values reliably (cropped read recovered fat). Do not describe this specific photo as fixed. Manual entry or a clearer, closer photo is still needed. The manually verified values per 100 g are 660 kcal, 21 g protein, 4.5 g carbohydrate, 60 g fat, 7 g saturates, 2.6 g sugars, 8.9 g fibre and 0 g salt. These values are not hardcoded into the scanner.

### Fish-oil label retry

Supplement scans are no longer accepted as complete while serving quantity or any ingredient unit is missing. Weak reads get a local adaptive-contrast pass, followed by explicit bicubic scaling to preserve faint digits consistently across browsers. A valid complete pass takes priority over a longer incomplete pass; results from separate passes are never combined. Unknown units are still left blank rather than guessed.

Verified the supplied fish-oil photo in the browser without cropping or manual field entry: serving size 3 softgels, fish oil 3,600 mg, omega-3 2,160 mg, EPA 1,300 mg, DHA 860 mg. A one-softgel portion displays 720 mg omega-3, 433.3 mg EPA and 286.7 mg DHA and adds to the isolated sample diary. The original photo stays available for comparison. This verifies the provided photo, not every supplement label or a physical phone camera. No model download, dependency change, cloud OCR, photo upload or hardcoded product values were added.

## On-device supplement interpretation and table reading (local preview, 24 Oct 2026)

- Explicit elemental mineral declarations (including providing / equivalent to / of which wording) map to the mineral. Compound weights stay label-only; no elemental amount is inferred from a chemical compound name. The original OCR text remains available for comparison.
- Per-capsule and per-N-capsules headings supply the declared quantity when a separate serving-size line is absent. Multiple amount columns leave the amount blank for selection; reference percentages are not doses. Packaging footnotes and ingredient prose are excluded after the table.
- Tesseract now returns positioned lines/words. The reader detects an English nutrition-panel region for retry crops, rejoins same-row label/amount fragments, and compares up to three readings. It chooses a coherent pass, never blends numeric values across different images. Conflicts and values not corroborated by another reading remain flagged for review.
- The camera frame corresponds to the captured area, including object-fit cropping. Crop adjustment remains available after successful scans as well as failed ones. The review shows a per-serving nutrient summary; it adds no mandatory confirmation checkbox.
- Recent foods now reads each day's entries newest first, preserving the stored diary order. Confirmed supplement snapshots and portions remain reusable after reload through the existing account-scoped diary storage; no new product/photo database was introduced.

No cloud OCR, AI API, extra model dependency, photo upload, or product-specific hardcoded quantities were added. More aggressive enlargement was tested and rejected because it degraded the fish-oil photo. Existing gentle contrast/scaling is retained.

Validation: 122 automated tests pass; production build has zero warnings. Browser photo checks use the supplied images and a local sample account, not the live account. Magnesium maps 253 mg per 3 capsules (84.3 mg per capsule), with 1,950 mg compound label-only. Fish oil fills 3 softgels, 3,600 mg fish oil (label-only), 2,160 mg omega-3, 1,300 mg EPA and 860 mg DHA; amounts that only one pass reads fully carry a review notice. The sunflower-seed photo is still a difficult input and is not claimed fixed. Physical phone camera focus/permissions have not been tested on a handset.
