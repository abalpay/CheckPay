"""
AVAC XFA PDF Parser for Checkpay
Extracts structured shift data from Queensland Health 
Attendance Variation and Allowance Claim (AVAC) forms.

Handles:
- Standard Variation rows (Variation2-7) with proper field names
- Overflow Variation8 rows where actual times are stored in RosteredStart fields
- Dates stored in form XML for Variation8 blocks
- Clinical notes/reasons from form XML
- Dropdown variation types (Overtime, Recall, etc.)

Usage:
    from avac_parser import parse_avac
    result = parse_avac("path/to/avac.pdf")
"""

import pikepdf
import re
import json
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional


# --- Dropdown mapping (from AVAC form template) ---
VARIATION_TYPE_MAP = {
    "0": "Overtime",
    "1": "Overtime",  # Planned OT in some form versions
    "2": "Recall Onsite",
    "3": "Recall Offsite",
    "4": "On Call",
    "5": "Shift Change",
}


@dataclass
class ShiftEntry:
    line: int
    date: Optional[str]
    date_iso: Optional[str]
    personnel_number: Optional[str]
    employee_name: Optional[str]
    pay_level: Optional[str]
    rostered_start: Optional[str]
    rostered_finish: Optional[str]
    actual_start: Optional[str]
    actual_finish: Optional[str]
    variation_type: str
    reason: str
    initials: str
    overtime_minutes: int = 0
    source_block: str = ""  # for debugging
    insufficient_break: bool = False  # 10-hour break rule triggered
    break_gap_hours: Optional[float] = None  # hours of rest before this shift
    previous_finish: Optional[str] = None  # when previous shift ended (for context)


@dataclass
class AVACData:
    employee_name: str
    personnel_number: str
    pay_level: str
    location: str
    department: str
    org_unit: str
    service_line: str
    shifts: list = field(default_factory=list)
    total_overtime_minutes: int = 0
    weekday_ot_minutes: int = 0
    weekend_recall_minutes: int = 0


def _extract_xfa_parts(pdf_path: str) -> dict:
    """Extract all XFA XML parts from a PDF."""
    pdf = pikepdf.open(pdf_path)
    
    if "/AcroForm" not in pdf.Root:
        raise ValueError("PDF has no AcroForm - not an XFA form")
    if "/XFA" not in pdf.Root["/AcroForm"]:
        raise ValueError("PDF has no XFA data - not an XFA form")
    
    xfa = pdf.Root["/AcroForm"]["/XFA"]
    
    parts = {}
    if isinstance(xfa, pikepdf.Array):
        i = 0
        while i < len(xfa):
            if isinstance(xfa[i], pikepdf.String):
                label = str(xfa[i])
                if i + 1 < len(xfa):
                    data = xfa[i + 1].read_bytes().decode('utf-8', errors='replace')
                    parts[label] = data
                i += 2
            else:
                i += 1
    
    pdf.close()
    return parts


def _parse_datasets_variations(datasets_xml: str) -> list[dict]:
    """Parse all Variation blocks from datasets XML."""
    variations = []
    
    # Split by Variation tags
    parts = re.split(r'(<Variation\d+)', datasets_xml)
    
    current_tag = None
    for part in parts:
        m = re.match(r'<(Variation\d+)', part)
        if m:
            current_tag = m.group(1)
            continue
        
        if current_tag:
            content = part.split(f'</{current_tag}')[0] if f'</{current_tag}' in part else part
            
            # Extract all tag-value pairs (including duplicates)
            fields = []
            for fm in re.finditer(r'<(\w+)\n?>([^<]*)<', content):
                tag, val = fm.group(1), fm.group(2).strip()
                if val:
                    fields.append((tag, val))
            
            # Also track empty fields
            for fm in re.finditer(r'<(\w+)\n?/>', content):
                fields.append((fm.group(1), None))
            
            variations.append({
                'block_name': current_tag,
                'fields': fields,
            })
            current_tag = None
    
    return variations


def _parse_form_blocks(form_xml: str) -> list[dict]:
    """Parse form XML to extract names, dates, reasons, initials for each row.
    
    Uses position-based extraction: finds each <subform name="VariationN">
    tag, then extracts content up to its closing </subform.
    """
    blocks = []
    
    # Find all Variation subform start positions
    starts = [(m.start(), m.group(1)) for m in 
              re.finditer(r'<subform name="(Variation\d+)"\n?>', form_xml)]
    
    for pos, block_name in starts:
        # Get content between opening tag and first </subform
        tag_end = form_xml.index('>', pos) + 1
        close_pos = form_xml.find('</subform', tag_end)
        if close_pos < 0:
            continue
        content = form_xml[tag_end:close_pos]
        
        block = {'block_name': block_name}
        
        # Extract date (ISO format in Variation8 blocks)
        # Note: closing tag may be </date\n> so don't require > after </date
        dates = re.findall(r'<date\n?>([^<]+)</date', content)
        if dates:
            block['date_iso'] = dates[0].strip()
        
        # Extract all text values - handle <text\n>content</text\n> format
        text_values = []
        for tm in re.finditer(r'<text(?:\s[^>]*)?\n?>([^<]*)</text\n?>', content):
            val = tm.group(1).strip()
            if val:
                text_values.append(val.replace('&#xD;', ' | '))
        
        # Classify text values by pattern
        block['personnel_number'] = None
        block['employee_name'] = None
        block['pay_level'] = None
        block['reason'] = None
        block['initials'] = None
        
        for tv in text_values:
            if re.match(r'^\d{5,8}$', tv):
                block['personnel_number'] = tv
            elif re.match(r'^L\d+\s*$', tv):
                block['pay_level'] = tv.strip()
            elif re.match(r'^[A-Z]{1,4}\s*$', tv) and len(tv.strip()) <= 3:
                block['initials'] = tv.strip()
            elif not block.get('employee_name'):
                # Check if it looks like a name (2-3 Title case words, all alpha)
                words = tv.split()
                if (len(words) in (1, 2, 3) and 
                    all(w[0].isupper() and w.isalpha() for w in words)):
                    block['employee_name'] = tv.strip()
                else:
                    block['reason'] = tv
            else:
                # Already have a name, this is likely a reason
                if not block.get('reason') and len(tv) > 3:
                    # Don't overwrite with short codes
                    if not re.match(r'^[A-Z]{1,4}\s*$', tv):
                        block['reason'] = tv
        
        # Extract dropdown reference
        dd = re.findall(r'DropDownList(\d+)', content)
        if dd:
            block['dropdown_id'] = dd[0]
        
        blocks.append(block)
    
    return blocks


def _build_shifts(dataset_variations: list, form_blocks: list, dropdown_values: dict) -> list[ShiftEntry]:
    """
    Combine dataset variations and form blocks into shift entries.
    
    Key insight: datasets and form blocks are ordered the same way.
    For standard rows (Variation2-7), datasets have proper ActualStart/ActualFinish.
    For overflow rows (Variation8), actual times may be stored in RosteredStart fields.
    """
    shifts = []
    
    # Filter out HeaderRow entries from datasets
    data_rows = [v for v in dataset_variations 
                 if not v['block_name'].startswith('Header')]
    
    # Match dataset rows with form blocks by position
    line_num = 1
    
    for idx, data_row in enumerate(data_rows):
        fields = data_row['fields']
        block_name = data_row['block_name']
        
        # Get corresponding form block
        form_block = form_blocks[idx] if idx < len(form_blocks) else {}
        
        # Extract values from dataset fields
        field_dict_all = {}  # track all occurrences
        for tag, val in fields:
            if tag not in field_dict_all:
                field_dict_all[tag] = []
            field_dict_all[tag].append(val)
        
        # Standard field extraction
        personnel = _first_val(field_dict_all, 'PersonnelAssignment')
        date_str = _first_val(field_dict_all, 'Date')
        rostered_start = _first_val(field_dict_all, 'RosteredStart')
        rostered_finish = _first_val(field_dict_all, 'RosteredFinish')
        actual_start = _first_val(field_dict_all, 'ActualStart')
        actual_finish = _first_val(field_dict_all, 'ActualFinish')
        
        # --- CRITICAL FIX: Handle Variation8 overflow ---
        # When actual times are stored in RosteredStart fields.
        # This ONLY applies to Variation8 blocks (overflow rows),
        # not standard Variation2-7 which have proper field names.
        if not actual_start and not actual_finish and block_name == 'Variation8':
            rostered_values = [v for v in field_dict_all.get('RosteredStart', []) if v]
            if len(rostered_values) >= 2:
                actual_start = rostered_values[0]
                actual_finish = rostered_values[1]
                rostered_start = None
                rostered_finish = None
            elif len(rostered_values) == 1:
                actual_start = rostered_values[0]
                rostered_start = None
        
        # --- FATIGUE PAY / INSUFFICIENT BREAK ---
        # If rostered times exist but no actual times, this is typically a
        # "10-hour break" claim: the doctor didn't get sufficient rest between
        # shifts (e.g., finished at 02:30, rostered again at 07:30 = only 5h gap).
        # Under QLD Health awards, the next rostered shift is paid at OT rates.
        # The rostered hours ARE the claimable hours (paid at OT rate).
        is_insufficient_break = False
        if rostered_start and rostered_finish and not actual_start and not actual_finish:
            is_insufficient_break = True
            # The rostered hours become the "actual" claimable hours
            # Clear rostered so OT calc treats full duration as claimable
            actual_start = rostered_start
            actual_finish = rostered_finish
            rostered_start = None
            rostered_finish = None
        
        # Get date from form block if not in datasets
        date_iso = form_block.get('date_iso')
        if date_iso and not date_str:
            try:
                dt = datetime.strptime(date_iso, '%Y-%m-%d')
                date_str = dt.strftime('%d/%m/%Y')
            except ValueError:
                pass
        
        # Skip completely empty rows (no rostered, no actual, no insufficient break)
        if not actual_start and not actual_finish and not rostered_start and not is_insufficient_break:
            continue
        
        # Determine variation type from dropdown
        dd_id = form_block.get('dropdown_id', '')
        dd_value = dropdown_values.get(dd_id, '')
        variation_type = VARIATION_TYPE_MAP.get(dd_value, dd_value if dd_value else 'Unknown')
        
        # Override type for insufficient break entries
        # Only when there are genuinely no actual hours (pure fatigue/break claim)
        # If FATIGUE appears in reason but actual hours exist, it's just a note
        reason_text = form_block.get('reason', '') or ''
        if is_insufficient_break:
            variation_type = 'Insufficient Break'
        
        # Calculate overtime
        ot_mins = _calc_overtime(rostered_start, rostered_finish, actual_start, actual_finish, variation_type)
        
        shift = ShiftEntry(
            line=line_num,
            date=date_str,
            date_iso=date_iso or _to_iso(date_str),
            personnel_number=personnel or form_block.get('personnel_number'),
            employee_name=form_block.get('employee_name'),
            pay_level=form_block.get('pay_level'),
            rostered_start=rostered_start,
            rostered_finish=rostered_finish,
            actual_start=actual_start,
            actual_finish=actual_finish,
            variation_type=variation_type,
            reason=form_block.get('reason', ''),
            initials=form_block.get('initials', ''),
            overtime_minutes=ot_mins,
            source_block=block_name,
        )
        
        shifts.append(shift)
        line_num += 1
    
    return shifts


def _first_val(field_dict: dict, key: str) -> Optional[str]:
    """Get first non-None value for a field."""
    vals = field_dict.get(key, [])
    for v in vals:
        if v:
            return v
    return None


def _to_iso(date_str: Optional[str]) -> Optional[str]:
    """Convert dd/mm/yyyy to yyyy-mm-dd."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%d/%m/%Y').strftime('%Y-%m-%d')
    except ValueError:
        return None


def _parse_time(t: str) -> Optional[datetime]:
    """Parse HH:MM time string."""
    if not t:
        return None
    try:
        return datetime.strptime(t.strip(), "%H:%M")
    except ValueError:
        return None


def _calc_overtime(rost_start, rost_finish, act_start, act_finish, variation_type):
    """Calculate overtime minutes for a shift.
    
    Rules:
    - If rostered times exist: OT = actual duration - rostered duration
      (regardless of whether type is Overtime or Recall)
    - If no rostered times: OT = entire actual duration (unrostered work)
    - Fatigue pay / no actual times: OT = 0 (handled separately)
    """
    af = _parse_time(act_finish)
    aa = _parse_time(act_start)
    rf = _parse_time(rost_finish)
    rs = _parse_time(rost_start)
    
    if not af or not aa:
        return 0
    
    # Handle overnight shifts
    actual_duration = af - aa
    if actual_duration.total_seconds() < 0:
        actual_duration += timedelta(days=1)
    
    if rf and rs:
        # Rostered shift exists: OT is time beyond rostered period
        rostered_duration = rf - rs
        if rostered_duration.total_seconds() < 0:
            rostered_duration += timedelta(days=1)
        
        ot = actual_duration - rostered_duration
        if ot.total_seconds() > 0:
            return int(ot.total_seconds() // 60)
        return 0
    else:
        # Unrostered work (recall, callback, weekend): all actual time counts
        return int(actual_duration.total_seconds() // 60)


def _detect_insufficient_breaks(shifts: list[ShiftEntry], min_break_hours: float = 10.0):
    """
    Post-process shifts to detect 10-hour break rule violations.
    
    The rule: if a doctor doesn't get {min_break_hours} hours rest before
    their next ROSTERED shift, that shift should be paid at OT rates
    until they've had the required break.
    
    This detects the pattern automatically by checking consecutive shifts,
    even if the doctor didn't explicitly flag it on the form.
    
    Only flags when the NEXT shift has rostered hours (is a scheduled shift).
    Same-day recalls are separate pay events, not break violations.
    """
    if len(shifts) < 2:
        return
    
    for i in range(1, len(shifts)):
        prev = shifts[i - 1]
        curr = shifts[i]
        
        # Only check if CURRENT shift has rostered hours (is a scheduled shift)
        if not curr.rostered_start or not curr.rostered_finish:
            # Also check insufficient break entries where rostered was moved to actual
            if curr.variation_type != 'Insufficient Break':
                continue
        
        # Need dates and times for both shifts
        if not prev.actual_finish or not curr.actual_start or not prev.date or not curr.date:
            continue
        
        try:
            # Build datetime for previous shift's finish
            prev_date = datetime.strptime(prev.date, '%d/%m/%Y')
            prev_finish_t = _parse_time(prev.actual_finish)
            if not prev_finish_t:
                continue
            prev_finish_dt = prev_date.replace(
                hour=prev_finish_t.hour, minute=prev_finish_t.minute
            )
            
            # Handle overnight: if finish time < start time, finish is next day
            if prev.actual_start:
                prev_start_t = _parse_time(prev.actual_start)
                if prev_start_t and prev_finish_t.hour < prev_start_t.hour:
                    prev_finish_dt += timedelta(days=1)
            
            # Build datetime for current shift's start
            curr_date = datetime.strptime(curr.date, '%d/%m/%Y')
            curr_start_t = _parse_time(curr.actual_start)
            if not curr_start_t:
                continue
            curr_start_dt = curr_date.replace(
                hour=curr_start_t.hour, minute=curr_start_t.minute
            )
            
            # Calculate gap
            gap = curr_start_dt - prev_finish_dt
            gap_hours = gap.total_seconds() / 3600
            
            # Flag if gap is less than required break AND it's a different
            # calendar period (not just two events on the same day with
            # the same rostered shift)
            if 0 <= gap_hours < min_break_hours:
                curr.insufficient_break = True
                curr.break_gap_hours = round(gap_hours, 1)
                curr.previous_finish = f"{prev.date} {prev.actual_finish}"
                
        except (ValueError, TypeError):
            continue


def parse_avac(pdf_path: str) -> dict:
    """
    Parse an AVAC XFA PDF and return structured shift data.
    
    Returns dict with employee info, shifts, and summary.
    """
    # 1. Extract XFA parts
    parts = _extract_xfa_parts(pdf_path)
    
    if 'datasets' not in parts:
        raise ValueError("No datasets found in XFA")
    if 'form' not in parts:
        raise ValueError("No form data found in XFA")
    
    datasets_xml = parts['datasets']
    form_xml = parts['form']
    
    # 2. Parse datasets for shift times
    dataset_variations = _parse_datasets_variations(datasets_xml)
    
    # 3. Parse form XML for names, dates, reasons
    form_blocks = _parse_form_blocks(form_xml)
    
    # 4. Extract dropdown values from datasets
    dropdown_values = {}
    for m in re.finditer(r'<DropDownList(\d+)\n?>([^<]*)<', datasets_xml):
        dropdown_values[m.group(1)] = m.group(2).strip()
    
    # 5. Extract metadata from datasets
    location = ''
    department = ''
    org_unit = ''
    service_line = ''
    
    loc_match = re.search(r'<PayPeriodDetails_Location\n?>([^<]+)<', datasets_xml)
    if loc_match:
        location = loc_match.group(1).strip()
    
    dept_matches = re.findall(r'<PayPeriodDetails_OrganisationalUnit\n?>([^<]+)<', datasets_xml)
    for d in dept_matches:
        d = d.strip()
        if re.match(r'^\d+$', d):
            org_unit = d
        else:
            department = d
    
    svc_match = re.search(r'<Serviceline\n?>([^<]+)<', datasets_xml)
    if svc_match:
        service_line = svc_match.group(1).strip()
    
    # 6. Build shifts
    shifts = _build_shifts(dataset_variations, form_blocks, dropdown_values)
    
    # 6b. Detect 10-hour break violations across consecutive shifts
    _detect_insufficient_breaks(shifts)
    
    # 7. Get employee info from first shift or form blocks
    emp_name = ''
    emp_num = ''
    emp_level = ''
    
    for fb in form_blocks:
        if fb.get('employee_name'):
            emp_name = fb['employee_name']
        if fb.get('personnel_number'):
            emp_num = fb['personnel_number']
        if fb.get('pay_level'):
            emp_level = fb['pay_level']
        if emp_name and emp_num and emp_level:
            break
    
    # 8. Calculate summaries
    total_ot = sum(s.overtime_minutes for s in shifts)
    
    weekday_ot = sum(s.overtime_minutes for s in shifts 
                     if s.date_iso and datetime.strptime(s.date_iso, '%Y-%m-%d').weekday() < 5
                     and 'Recall' not in s.variation_type
                     and 'Insufficient Break' not in s.variation_type)
    
    weekend_recall = sum(s.overtime_minutes for s in shifts 
                        if 'Recall' in s.variation_type
                        and s.date_iso 
                        and datetime.strptime(s.date_iso, '%Y-%m-%d').weekday() >= 5)
    
    weekday_recall = sum(s.overtime_minutes for s in shifts
                        if 'Recall' in s.variation_type
                        and s.date_iso 
                        and datetime.strptime(s.date_iso, '%Y-%m-%d').weekday() < 5)
    
    fatigue_entries = sum(1 for s in shifts 
                         if 'Insufficient Break' in s.variation_type 
                         or s.insufficient_break)
    
    result = {
        'employee': {
            'name': emp_name,
            'personnel_number': emp_num,
            'pay_level': emp_level,
        },
        'workplace': {
            'location': location,
            'department': department,
            'org_unit': org_unit,
            'service_line': service_line,
        },
        'shifts': [asdict(s) for s in shifts],
        'summary': {
            'total_overtime_minutes': total_ot,
            'total_overtime_hours': round(total_ot / 60, 2),
            'weekday_ot_minutes': weekday_ot,
            'weekday_ot_hours': round(weekday_ot / 60, 2),
            'weekend_recall_minutes': weekend_recall,
            'weekend_recall_hours': round(weekend_recall / 60, 2),
            'weekday_recall_minutes': weekday_recall,
            'weekday_recall_hours': round(weekday_recall / 60, 2),
            'insufficient_break_entries': fatigue_entries,
            'shift_count': len(shifts),
        }
    }
    
    return result


# --- CLI entry point ---
if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python avac_parser.py <path_to_avac.pdf>")
        sys.exit(1)
    
    result = parse_avac(sys.argv[1])
    print(json.dumps(result, indent=2))
