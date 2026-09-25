# Report screen: design critique

Scope: `/check/report/[id]` (sample at `/check/report/sample`), reviewed at 1440px, at 390px and in print.
Before and after screenshots are in `docs/design/screenshots/`.

## Verdict on generic "AI template" patterns: fail

The report looks like a stock shadcn dashboard, and nothing ties it to the CheckPay landing page. The landing page uses dark ink with a DM Serif Display headline, a warm paper background and one blue accent. The report has none of these:

- Cards are nested inside cards (overview card > bordered box > three metric cards), on a gradient background.
- It uses the hero-metric template: three tinted tiles, each with a big number and a small label (red, amber, then white).
- There is no serif anywhere. All the type is one sans at similar weights, so the page reads as UI chrome rather than a statement about someone's pay.
- The detail view uses emoji as status icons (⏭️ 🔍 ⚠️), which clashes with the lucide icons everywhere else.

## Overall impression

The data is all there and the status logic is careful, but the page never answers the doctor's first question:
**"Was I paid correctly, and how much am I owed?"** The dollar figure ($153.80 in the sample) appears only
inside the collapsed "Detailed analysis" view, labelled "In-scope difference". The top of the page gives
counts ("2", "2", "Parsed AVACs 2/2") where it should give money and a plain-English verdict.

## What works

- **Status semantics are sound.** Timing checks show "—" instead of dollar amounts, so a claim that belongs on another payslip is never shown as underpaid. The view model keeps "raise now" apart from "check another payslip".
- **Progressive disclosure is in place.** The day-by-day breakdown is hidden by default, which suits tired users.
- **The print summary is well structured.** It is a dense, factual A4 page that a payroll officer could act on.

## Priority issues

1. **The money is missing from the verdict.** The headline "Action needed now for 2 items." gives a count of something undefined. Fix: lead with a plain verdict and a large dollar figure ("Possibly underpaid $153.80 across 2 claims"), with the facts (doctor, pay date, period, AVACs read) in one quiet row.
2. **Repetition and jargon at the top.** "What to do now" appears twice (as the overview eyebrow and as the card title). Confidence appears twice (as a badge and as a sentence). The page also uses "Report coverage", "Parsed AVACs 2/2", "Likely missed this payslip: 0" and "In-scope". Fix: use one next-steps list, one sentence about confidence and coverage, and plain words ("2 of 2 AVACs read", "Outside this payslip's window").
3. **Mobile hides the money.** At 390px the 8-column action table scrolls sideways. Claim type is clipped, and Expected, Paid and Difference are completely off-screen, so each row becomes a tall blank card. Fix: replace the tables in the main flow with ledger rows. Each row shows the claim, the date and the file, with the three amounts stacked beneath.
4. **The page has no brand and no hierarchy.** Every section is the same white card with a bold sans title, so nothing stands out. Fix: put the verdict in a dark header band like the landing hero, use the serif for the verdict and the dollar figure, and set everything below on paper, divided by hairline rules instead of card borders.
5. **The copy promises a feature that doesn't exist.** The action detail says "use the query draft when contacting payroll", but the UI has no query draft. The next steps also list the same two items twice ("Review 2 underpaid…" and "Review 2 follow-up item(s)…"). Fix the copy in the view model.

## Minor observations

- The sample banner repeats itself: its title "Sample report preview" is followed by the body "Sample report preview — fictional data…".
- Dates are inconsistent. Tables use the raw `09.01.2026` format while the header uses `15/01/2026`. Use one readable format everywhere ("Fri 9 Jan 2026").
- The status labels "Issue" and "Follow-up" are vague. "Check future" reads as an instruction to the software, not to the doctor.
- Day rows in the breakdown expand when the row is clicked but have no keyboard control and no `aria-expanded`.
- "Show detailed analysis" is a small outline button at the bottom of the page with no heading or context.
- The payroll context sits behind two layers (a card, then an accordion) of tiny bordered tiles.
- Print: "Clinical snapshot" is an odd heading for a pay summary. The numbering on the next-steps list is lost because Tailwind's preflight removes list styles.
- The shared app header's black "Generate Report" button doesn't match the landing page's blue primary. This is out of scope here and is noted for the owner.

## Questions

- What would this look like as a well-set bank statement instead of a dashboard?
- Should the report say "you may be owed", or is that too strong? (We use "Possibly underpaid", which matches the existing tone.)
