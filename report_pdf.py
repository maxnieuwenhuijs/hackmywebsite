"""Generate a PDF report for one hackmywebsite.ai run.

Usage:  python report_pdf.py <scan-dir>

Reads scan.json + findings.json, writes report.docx in the same folder.
The portal then converts that DOCX to PDF with LibreOffice.
Design: grey/white, one blue element (the CTA), owner-readable language.
"""
import json
import os
import sys

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

CARD = "F5F6F8"
CARD_LINE = "E1E4E8"
BAR = "A8AEB6"
PANEL = "FAFAFB"
INK = RGBColor(0x1F, 0x23, 0x28)
BODY = RGBColor(0x33, 0x38, 0x3E)
MUTED = RGBColor(0x6B, 0x72, 0x7B)
INK_HEX = "1F2328"
BLUE = "1A73E8"

SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def borders(cell, color, sz=6, sides=("top", "left", "bottom", "right")):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:tcBorders")
    for side in sides:
        b = OxmlElement(f"w:{side}")
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), str(sz))
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), color)
        el.append(b)
    tcPr.append(el)


def no_borders(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        b = OxmlElement(f"w:{side}")
        b.set(qn("w:val"), "nil")
        el.append(b)
    tcPr.append(el)


def table_borders(t, color=CARD_LINE, sz=6):
    tblPr = t._tbl.tblPr
    el = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{side}")
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), str(sz))
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), color)
        el.append(b)
    tblPr.append(el)


def margins(cell, top=0.14, bottom=0.14, left=0.24, right=0.2):
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        e = OxmlElement(f"w:{side}")
        e.set(qn("w:w"), str(int(val * 567)))
        e.set(qn("w:type"), "dxa")
        mar.append(e)
    tcPr.append(mar)


def card(doc, title, lines, fill=CARD, bar=BAR, split=False):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    if not split:
        t.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    c = t.rows[0].cells[0]
    c.width = Cm(16.0)
    shade(c, fill)
    borders(c, CARD_LINE, sz=6)
    borders(c, bar, sz=24, sides=("left",))
    margins(c)
    p0 = c.paragraphs[0]
    p0.paragraph_format.space_before = Pt(2)
    p0.paragraph_format.space_after = Pt(4)
    r0 = p0.add_run(title)
    r0.bold = True
    r0.font.size = Pt(10.5)
    r0.font.color.rgb = INK
    for text, bold in lines:
        p = c.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(3)
        rr = p.add_run(text)
        rr.bold = bold
        rr.font.size = Pt(9.5) if not text.startswith("    ") else Pt(8.5)
        rr.font.color.rgb = INK if bold else BODY
        if text.startswith("    "):
            p.paragraph_format.left_indent = Cm(0.35)
    gap = doc.add_paragraph()
    gap.paragraph_format.space_after = Pt(3)
    return t


def button(doc, label, sub=None):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.rows[0].cells[0]
    c.width = Cm(10.0)
    shade(c, BLUE)
    borders(c, BLUE, sz=6)
    margins(c, top=0.2, bottom=0.2, left=0.3, right=0.3)
    p = c.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(label)
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    if sub:
        p2 = c.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(sub)
        r2.font.size = Pt(8.5)
        r2.font.color.rgb = RGBColor(0xE8, 0xF0, 0xFE)
    doc.add_paragraph()


def grid(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_borders(t)
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        c.text = ""
        shade(c, "EDEFF2")
        r = c.paragraphs[0].add_run(h)
        r.bold = True
        r.font.size = Pt(8.5)
        r.font.color.rgb = INK
    for row in rows:
        cells = t.add_row().cells
        t.rows[-1]._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for i, val in enumerate(row):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(val))
            r.font.size = Pt(8.5)
            r.font.color.rgb = BODY
        if widths:
            for i, w in enumerate(widths):
                cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


def build(scan_dir):
    with open(os.path.join(scan_dir, "scan.json"), encoding="utf-8") as f:
        scan = json.load(f)
    fpath = os.path.join(scan_dir, "findings.json")
    data = {"findings": [], "summary": "", "blocked": "", "tested": []}
    if os.path.exists(fpath):
        with open(fpath, encoding="utf-8") as f:
            data = json.load(f)
    findings = sorted(data.get("findings") or [],
                      key=lambda x: SEV_ORDER.get(str(x.get("severity", "")).lower(), 9))

    doc = Document()
    for s in doc.sections:
        s.top_margin = Cm(1.9)
        s.bottom_margin = Cm(1.9)
        s.left_margin = Cm(2.1)
        s.right_margin = Cm(2.1)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = BODY
    normal.paragraph_format.space_after = Pt(7)
    for lvl, size in ((1, 14), (2, 11.5)):
        st = doc.styles[f"Heading {lvl}"]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.color.rgb = INK

    # title
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run("SECURITY ASSESSMENT REPORT")
    r.bold = True
    r.font.size = Pt(21)
    r.font.color.rgb = INK
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(12)
    mode = "Active penetration test" if scan.get("mode") == "pentest" else "Logout-state reconnaissance"
    r = p.add_run(f"{mode} of {scan.get('host')}")
    r.font.size = Pt(11.5)
    r.font.color.rgb = MUTED

    import datetime
    started = scan.get("startedAt")
    when = datetime.datetime.fromtimestamp(started / 1000).strftime("%d %b %Y, %H:%M") if started else "â€”"
    meta = doc.add_table(rows=4, cols=2)
    for i, (k, v) in enumerate([
        ("Target", scan.get("url", "")),
        ("Tested", when),
        ("Mode", "active pentest (payloads sent)" if scan.get("mode") == "pentest" else "recon (no payloads)"),
        ("Cost", f"${scan.get('spentUsd', 0):.3f} of ${scan.get('budgetUsd', 0):.2f} Â· {scan.get('steps', 0)} steps"),
    ]):
        c0, c1 = meta.rows[i].cells
        shade(c0, CARD)
        no_borders(c0)
        no_borders(c1)
        margins(c0, top=0.08, bottom=0.08)
        margins(c1, top=0.08, bottom=0.08)
        r0 = c0.paragraphs[0].add_run(k)
        r0.bold = True
        r0.font.size = Pt(8.5)
        r0.font.color.rgb = MUTED
        r1 = c1.paragraphs[0].add_run(str(v))
        r1.font.size = Pt(9)
        r1.font.color.rgb = INK
        for q in (c0.paragraphs[0], c1.paragraphs[0]):
            q.paragraph_format.space_after = Pt(0)
    doc.add_paragraph()

    # headline
    crit_high = [f for f in findings if str(f.get("severity", "")).lower() in ("critical", "high")]
    if findings:
        head = f"{len(findings)} finding{'s' if len(findings) != 1 else ''}, of which {len(crit_high)} serious"
        lead = data.get("summary") or "See the findings below."
    else:
        head = "No exploitable weakness was confirmed in this run"
        lead = data.get("summary") or ("Nothing was found that lets an anonymous visitor read, change "
                                       "or escalate beyond what the site intends to expose.")
    card(doc, head, [(lead, False)], fill=PANEL, bar=INK_HEX)

    # authorisation + testing disclaimer: this is what makes the report defensible
    writes = data.get("writeActions") or []
    reverted = [w for w in writes if w.get("reverted")]
    consent = scan.get("consent") or {}
    aggressive = bool(scan.get("aggressive"))
    card(doc, "Authorisation and testing disclaimer", [
        ("This was not a passive review.", True),
        (("The tester ran an active exploitation engagement against a system the client "
          "declared they own, including state-changing requests used to prove blast radius.")
         if aggressive else
         ("The tester ran an active but read-only engagement: requests were sent, but no "
          "data was intentionally modified."), False),
        ("Authorisation", True),
        ("Client declared ownership and authorised active testing"
         + (f" (consent recorded {consent.get('acceptedAt', '')})." if consent else "."), False),
        ("State changes", True),
        (f"{len(writes)} state-changing request(s), {len(reverted)} reverted"
         + (f", {len(writes) - len(reverted)} still outstanding." if len(writes) != len(reverted) else ", none outstanding.")
         + (" Only objects the tester created were modified." if aggressive else ""), False),
        ("Residual risk", True),
        ("No denial of service, no mass inserts, no changes to real customer, staff or admin "
         "records, no executable uploads. Behaviour outside those bounds was not tested.", False),
        ("Warranty", True),
        ("Findings reflect the window tested against the live system; ratings are judgements "
         "from evidence, and absence of findings is not proof of absence of vulnerability.", False),
    ], fill=PANEL)

    # findings
    if findings:
        doc.add_heading("Findings", level=1)
        for f in findings:
            sev = str(f.get("severity", "info")).upper()
            status = f.get("status", "")
            title = f"{f.get('id', '')} â€” {f.get('title', 'Untitled')}   [{sev}{', ' + status if status else ''}]"
            lines = []
            if f.get("impact"):
                lines.append(("Impact", True))
                lines.append((str(f["impact"]), False))
            for label, key in (("What we sent", "request"), ("What came back", "response"),
                               ("Root cause", "rootCause"), ("Fix", "fix")):
                if f.get(key):
                    lines.append((label, True))
                    body = str(f[key])
                    limit = {"request": 500, "response": 900, "rootCause": 450, "fix": 450}.get(key, 400)
                    if len(body) > limit:
                        body = body[:limit].rstrip() + " [...]"
                    lines.append(("    " + body.replace("\n", " "), False))
            # findings cards are allowed to break across pages: an unbreakable tall card
            # leaves a giant blank area and makes the report look broken
            card(doc, title, lines, split=True)

    # coverage
    tested = data.get("tested") or []
    if tested:
        doc.add_heading("What we tested", level=1)
        rows = []
        for item in tested[:80]:
            if isinstance(item, dict):
                rows.append((str(item.get("route", ""))[:70], str(item.get("result", ""))[:90]))
            else:
                txt = str(item)
                if " â€” " in txt:
                    a, b = txt.split(" â€” ", 1)
                    rows.append((a[:70], b[:90]))
                else:
                    rows.append((txt[:70], ""))
        grid(doc, ("Route / area", "Result"), rows, widths=(8.0, 8.0))

    if data.get("blocked"):
        doc.add_heading("What we could not test", level=1)
        card(doc, "Read this before you relax", [(str(data["blocked"]), False)], fill=PANEL)

    # CTA
    if crit_high:
        button(doc, "Fix the serious findings first",
               "start with the highest severity item above")
    else:
        button(doc, "Ask for a logged-in test",
               "the biggest untested area is what a signed-in user can reach")

    p = doc.add_paragraph()
    r = p.add_run(f"Generated by hackmywebsite.ai for run {scan.get('id')}. Every finding carries the exact "
                  f"request and response; raw logs are kept in the scan folder.")
    r.italic = True
    r.font.size = Pt(8.5)
    r.font.color.rgb = MUTED

    out = os.path.join(scan_dir, "report.docx")
    doc.save(out)
    print(out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python report_pdf.py <scan-dir>", file=sys.stderr)
        sys.exit(2)
    build(sys.argv[1])
