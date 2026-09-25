import sys
from pathlib import Path

import pikepdf
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
from avac_parser import AvacFormatError, FLATTENED_MSG, parse_avac
from payslip_parser import PayslipData, Employee

HELVETICA = pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica)


def text_pdf(path, lines):
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(595, 842))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=HELVETICA))
    body = " ".join(f"({l}) Tj T*" for l in lines)
    page.Contents = pdf.make_stream(f"BT /F1 9 Tf 12 TL 30 800 Td {body} ET".encode("latin-1"))
    pdf.save(path)
    return pdf


def test_printed_static_avac_is_parsed(tmp_path):
    path = tmp_path / "printed.pdf"
    text_pdf(path, [
        "Attendance Variation and Allowance Claim",
        "1 Alex Sample L6 10/03/2025 07:30 15:36 07:30 18:30 Overtime ward round AS",
        "2 Alex Sample L6 11/03/2025 20:30 00:00 Recall Onsite deteriorating patient AS",
        "3 Alex Sample L6 12/03/2025 07:30 15:36 07:30 17:00 Overtime *Fatigue pay* AS",
    ])
    result = parse_avac(str(path))
    s = result["shifts"]
    assert [(x["date_iso"], x["rostered_start"], x["actual_start"], x["actual_finish"], x["variation_type"]) for x in s] == [
        ("2025-03-10", "07:30", "07:30", "18:30", "Overtime"),
        ("2025-03-11", None, "20:30", "00:00", "Recall Onsite"),
        ("2025-03-12", "07:30", "07:30", "17:00", "Overtime")]
    assert s[2]["insufficient_break"] is True and s[2]["initials"] == "AS" and "Fatigue" in s[2]["reason"]
    assert result["summary"]["shift_count"] == 3


def test_flattened_dynamic_xfa_gives_specific_error(tmp_path):
    path = tmp_path / "flat.pdf"
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(595, 842))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=HELVETICA))
    page.Contents = pdf.make_stream(b"BT /F1 12 Tf 30 800 Td (Please wait... If this message is not eventually replaced) Tj ET")
    pdf.Root.AcroForm = pikepdf.Dictionary(Fields=pikepdf.Array(), XFA=pikepdf.Array([
        pikepdf.String("datasets"), pdf.make_stream(b"<xfa:datasets><xfa:data/></xfa:datasets>"),
        pikepdf.String("form"), pdf.make_stream(b"<subform/>")]))
    pdf.save(path)
    with pytest.raises(AvacFormatError) as exc:
        parse_avac(str(path))
    assert exc.value.user_message == FLATTENED_MSG


def test_unrelated_pdf_gives_unreadable_error(tmp_path):
    path = tmp_path / "other.pdf"
    text_pdf(path, ["Just a letter"])
    with pytest.raises(AvacFormatError) as exc:
        parse_avac(str(path))
    assert "does not look like an AVAC" in exc.value.user_message


def test_flattened_placeholder_without_xfa_gives_specific_error(tmp_path):
    """A dynamic AVAC printed/saved by a non-XFA-aware tool loses its XFA container too —
    the page is just the short placeholder, same as the real ~676-char "Please wait..." page."""
    path = tmp_path / "flat_no_xfa.pdf"
    text_pdf(path, [
        "Please wait...",
        "If this message is not eventually replaced by the proper contents of the document,",
        "your PDF viewer may not be able to display this type of document.",
    ])
    with pytest.raises(AvacFormatError) as exc:
        parse_avac(str(path))
    assert exc.value.user_message == FLATTENED_MSG


def test_long_unrelated_document_mentioning_please_wait_gives_unreadable_error(tmp_path):
    """A normal document that happens to say "please wait" once must not be mistaken
    for a flattened AVAC: it is long and lacks the standard XFA placeholder sentence."""
    path = tmp_path / "letter.pdf"
    filler = "This is a routine administrative notice about your employment file and has no shift rows."
    lines = [filler] * 20 + ["Please wait for a follow-up letter about this matter in due course."]
    text_pdf(path, lines)
    with pytest.raises(AvacFormatError) as exc:
        parse_avac(str(path))
    assert "does not look like an AVAC" in exc.value.user_message


def test_unknown_variation_type_warning_reaches_report():
    ps = PayslipData(employee=Employee(name="Dr", pay_date="26.03.2025"))
    ps.base_hourly_rate = 60.0
    avac = {"employee": {}, "workplace": {}, "shifts": [{"line": 1, "date_iso": "2025-03-05", "rostered_start": None, "rostered_finish": None,
             "actual_start": "18:00", "actual_finish": "20:00", "variation_type": "Unknown", "reason": "", "initials": ""}]}
    response = main.run_reconciliation([ps], [("a.pdf", avac)])
    assert response["avac_results"][0]["report"]["warnings"] == ["Unknown type on 05.03.2025: Unknown"]
