# Activity-based starting targets

Sign-up onboarding asks about the user's typical daily activity, considering work, transport and exercise together. The same settings remain editable in the account. The preview responds to weight and activity immediately. Optional age, height (cm), and the female/male equation category enable a calorie estimate for weight maintenance. There is no automatic weight-loss deficit or exercise-calorie top-up.

## Calculation and sources

- **Energy:** adult (19+) equations from the [2023 DRI tables published by Health Canada](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html). Use the separate inactive, low-active, active and very-active equations directly, without another activity multiplier. Inputs are years, centimetres and kilograms. Round the displayed estimate to 50 kcal. These are population-based maintenance estimates; observed weight trends and individual needs can differ.
- **Protein:** app-selected starting points of 0.8, 1.2, 1.6 and 1.8 g/kg/day respectively. The exact four-way mapping is a product heuristic, not four clinical requirements established by the energy equations. The 0.8 g/kg adult RDA and 1.2–2.0 g/kg range for routinely active adults/athletes are described in [ACSM's protein overview, pages 7–9](https://southeast.acsm.org/wp-content/uploads/2025/01/rodriguez_seacsm-2024-slidedeck_pdf.pdf). Training type, age, energy availability and individual goals can change appropriate intake.
- Existing WHO amino-acid baselines stay intact. The app continues its existing proportional scaling with the chosen protein target; it is not a new official amino-acid requirement.

## Scope and overrides

The automatic estimates are for generally healthy adults 19+ who are not pregnant or breastfeeding. The form provides a manual route for other needs and requires a protein target there. Entering an age below 19 disables automatic estimates. Calorie estimates require every necessary input; no age, height or sex is guessed. Choosing not to enter calorie inputs still allows protein setup.

A manual protein value remains authoritative when activity or weight changes. Clearing it restores automatic suggestions. A manual calorie target is separately optional. Existing accounts without an activity answer retain their previous 1.6 g/kg fallback and any existing override; the new feature does not silently reset them.

Settings are stored inside the existing synced logs JSON as `settings.intake` and `settings.intakeCompleted`, with protein overrides in `settings.thrive`. No database migration is needed. Empty overrides explicitly sync so switching back to automatic works across devices. New sign-ups carry an onboarding marker in auth metadata so email confirmation does not skip the activity question.
