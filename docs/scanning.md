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
