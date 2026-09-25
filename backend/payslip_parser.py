"""
Checkpay — Queensland Health Payslip Parser
============================================
Extracts structured data from QH payslip PDFs (standard PDF format).

Input:  QH Payslip PDF (1-2 pages)
Output: Dict with employee info, current fortnight summary, and
        adjustment line items for reconciliation against AVAC claims.

Dependencies: pdfplumber
"""

import dataclasses
import math
import re
import json
import sys
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional

import pdfplumber


# ─── Data Structures ─────────────────────────────────────────────────────────

@dataclass
class Employee:
    name: str = ""
    person_id: str = ""
    employer: str = ""
    sub_position: str = ""
    classification: str = ""
    pan: str = ""
    pay_date: str = ""

@dataclass
class CurrentFortnightLine:
    type: str = ""
    daily_values: list = field(default_factory=list)
    units: float = 0.0
    rate: float = 0.0
    amount: float = 0.0

@dataclass
class CurrentFortnight:
    period_start: str = ""
    period_end: str = ""
    weekday_dates: list = field(default_factory=list)
    lines: list = field(default_factory=list)
    gross_pay: float = 0.0

@dataclass
class AdjustmentLine:
    type: str = ""
    date: str = ""
    units: float = 0.0
    rate: float = 0.0
    amount: float = 0.0
    section: str = ""

@dataclass
class PayslipData:
    employee: Employee = field(default_factory=Employee)
    current_fortnight: CurrentFortnight = field(default_factory=CurrentFortnight)
    adjustments: list = field(default_factory=list)
    adjustment_subtotal_prev4: float = 0.0
    adjustment_subtotal_older: float = 0.0
    adjustment_total: float = 0.0
    total_gross: float = 0.0
    net_income: float = 0.0
    base_hourly_rate: float = 0.0
    fortnightly_salary: float = 0.0
    overpayment_amount: float = 0.0        # net overpayment to be repaid
    is_overpayment_payslip: bool = False    # True if payslip contains clawbacks
    page1_lines: list = field(default_factory=list)     # AdjustmentLine, section="current_fortnight"
    covered_dates: list = field(default_factory=list)   # all 14 dd.mm.yyyy dates of the fortnight
    locality: str = ""                                  # e.g. "Townsville" from page-1 "Locality -Townsville (H)"
    fortnights: list = field(default_factory=list)      # [{"start","end","pay_date"}] dd.mm.yyyy


# ─── Parsing Helpers ─────────────────────────────────────────────────────────

def parse_amount(s: str) -> float:
    if not s or not s.strip():
        return 0.0
    s = s.strip().replace(",", "").replace("$", "")
    neg = s.endswith("-")
    if neg:
        s = s[:-1]
    try:
        val = float(s)
        return -val if neg else val
    except ValueError:
        return 0.0


def parse_units(s: str) -> float:
    if not s or not s.strip():
        return 0.0
    s = s.strip().replace(",", "")
    # Early reject: must start with a digit, minus, or dot
    if not re.match(r'^[\d.\-]', s.rstrip('-')):
        return 0.0
    neg = s.endswith("-")
    if neg:
        s = s[:-1]
    try:
        val = float(s)
        return -val if neg else val
    except ValueError:
        return 0.0


def extract_classification(sub_position: str) -> str:
    m = re.search(r'MED(\w+)\s*\((\d+)\)', sub_position, re.IGNORECASE)
    if m:
        code = m.group(1)
        year = m.group(2)
        return f"{code}{int(year)}"
    return sub_position


PAGE1_DATED_PREFIXES = ("Overtime", "Recall", "Meal_Allowance", "Fatigue", "Public_Holiday", "Shift")
DATE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")


def normalize_page1_type(type_val: str) -> str:
    """Page 1 prints 'Overtime - 1.5'; page 2 prints 'Overtime_-_1.5'. Whitespace -> underscore."""
    return re.sub(r"\s+", "_", type_val.strip())


def _page1_date(cell: str, pay_date: str) -> str:
    """'17/02' with pay date '12.03.2025' -> '17.02.2025'; a month after the pay month belongs to last year."""
    day, month = cell.strip().split("/")
    pay = datetime.strptime(pay_date, "%d.%m.%Y")
    year = pay.year - 1 if int(month) > pay.month else pay.year
    return f"{int(day):02d}.{int(month):02d}.{year}"


def page1_dated_lines(fortnight: CurrentFortnight, pay_date: str) -> tuple:
    """(dated AdjustmentLines from the per-day columns, covered dates). Empty when the header is not 14 dates."""
    cells = [c for c in fortnight.weekday_dates if c and "/" in c]
    if not pay_date or len(cells) != 14:
        return [], []
    try:
        dates = [_page1_date(c, pay_date) for c in cells]
    except ValueError:
        return [], []
    lines = []
    for line in fortnight.lines:
        ptype = normalize_page1_type(line.type)
        if not ptype.startswith(PAGE1_DATED_PREFIXES):
            continue
        for date, cell in zip(dates, line.daily_values):
            units = parse_units(cell)
            if units == 0:
                continue
            lines.append(AdjustmentLine(type=ptype, date=date, units=units, rate=line.rate,
                                        amount=round(units * line.rate, 2), section="current_fortnight"))
    return lines, dates


def page1_overtime_by_date(ps) -> dict:
    """{covered date: hours of rostered Overtime paid on page 1}. Presence in the dict == covered."""
    out = {d: 0.0 for d in getattr(ps, "covered_dates", []) or []}
    for line in getattr(ps, "page1_lines", []) or []:
        if line.type.startswith("Overtime") and line.date in out:
            out[line.date] = round(out[line.date] + line.units, 2)
    return out


def _extract_locality(text: str) -> str:
    m = re.search(r"Locality\s*-\s*([A-Za-z][A-Za-z ]*?)\s*(?:\(|\n|$)", text)
    return m.group(1).strip() if m else ""


# ─── Page 1 Parser ───────────────────────────────────────────────────────────

def parse_page1(page) -> tuple:
    tables = page.extract_tables()
    text = page.extract_text() or ""

    employee = Employee()
    fortnight = CurrentFortnight()
    gross_pay = 0.0
    total_gross = 0.0
    net_income = 0.0

    # Employee info from header table (table index 1)
    if len(tables) >= 2:
        header = tables[1]
        if header and len(header) > 0:
            row = header[0]
            if row[0]:
                left = row[0]
                m = re.search(r'Pay Date\s+([\d.]+)', left)
                if m:
                    employee.pay_date = m.group(1)
                m = re.search(r'Employer Name\s+(.+?)(?:\n|$)', left)
                if m:
                    employee.employer = m.group(1).strip()
                m = re.search(r'PAN\s+(\d+)', left)
                if m:
                    employee.pan = m.group(1)
            if len(row) > 1 and row[1]:
                right = row[1]
                m = re.search(r'Employee Name\s+(.+?)(?:\n|$)', right)
                if m:
                    employee.name = m.group(1).strip()
                m = re.search(r'Person ID\s+(\d+)', right)
                if m:
                    employee.person_id = m.group(1)
                # Sub position may span multiple lines
                lines = right.split('\n')
                for i, line in enumerate(lines):
                    if 'Sub Position' in line:
                        sub_pos = line.split('Sub Position')[1].strip()
                        if i + 1 < len(lines):
                            next_line = lines[i + 1].strip()
                            if next_line.startswith('('):
                                sub_pos += ' ' + next_line
                        employee.sub_position = sub_pos
                        employee.classification = extract_classification(sub_pos)
                        break

    # Current fortnight table (table index 2)
    if len(tables) >= 3:
        ft_table = tables[2]
        if ft_table and len(ft_table) >= 4:
            date_row = ft_table[2]
            fortnight.weekday_dates = [d.strip() if d else "" for d in date_row[1:15]]
            if fortnight.weekday_dates:
                fortnight.period_start = fortnight.weekday_dates[0]
                fortnight.period_end = fortnight.weekday_dates[-1]

            for row in ft_table[3:]:
                if not row or not row[0]:
                    continue
                line = CurrentFortnightLine()
                line.type = row[0].replace('\n', ' ').strip()
                line.daily_values = []
                for i in range(1, 15):
                    val = row[i] if i < len(row) and row[i] else ""
                    line.daily_values.append(val.strip() if val else "")
                if len(row) > 15 and row[15]:
                    line.units = parse_amount(row[15])
                if len(row) > 16 and row[16]:
                    line.rate = parse_amount(row[16])
                if len(row) > 17 and row[17]:
                    line.amount = parse_amount(row[17])
                fortnight.lines.append(line)

    # Gross / totals from text
    m = re.search(r'Current Fortnight Gross Pay\s+([\d,]+\.\d{2})', text)
    if m:
        gross_pay = parse_amount(m.group(1))
        fortnight.gross_pay = gross_pay

    m = re.search(r'Total Gross\s+([\d,]+\.\d{2})', text)
    if m:
        total_gross = parse_amount(m.group(1))

    m = re.search(r'Net Income\s+([\d,]+\.\d{2})', text)
    if m:
        net_income = parse_amount(m.group(1))

    return employee, fortnight, gross_pay, total_gross, net_income


# ─── Page 2 Parser ───────────────────────────────────────────────────────────

def parse_page2(page) -> tuple:
    """Parse adjustment pages (Page 2+).
    Returns: (adjustments, subtotal_prev4, subtotal_older, total, overpayment_net)
    """
    tables = page.extract_tables()
    adjustments = []
    subtotal_prev4 = 0.0
    subtotal_older = 0.0
    total = 0.0
    overpayment_net = 0.0

    if not tables:
        return adjustments, subtotal_prev4, subtotal_older, total, overpayment_net

    table = tables[0]
    current_section = "previous_4"

    for row in table:
        if not row or not row[0]:
            continue

        cell0 = row[0].strip()

        # Skip header/summary/junk rows
        skip_prefixes = (
            "Year To Date", "Pay Type", "Type", "Units", "Rate",
            "Amount", "Date", "Description", "Current", "Gross",
            "Net ", "Tax", "Deductions", "Allowances", "Super",
            "Employer Super", "Leave Balances", "in the my",
            "For pay enquiries", "log and track", "Page -",
            "You have a new", "o This pay period", "o The overpayment",
            "o To enter", "If you wish", "Logging an enquiry",
            "Email:", "Telephone:", "made to your", "steps to establish",
            "by:", "Person ID", "Distribution Point",
        )
        if cell0.startswith(skip_prefixes):
            continue

        if cell0.startswith("Adjustments From Previous 4"):
            current_section = "previous_4"
            continue
        elif cell0.startswith("Adjustments From > Previous 4"):
            current_section = "older"
            continue
        elif cell0.startswith("Pay Date"):
            continue
        elif cell0.startswith("Total Adjustments"):
            # Extract amount with sign: may contain "Overpayment" with negative
            m = re.search(r'-?\s*[\d,]+\.\d{2}', cell0)
            if m:
                total = parse_amount(m.group(0).replace(' ', ''))
            continue
        elif cell0.startswith("New Overpayment"):
            m = re.search(r'-?\s*[\d,]+\.\d{2}', cell0)
            if m:
                overpayment_net = abs(parse_amount(m.group(0).replace(' ', '')))
            continue
        elif cell0.startswith("Sub Total:"):
            subtotal_val = parse_amount(row[1]) if len(row) > 1 and row[1] else 0.0
            if current_section == "previous_4":
                subtotal_prev4 = subtotal_val
            else:
                subtotal_older = subtotal_val
            continue

        # Data row: newline-delimited columns
        types_str = cell0
        dates_str = row[1] if len(row) > 1 and row[1] else ""
        units_str = row[3] if len(row) > 3 and row[3] else ""
        rates_str = row[4] if len(row) > 4 and row[4] else ""
        amounts_str = row[5] if len(row) > 5 and row[5] else ""

        types = types_str.split('\n') if types_str else []
        dates = dates_str.split('\n') if dates_str else []
        units = units_str.split('\n') if units_str else []
        rates = rates_str.split('\n') if rates_str else []
        amounts = amounts_str.split('\n') if amounts_str else []

        n = len(types)
        dates += [''] * (n - len(dates))
        units += [''] * (n - len(units))
        rates += [''] * (n - len(rates))
        amounts += [''] * (n - len(amounts))

        for i in range(n):
            type_val = types[i].strip()
            if not type_val:
                continue

            # Filter prose/junk lines that aren't pay types
            # Real pay types are short, alphanumeric with underscores/hyphens
            # Junk lines are long sentences with spaces
            if _is_junk_type(type_val):
                continue

            if "Adjustment" in type_val:
                adj = AdjustmentLine()
                adj.type = type_val.replace(" - Adjustment", "").strip()
                adj.section = "adjustment_only"
                adj.amount = parse_amount(amounts[i]) if i < len(amounts) else 0.0
                adjustments.append(adj)
                continue

            date_val = dates[i].strip() if i < len(dates) else ""
            if not DATE_RE.match(date_val):
                continue  # leave-balance / super tables never carry a dd.mm.yyyy date

            adj = AdjustmentLine()
            adj.type = type_val
            adj.date = date_val
            adj.units = parse_units(units[i]) if i < len(units) else 0.0
            adj.rate = parse_amount(rates[i]) if i < len(rates) else 0.0
            adj.amount = parse_amount(amounts[i]) if i < len(amounts) else 0.0
            adj.section = current_section
            adjustments.append(adj)

    return adjustments, subtotal_prev4, subtotal_older, total, overpayment_net


# Known pay type prefixes that appear on adjustment pages
_KNOWN_PAY_PREFIXES = {
    'overtime', 'recall', 'meal', 'fatigue', 'oca', 'shift', 'locality',
    'rmo', 'fortnightly', 'public_holiday', 'on_call', 'penalty',
}


def _is_junk_type(type_val: str) -> bool:
    """Return True if type_val looks like prose/junk rather than a pay type."""
    # Very long strings are almost certainly prose
    if len(type_val) > 60:
        return True
    # Real pay types use underscores and are relatively compact
    lower = type_val.lower()
    # Check if it starts with a known pay type prefix
    for prefix in _KNOWN_PAY_PREFIXES:
        if lower.startswith(prefix):
            return False
    # Contains sentence-like patterns (multiple spaces between words)
    words = type_val.split()
    if len(words) > 5:
        return True
    # Contains common prose words
    junk_words = {'the', 'this', 'that', 'your', 'been', 'have', 'period',
                  'identified', 'please', 'login', 'contact', 'services',
                  'enquiry', 'enquiries', 'following', 'repaid', 'recovered'}
    if any(w.lower() in junk_words for w in words):
        return True
    return False


# ─── Main Parser ─────────────────────────────────────────────────────────────

def looks_like_payslip(first_page_text: str) -> bool:
    """The SAP payslip header cells parse_page1 reads. Cheap and deterministic; used to classify a dropped PDF."""
    return "Pay Date" in first_page_text and ("Employee Name" in first_page_text or "Person ID" in first_page_text)


def parse_payslip(pdf_path: str) -> PayslipData:
    result = PayslipData()

    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) < 1:
            raise ValueError("PDF has no pages")

        employee, fortnight, gross_pay, total_gross, net_income = parse_page1(pdf.pages[0])
        result.employee = employee
        result.current_fortnight = fortnight
        result.total_gross = total_gross
        result.net_income = net_income
        with_text = pdf.pages[0].extract_text() or ""
        result.locality = _extract_locality(with_text)
        result.page1_lines, result.covered_dates = page1_dated_lines(fortnight, employee.pay_date)
        if result.covered_dates:
            result.fortnights = [{"start": result.covered_dates[0], "end": result.covered_dates[-1],
                                  "pay_date": employee.pay_date}]

        # Extract base hourly rate: prefer Fortnightly Salary, fall back to Rec Leave
        for line in fortnight.lines:
            if "salary" in line.type.lower():
                result.base_hourly_rate = line.rate
                result.fortnightly_salary = line.amount
                break
        if result.base_hourly_rate == 0:
            for line in fortnight.lines:
                if line.rate > 0 and ("rec leave" in line.type.lower() or
                                       "annual leave" in line.type.lower() or
                                       "leave" in line.type.lower()):
                    result.base_hourly_rate = line.rate
                    break

        # Scan ALL pages after Page 1 for adjustment tables
        # Payslips can be 2-4+ pages; adjustments may be on any page
        all_adjustments = []
        best_sub4 = 0.0
        best_sub_older = 0.0
        best_adj_total = 0.0
        overpayment = 0.0
        for page_idx in range(1, len(pdf.pages)):
            try:
                adjustments, sub4, sub_older, adj_total, op_net = parse_page2(pdf.pages[page_idx])
                if adjustments:
                    all_adjustments.extend(adjustments)
                if sub4 != 0:
                    best_sub4 = sub4
                if sub_older != 0:
                    best_sub_older = sub_older
                if adj_total != 0:
                    best_adj_total = adj_total
                if op_net != 0:
                    overpayment = op_net
            except Exception:
                continue
        result.adjustments = all_adjustments
        result.adjustment_subtotal_prev4 = best_sub4
        result.adjustment_subtotal_older = best_sub_older
        result.adjustment_total = best_adj_total
        result.overpayment_amount = overpayment
        # Flag as overpayment payslip if net adjustments are negative
        if best_adj_total < 0 or overpayment > 0:
            result.is_overpayment_payslip = True

    return result


def payslip_to_dict(data: PayslipData) -> dict:
    return asdict(data)


def _num(v) -> float:
    try:
        f = float(v or 0)
    except (TypeError, ValueError):
        return 0.0
    return f if math.isfinite(f) else 0.0  # NaN/inf would crash JSON output


def _obj(v, what: str) -> dict:
    if v is None:
        return {}
    if not isinstance(v, dict):
        raise ValueError(f"{what} must be an object")
    return v


def _list(v, what: str, limit: int) -> list:
    if v is None:
        return []
    if not isinstance(v, list) or len(v) > limit:
        raise ValueError(f"{what} must be a list of at most {limit} items")
    return v


def _line_from(d) -> AdjustmentLine:
    d = _obj(d, "line")
    return AdjustmentLine(type=str(d.get("type", ""))[:80], date=str(d.get("date", ""))[:10], units=_num(d.get("units")),
                          rate=_num(d.get("rate")), amount=_num(d.get("amount")), section=str(d.get("section", ""))[:20])


def payslip_from_dict(d) -> PayslipData:
    """Rebuild a PayslipData from payslip_to_dict() output (client-supplied: validate shape and sizes)."""
    if not isinstance(d, dict):
        raise ValueError("payslip must be an object")
    emp = _obj(d.get("employee"), "employee")
    ps = PayslipData()
    ps.employee = Employee(**{f.name: str(emp.get(f.name, ""))[:120] for f in dataclasses.fields(Employee)})
    cf = _obj(d.get("current_fortnight"), "current_fortnight")
    ps.current_fortnight = CurrentFortnight(period_start=str(cf.get("period_start", ""))[:10],
                                            period_end=str(cf.get("period_end", ""))[:10])
    ps.adjustments = [_line_from(a) for a in _list(d.get("adjustments"), "adjustments", 500)]
    ps.page1_lines = [_line_from(a) for a in _list(d.get("page1_lines"), "page1_lines", 200)]
    ps.covered_dates = [s for s in _list(d.get("covered_dates"), "covered_dates", 14) if isinstance(s, str) and DATE_RE.match(s)]
    ps.fortnights = [{k: str(_obj(f, "fortnight").get(k, ""))[:10] for k in ("start", "end", "pay_date")}
                     for f in _list(d.get("fortnights"), "fortnights", 1)]
    for name in ("adjustment_subtotal_prev4", "adjustment_subtotal_older", "adjustment_total", "total_gross",
                 "net_income", "base_hourly_rate", "fortnightly_salary", "overpayment_amount"):
        setattr(ps, name, _num(d.get(name)))
    ps.is_overpayment_payslip = bool(d.get("is_overpayment_payslip"))
    ps.locality = str(d.get("locality", ""))[:40]
    return ps


def unique_payslips(payslips: list) -> list:
    """Drop re-uploads: one payslip per pay date (a re-save may parse slightly differently).
    Without a pay date, only exact duplicates are dropped, so distinct undated payslips are kept."""
    key = lambda p: p.employee.pay_date or json.dumps(asdict(p), sort_keys=True)  # noqa: E731
    return list({key(p): p for p in reversed(payslips)}.values())[::-1]


def merge_payslips(payslips: list) -> PayslipData:
    """One actuals view over several uploaded payslips (see unique_payslips; ordered by pay date)."""
    def _dt(p):
        try:
            return datetime.strptime(p.employee.pay_date, "%d.%m.%Y")
        except ValueError:
            return datetime.min
    ordered = unique_payslips(sorted(payslips, key=_dt))
    latest = ordered[-1]
    merged = PayslipData(employee=latest.employee, current_fortnight=latest.current_fortnight)
    merged.locality = latest.locality
    merged.base_hourly_rate = next((p.base_hourly_rate for p in reversed(ordered) if p.base_hourly_rate), 0.0)
    merged.fortnightly_salary = latest.fortnightly_salary
    merged.is_overpayment_payslip = all(p.is_overpayment_payslip for p in ordered)
    for p in ordered:
        merged.adjustments += p.adjustments
        merged.page1_lines += p.page1_lines
        merged.covered_dates += p.covered_dates
        merged.fortnights += p.fortnights
        merged.adjustment_total += p.adjustment_total
        merged.adjustment_subtotal_prev4 += p.adjustment_subtotal_prev4
        merged.adjustment_subtotal_older += p.adjustment_subtotal_older
        merged.overpayment_amount += p.overpayment_amount
    return merged


# ─── Pretty Print ────────────────────────────────────────────────────────────

def print_summary(data: PayslipData):
    e = data.employee
    print(f"{'='*70}")
    print(f" PAYSLIP — {e.name} ({e.person_id})")
    print(f" Pay Date: {e.pay_date}  |  Position: {e.sub_position}")
    print(f" Classification: {e.classification}  |  PAN: {e.pan}")
    print(f"{'='*70}")

    print(f"\n BASE RATES")
    print(f"   Hourly:      ${data.base_hourly_rate:.4f}")
    print(f"   1.5x:        ${data.base_hourly_rate * 1.5:.4f}")
    print(f"   2.0x:        ${data.base_hourly_rate * 2:.4f}")
    print(f"   Fortnightly: ${data.fortnightly_salary:,.2f}")

    cf = data.current_fortnight
    print(f"\n CURRENT FORTNIGHT: {cf.period_start} -> {cf.period_end}")
    for line in cf.lines:
        daily = [v if v else "." for v in line.daily_values]
        daily_str = " ".join(f"{d:>5}" for d in daily)
        print(f"   {line.type:<25} {daily_str}  = {line.units:>6.2f}h x ${line.rate:.4f} = ${line.amount:>9,.2f}")
    print(f"   {'Fortnight Gross':>25} ${cf.gross_pay:>55,.2f}")

    print(f"\n ADJUSTMENTS (Page 2) — {len(data.adjustments)} entries")
    print(f"   {'Type':<30} {'Date':<12} {'Units':>7} {'Rate':>10} {'Amount':>10}")
    print(f"   {'-'*30} {'-'*12} {'-'*7} {'-'*10} {'-'*10}")

    current_date = ""
    for adj in data.adjustments:
        if adj.section == "adjustment_only":
            print(f"   {adj.type:<30} {'(adj)':>12} {'':>7} {'':>10} ${adj.amount:>9,.2f}")
            continue
        if adj.date != current_date:
            if current_date:
                print()
            current_date = adj.date
        print(f"   {adj.type:<30} {adj.date:<12} {adj.units:>7.2f} {adj.rate:>10.4f} ${adj.amount:>9,.2f}")

    print(f"\n   {'-'*70}")
    print(f"   {'Sub (prev 4 periods)':>42} {'':>18} ${data.adjustment_subtotal_prev4:>9,.2f}")
    print(f"   {'Sub (older periods)':>42} {'':>18} ${data.adjustment_subtotal_older:>9,.2f}")
    print(f"   {'TOTAL ADJUSTMENTS':>42} {'':>18} ${data.adjustment_total:>9,.2f}")

    if data.is_overpayment_payslip:
        print(f"\n   ⚠️  OVERPAYMENT / CLAWBACK DETECTED")
        if data.overpayment_amount > 0:
            print(f"   Net overpayment to be repaid: ${data.overpayment_amount:,.2f}")

    print(f"\n {'='*70}")
    print(f"   Total Gross:  ${data.total_gross:>12,.2f}")
    print(f"   Net Income:   ${data.net_income:>12,.2f}")
    print(f" {'='*70}")

    # Daily summary for reconciliation
    print(f"\n DAILY SUMMARY (for reconciliation)")
    by_date = {}
    for adj in data.adjustments:
        if adj.section == "adjustment_only" or not adj.date:
            continue
        if adj.date not in by_date:
            by_date[adj.date] = []
        by_date[adj.date].append(adj)

    for date in sorted(by_date.keys(), key=lambda d: datetime.strptime(d, "%d.%m.%Y")):
        items = by_date[date]
        day_total = sum(a.amount for a in items)
        try:
            dt = datetime.strptime(date, "%d.%m.%Y")
            dow = dt.strftime("%a")
        except:
            dow = "???"
        print(f"\n   {date} ({dow}) — ${day_total:,.2f}")
        for a in items:
            print(f"     {a.type:<28} {a.units:>6.2f}h x ${a.rate:.4f} = ${a.amount:>9,.2f}")


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python payslip_parser.py <payslip.pdf> [--json]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    json_output = "--json" in sys.argv

    data = parse_payslip(pdf_path)

    if json_output:
        print(json.dumps(payslip_to_dict(data), indent=2))
    else:
        print_summary(data)


if __name__ == "__main__":
    main()
