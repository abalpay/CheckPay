# Checkpay Reconciliation Rules
## How to match AVAC claims to payslip entries for Resident Medical Officers

**Award**: Medical Officers (Queensland Health) Award – State 2015
**Applicable to**: RMOs (Resident Medical Officers) at Queensland Health hospitals

---

## 1. Understanding the documents

### The AVAC form

The AVAC (Attendance Variation and Allowance Claim) is a form the doctor fills in after working outside their normal roster. Each line on the AVAC records:

- **Date** — the day the work was done
- **Rostered start/finish** — the shift the doctor was originally scheduled to work (blank for recalls)
- **Actual start/finish** — when the doctor actually started and finished
- **Minutes** — meal break duration (if applicable)
- **Variation type** — what kind of extra work: Overtime, Recall Onsite, Recall Offsite, or flagged as fatigue/insufficient break
- **Comments** — clinical details (not relevant to pay calculation)

A single AVAC typically covers one week and may have multiple lines (shifts) across several dates.

### The payslip (Page 2)

Page 2 of the payslip lists individual adjustment entries. Each entry has:

- **Date** — which day it relates to
- **Type** — the pay category (e.g. Overtime_-_1.5, Recall_-_T2.0)
- **Units** — hours paid
- **Amount** — dollar value

A single day on the AVAC may produce multiple payslip entries (different rate types, guarantee top-ups, etc.).

### The base hourly rate

Found on Page 1 of the payslip. For an RMO, this is the ordinary hourly rate derived from their annual salary. All overtime, recall, and penalty rates are multiples of this rate. For example, if the base rate is $69.1842:

| Multiplier | Rate | Used for |
|-----------|------|----------|
| 1.0× | $69.18 | Fatigue penalty (weekday salary replacement) |
| 1.5× | $103.78 | First 3h OT (Mon–Sat), recall within threshold |
| 2.0× | $138.37 | OT after 3h (Mon–Sat), all Sunday OT, guarantee top-ups |
| 2.5× | $172.96 | All public holiday OT and recalls |

---

## 2. Ordinary hours and what counts as overtime

### Rule 2.1 — Ordinary hours are weekday-only

An RMO's ordinary hours are 76 hours per fortnight, worked Monday to Friday only (Award clause 19.1(a)). This means:

- **Any work on Saturday, Sunday, or a public holiday is overtime** — even if it appears as a "rostered" shift on the AVAC
- The standard weekday is 7.6 hours (plus a 0.5h unpaid meal break = 8h06m on-site)
- A typical roster is 07:30 to 15:36 (the "standard finish")

### Rule 2.2 — The rostered finish boundary (weekdays)

On weekdays, the AVAC records a "rostered finish" time. This is the boundary between ordinary hours and overtime.

- **Hours up to rostered finish** = ordinary hours (already paid on Page 1 of the payslip as salary)
- **Hours beyond rostered finish** = overtime (paid on Page 2 as adjustments)

For example: Rostered 07:30–16:00, Actual 07:30–18:30
- 07:30–16:00 = ordinary hours (paid via salary on Page 1)
- 16:00–18:30 = 2.5h overtime (paid on Page 2)

### Rule 2.3 — The rostered OT gap (0.4h pre-seed)

When the rostered finish is 16:00 but the "standard" finish is 15:36, there's a 0.4h (24 minute) gap. This gap:

- Is already paid on Page 1 as rostered overtime (you won't see it on Page 2)
- BUT it counts toward the cumulative 3-hour OT threshold (Rule 3.1)
- So the threshold effectively starts at 0.4h consumed, not zero

This only applies on weekdays when the rostered finish is within 30 minutes of the standard finish (15:36). If the rostered finish is much later (e.g. 18:00 for extended coverage), the engine falls back to using 15:36 as the OT baseline.

### Rule 2.4 — Saturday/Sunday/Public holiday shifts

Even if the AVAC shows "rostered" start and finish times for a Saturday, Sunday, or public holiday shift, the **entire shift is overtime** because ordinary hours are weekday-only.

For example: Saturday, Rostered 08:00–12:00, Actual 08:00–13:00
- All 5 hours (08:00–13:00) are overtime, not just the 1h extension
- The AVAC's variation_type will typically say "Overtime"
- Apply the overtime rates for the day type (see Rule 3)

---

## 3. Overtime rates and the 3-hour threshold

### Rule 3.1 — The Mon–Sat threshold ladder

For overtime worked Monday to Saturday (Award clause 19.4(a)(i)):

- **First 3 cumulative hours of OT that day** → paid at **1.5×** (time and a half)
- **All hours after the first 3** → paid at **2.0×** (double time)

The threshold is cumulative across the entire day. If a doctor does 2h of rostered OT and then gets recalled for 2h later that evening, the recall straddles the threshold:
- First 1h of recall at 1.5× (consuming the remaining threshold)
- Next 1h of recall at 2.0× (threshold exhausted)

### Rule 3.2 — Sunday rate

All overtime on Sunday → **2.0×** for all hours (Award clause 19.4(a)(ii)). No threshold applies.

### Rule 3.3 — Public holiday rate

All overtime on a public holiday → **2.5×** for all hours (Award clause 19.4(a)(iii)). No threshold applies.

### Rule 3.4 — Public holiday identification

Public holidays are determined by the QLD state holiday calendar for the relevant year. This includes:

- New Year's Day (1 Jan)
- Australia Day (26 or 27 Jan)
- Good Friday, Easter Saturday, Easter Sunday, Easter Monday (moveable)
- ANZAC Day (25 Apr)
- Labour Day (first Mon in May)
- Royal Queensland Show / Ekka (Aug, date varies)
- King's Birthday (Oct, date varies)
- Christmas Day (25 Dec)
- Boxing Day (26 Dec)

Dates shift year to year (especially Easter and King's Birthday). The system uses the Python `holidays` library to calculate the correct dates dynamically.

---

## 4. Recall rules

### Rule 4.1 — Recall onsite

When a doctor is recalled to the hospital (AVAC variation_type = "Recall Onsite"):

- The AVAC will have **no rostered start/finish** (only actual start/finish)
- Calculate duration from actual_start to actual_finish
- Apply the overtime rate ladder (Rule 3) based on cumulative OT for that day

**Payslip type mapping:**
- Hours within threshold → `Recall_-` (1.5×)
- Hours beyond threshold → `Recall_-_T2.0` (2.0×)
- Sunday hours → `Recall_-_T2.0` (all at 2.0×)
- Public holiday hours → `Recall_-_T2.5` (all at 2.5×)

### Rule 4.2 — Minimum 2-hour guarantee

Every recall is paid for a minimum of 2 hours (Award clause 19.6(b)(ii)), even if the doctor was on-site for less.

If actual duration < 2 hours:
- Pay the actual hours at the applicable rate (1.5×, 2.0×, or 2.5×)
- Top up the remaining hours to reach 2h at **2.0×** as a guaranteed hours entry

**Payslip type:** `Recall_Guaranteed_Hrs_2.0`

**Example:** Recall 23:40–00:15 (35 mins = 0.58h), threshold already consumed
- `Recall_-_T2.0`: 0.58h × $138.37 = $80.25
- `Recall_Guaranteed_Hrs_2.0`: 1.42h × $138.37 = $196.48
- Total: 2.0h paid

### Rule 4.3 — Recall offsite (telephone advice)

When a doctor provides advice by phone without going to hospital (AVAC variation_type includes "Offsite"):

- No minimum 2-hour guarantee applies
- Pay actual time only
- Same rate ladder as onsite recalls

**Payslip type mapping:**
- Within threshold → `Recall_Offsite_1.5`
- Beyond threshold → `Recall_Offsite_2.0`

### Rule 4.4 — Multiple recalls in one day

Each recall in a day adds to the cumulative OT hours. The 3-hour threshold is shared across all shifts that day (overtime + recalls combined).

**Example:** Monday with 2h rostered OT + two recalls:
- Rostered OT 2.0h → all at 1.5× (threshold: 2.0h consumed of 3.0h)
- Recall 1 (1.5h) → first 1.0h at 1.5× (fills threshold), next 0.5h at 2.0×
- Recall 2 (0.75h, min 2h) → all at 2.0× (threshold exhausted) + guarantee top-up

### Rule 4.5 — Recall on public holidays

Recalls on public holidays are always paid at **2.5×** for all hours, with no threshold (Award clauses 19.6(b)(i) + 19.4(a)(iii)).

---

## 5. Fatigue leave / Insufficient break

### Rule 5.1 — When fatigue applies

If a doctor doesn't get a 10-hour break between finishing one shift and starting the next, they're entitled to fatigue leave the next day (Award clause 19.5). The AVAC marks this as "Insufficient Break" or "Fatigue" in the variation type, or includes "*Fatigue pay*" in the comments.

### Rule 5.2 — Weekday fatigue penalty

On a weekday, fatigue leave produces **two** payslip entries:

1. **Fatigue_Penalty_@1.0** — 7.60h × base rate (1.0×)
   - This replaces the ordinary salary the doctor would have earned. It appears as a separate Page 2 entry because the salary on Page 1 covers the original roster, not the replacement.

2. **Fatigue_Penalty_@1.5** — excess hours beyond 7.6h (if the doctor worked longer)
   - If the fatigue shift was rostered beyond the standard 7.6h, the excess counts as overtime at 1.5×

### Rule 5.3 — Weekend/public holiday fatigue

On weekends or public holidays, there's no ordinary salary component to replace. The fatigue penalty is simply the full shift hours at the day's OT rate:

- Saturday: split through the 3h threshold (1.5× then 2.0×)
- Sunday: all at 2.0×
- Public holiday: all at 2.5×

### Rule 5.4 — Fatigue shift with overtime

When a shift is marked as both overtime and fatigue (has rostered hours AND insufficient break), the doctor gets **both**:

- Overtime pay for hours beyond the rostered finish
- Fatigue penalty as described above

These are separate entitlements. The payslip will show both OT entries and fatigue entries for the same date.

---

## 6. Meal allowance

### Rule 6.1 — First meal allowance

If the doctor works more than 10 continuous hours in a shift (Award clause 17.3(a)), they receive a flat meal allowance.

- **Work hours** = on-site hours minus 0.5h unpaid meal break (for shifts over 5h)
- Threshold: work hours must be strictly **greater than** 10h
- Current flat rate: $16.80

**Payslip type:** `Meal_Allowance`

### Rule 6.2 — Second meal allowance

If work hours exceed 15h, a second meal allowance is paid.

### Rule 6.3 — Meal allowance only applies to main shifts

Meal allowance is calculated based on the main rostered shift (the one with rostered start/finish times). Standalone recalls do not trigger meal allowance calculations.

---

## 7. Payslip types that don't come from the AVAC

The following entries may appear on the payslip but are **not** predicted by the AVAC engine. They are classified as INFO (informational) and should not be treated as discrepancies:

| Payslip type | Meaning |
|-------------|---------|
| `OCA_-_RMO_-_Level_4_to_13` | On-call allowance — paid based on the roster, not per-shift AVAC claims |
| `Shift_-_Sat_Loading_-_50%` | Saturday loading (usually in reversal/correction payslips) |
| `Shift-Sunday_Loading-100%` | Sunday loading (usually in reversal/correction payslips) |
| `Public_Holiday_-_50%` | Public holiday loading — payroll adds this on PH days |
| `Public_Holiday_-_150%` | Public holiday loading (higher rate) |
| `Stand_Down_Leave` | Leave adjustment on public holidays — administrative entry |
| `Fortnightly_Salary` | Base salary adjustment — not overtime-related |

These types appear on the payslip as payroll's standard processing. The AVAC doesn't trigger them, so the engine can't predict them. They should be displayed to the user for transparency but not flagged as errors.

---

## 8. The OT threshold cascade effect

### Rule 8.1 — Why recall rates can differ from predictions

The AVAC only records the doctor's extra shifts — not their normal rostered weekday shifts. But the rostered shift may include overtime that consumes part of the 3-hour threshold before any recalls.

**Example:** Doctor is rostered 07:30–16:00 (0.4h rostered OT beyond standard 15:36). Later recalled at 22:00.

- The engine knows about the 0.4h rostered OT gap (Rule 2.3) and pre-seeds the threshold
- But if the doctor also had additional rostered OT that day (from a different roster variation not on the AVAC), more threshold may be consumed
- This means the payslip might show recall hours at 2.0× where the engine predicted 1.5×

### Rule 8.2 — Threshold split matching

When this happens, the reconciler detects the pattern:
- Some recall lines show as underpaid/missing (engine expected 1.5× portion)
- Other recall lines show as overpaid/unmatched (payslip has more at 2.0×)
- The NET total across all recall types is **equal or higher** (shifting from 1.5× to 2.0× always increases pay)

The reconciler reclassifies these as `THRESHOLD_SPLIT` (non-actionable) and adds a `Recall_NET_Total` summary showing the net difference. The doctor is actually being paid **more** than expected, not less.

### Rule 8.3 — When threshold excess is a problem

A positive net difference (payslip pays more) from threshold cascading is expected and benign — the doctor benefits. Only a negative net difference (payslip pays less overall) would indicate a real issue.

---

## 9. Matching AVAC dates to payslip dates

### Rule 9.1 — The adjustment window

A payslip's Page 2 covers adjustments for a range of dates (the "adjustment window"). For example, a payslip dated 21.05.2025 might have adjustments ranging from 10.03.2025 to 27.04.2025.

Not every AVAC will appear on the next payslip — it depends on when the AVAC was submitted and processed by payroll.

### Rule 9.2 — Classifying unpaid AVAC dates

When an AVAC date has zero entries on the payslip:

| Classification | Condition | Meaning |
|---------------|-----------|---------|
| **NOT_YET_PAID** | AVAC date is **after** the payslip's latest adjustment date | Genuinely not processed yet — will appear on a future payslip |
| **POSSIBLY_MISSED** | AVAC date falls **within** the adjustment window | Payroll processed dates before and after this one but skipped it — may need follow-up |
| **CHECK_PREVIOUS** | AVAC date is **before** the payslip's earliest adjustment date | Likely already paid on an earlier payslip |

### Rule 9.3 — How to verify

- **NOT_YET_PAID**: Wait for the next payslip and re-run reconciliation
- **POSSIBLY_MISSED**: Check if the AVAC was submitted on time. If it was, contact payroll
- **CHECK_PREVIOUS**: Run reconciliation against the earlier payslip that covers that date range

---

## 10. Day-level vs line-level assessment

### Rule 10.1 — Multiple lines per day is normal

A single day on the AVAC can produce many payslip entries:

| Scenario | Typical line count |
|----------|-------------------|
| Simple weekday OT (e.g. stayed 2h late) | 1 line |
| Weekday recall under 2h | 2 lines (recall + guarantee) |
| Weekday recall over 2h spanning threshold | 2-3 lines (1.5× portion + 2.0× portion + possible guarantee) |
| Fatigue shift with OT | 2-3 lines (OT + fatigue @1.0 + fatigue @1.5) |
| Day with OT + 2 recalls + threshold splits | 5-8 lines |

### Rule 10.2 — Day-level status

The day is assessed as a whole. A day is **OK** if all actionable items within it match, even if:
- The raw dollar total differs (due to INFO items like OCA allowances)
- Individual recall lines are split differently (THRESHOLD_SPLIT)
- There's a small rounding excess (THRESHOLD_EXCESS)

Only genuine UNDERPAID, OVERPAID, MISSING, or UNMATCHED items make a day's status non-OK.

---

## 11. Correction / overpayment payslips

### Rule 11.1 — How to identify

A correction payslip has large negative entries (reversals) that claw back a previous overpayment. These payslips typically show:
- Multiple reversal entries (negative hours/amounts) for prior dates
- An overpayment recovery amount
- Net negative adjustment total

### Rule 11.2 — Reconciliation is limited

Correction payslips cannot be fully reconciled against AVACs because the reversals relate to previously-paid entries, not new claims. The system flags these as `CORRECTION_PAYSLIP` and displays the overpayment amount without attempting line-level matching.

---

## 12. Worked example

### AVAC: Monday 24 March 2025

| Line | Rostered | Actual | Type |
|------|----------|--------|------|
| 1 | — | 18:15–23:00 | Recall Onsite |
| 2 | — | 23:40–00:15 | Recall Onsite |

Base rate: $69.1842. Weekday, no prior OT this day (cumulative OT = 0).

**Step 1: Recall 1 (18:15–23:00 = 4.75h)**

Apply threshold (Rule 3.1): 0h consumed, 3h remaining at 1.5×
- First 3.0h at 1.5× → `Recall_-`: 3.0h × $103.78 = $311.33
- Next 1.75h at 2.0× → `Recall_-_T2.0`: 1.75h × $138.37 = $242.15

No guarantee needed (4.75h > 2h minimum).
Cumulative OT after: 4.75h (threshold exhausted).

**Step 2: Recall 2 (23:40–00:15 = 0.58h)**

Threshold exhausted → all at 2.0×
- `Recall_-_T2.0`: 0.58h × $138.37 = $80.25

Guarantee applies (0.58h < 2h minimum, Rule 4.2):
- Top-up: 2.0 - 0.58 = 1.42h at 2.0×
- `Recall_Guaranteed_Hrs_2.0`: 1.42h × $138.37 = $196.48

Cumulative OT after: 6.75h.

**Expected payslip entries for 24.03.2025:**

| Type | Units | Amount |
|------|-------|--------|
| Recall_- | 3.00h | $311.33 |
| Recall_-_T2.0 | 2.33h | $322.40 |
| Recall_Guaranteed_Hrs_2.0 | 1.42h | $196.48 |
| **Day total** | | **$830.21** |

**What payroll might pay instead** (due to threshold cascade, Rule 8):

If the doctor had additional rostered OT earlier that day (not on this AVAC), payroll may have already consumed part of the threshold. The payslip might show:

| Type | Units | Amount |
|------|-------|--------|
| Recall_- | 0.60h | $62.27 |
| Recall_-_T2.0 | 4.73h | $654.48 |
| Recall_Guaranteed_Hrs_2.0 | 1.42h | $196.48 |
| **Day total** | | **$913.23** |

The NET total is **higher** ($913.23 vs $830.21 = +$83.02) because hours shifted from 1.5× to 2.0×. The reconciler classifies the individual line differences as THRESHOLD_SPLIT and confirms the doctor was paid correctly (actually more).

---

## Quick reference: AVAC variation type → payslip entry mapping

| AVAC variation type | Has roster? | Payslip entries generated |
|--------------------|-------------|--------------------------|
| Overtime | Yes | `Overtime_-_1.5` and/or `Overtime_-_2.0` (weekday), `Overtime_-_2.0` (Sunday), `Overtime_-_2.5` (PH) |
| Recall Onsite | No | `Recall_-` and/or `Recall_-_T2.0` / `Recall_-_T2.5` + possible `Recall_Guaranteed_Hrs_2.0` |
| Recall Offsite | No | `Recall_Offsite_1.5` and/or `Recall_Offsite_2.0` |
| Overtime + Fatigue / Insufficient Break | Yes | OT entries + `Fatigue_Penalty_@1.0` + possible `Fatigue_Penalty_@1.5` |
| Fatigue / Insufficient Break (standalone) | No | `Fatigue_Penalty_@1.0` (weekday) or day-rate fatigue entries |
| (any, on Saturday) | — | All hours as OT using Mon–Sat threshold ladder |
| (any, on Sunday) | — | All hours at 2.0× |
| (any, on Public Holiday) | — | All hours at 2.5× |