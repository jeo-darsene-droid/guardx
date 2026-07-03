import io
import os
from datetime import date
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "guardx_logo.png")
ACCENT_RED = RGBColor(0xB1, 0x12, 0x26)
NAVY = RGBColor(0x1F, 0x4E, 0x79)
GREY = RGBColor(0x99, 0x99, 0x99)

FOOTER_TEXT = "10 600, boul. Parkway, Montréal (Québec) H1J 1R6 – www.guard-x.com"


def _set_paragraph_spacing(paragraph, before=0, after=0, line=None):
    """Set tight spacing on a paragraph to help fit on one page."""
    if paragraph is None:
        return
    pf = paragraph.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if line is not None:
        pf.line_spacing = line


def _add_horizontal_line(paragraph):
    """Add a bottom border (horizontal line) to a paragraph."""
    p = paragraph._p
    pPr = p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), 'CCCCCC')
    pBdr.append(bottom)
    pPr.append(pBdr)


def _add_bottom_border_to_paragraph(paragraph, color="1F4E79", size="12"):
    """Add a thick bottom border to a paragraph (for letterhead separator)."""
    p = paragraph._p
    pPr = p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), size)
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color)
    pBdr.append(bottom)
    pPr.append(pBdr)


def _add_underline(paragraph):
    """Add underline formatting to all runs in a paragraph."""
    for run in paragraph.runs:
        run.font.underline = True


def generate_letter(prospect: dict, settings: dict) -> bytes:
    """Generate a single Word letter and return bytes.

    Format basé sur le modèle LETTRE.doc — lettre de relance pour inspection
    annuelle de protection incendie.
    """
    doc = Document()

    # Margins — professional letter spacing
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(1.8)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    mode = settings.get("mode", "postal")
    gestionnaire = prospect.get("Nom_Gestionnaire", "").strip() if isinstance(prospect.get("Nom_Gestionnaire"), str) else ""
    syndicat = prospect.get("Nom_Syndicat", "").strip() if isinstance(prospect.get("Nom_Syndicat"), str) else ""

    # ── LETTERHEAD: Logo centered at top ──
    if os.path.exists(LOGO_PATH):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _set_paragraph_spacing(p, 0, 2, 1.0)
        run = p.add_run()
        run.add_picture(LOGO_PATH, width=Inches(1.8))

    # Letterhead separator line
    p = doc.add_paragraph()
    _set_paragraph_spacing(p, 2, 6, 1.0)
    _add_bottom_border_to_paragraph(p, color="1F4E79", size="8")

    # ── DATE (left-aligned, per template) ──
    months_fr = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ]
    today = date.today()
    date_str = f"Le {today.day} {months_fr[today.month - 1]} {today.year}"
    p = doc.add_paragraph(date_str)
    _set_paragraph_spacing(p, 4, 10, 1.15)

    # ── RECIPIENT BLOCK (top-left) ──
    if mode == "postal":
        if gestionnaire:
            p = doc.add_paragraph(gestionnaire)
            _set_paragraph_spacing(p, 0, 0, 1.15)
        else:
            p = doc.add_paragraph("Au président du syndicat de copropriété")
            _set_paragraph_spacing(p, 0, 0, 1.15)
        if syndicat:
            p = doc.add_paragraph(syndicat)
            _set_paragraph_spacing(p, 0, 0, 1.15)
        adresse = prospect.get("Adresse", "")
        ville_cp = prospect.get("Ville_CodePostal", "")
        if isinstance(adresse, str) and adresse:
            p = doc.add_paragraph(adresse)
            _set_paragraph_spacing(p, 0, 0, 1.15)
        if isinstance(ville_cp, str) and ville_cp:
            p = doc.add_paragraph(ville_cp)
            _set_paragraph_spacing(p, 0, 0, 1.15)

    # ── SUBJECT ──
    p = doc.add_paragraph()
    _set_paragraph_spacing(p, 10, 6, 1.15)
    run = p.add_run("Objet : Services de protection incendie pour votre copropriété")
    run.bold = True
    run.font.size = Pt(11)

    # ── V/RÉF. — référence de l'immeuble ──
    ref_adresse = ""
    if isinstance(prospect.get("Adresse"), str) and prospect.get("Adresse", "").strip():
        ref_adresse = prospect["Adresse"].strip()
    elif isinstance(prospect.get("Ville_CodePostal"), str) and prospect.get("Ville_CodePostal", "").strip():
        ref_adresse = prospect["Ville_CodePostal"].strip()
    if ref_adresse:
        p = doc.add_paragraph()
        _set_paragraph_spacing(p, 0, 6, 1.15)
        run = p.add_run(f"V/Réf. : {ref_adresse}")
        run.font.size = Pt(10)

    # ── SALUTATION ──
    if gestionnaire:
        p = doc.add_paragraph(f"Bonjour {gestionnaire},")
    else:
        p = doc.add_paragraph("Bonjour,")
    _set_paragraph_spacing(p, 6, 6, 1.15)

    # ── BODY — lettre de prospection ──
    nb_unites = prospect.get("Nb_Unites", "")
    unites_str = f" vos {nb_unites} unités" if nb_unites else " vos unités"
    secteur = prospect.get("Secteur", "") or prospect.get("Ville_CodePostal", "") or ""
    secteur_str = f" de {secteur}" if secteur else " d'Anjou et ses environs"
    body = (
        f"À titre de spécialiste en protection incendie desservant le secteur{secteur_str}, "
        f"nous souhaitons vous offrir nos services d'inspection et de certification pour{unites_str} "
        f"de copropriété. Notre équipe qualifiée assure une conformité complète aux normes municipales "
        f"et provinciales en matière de sécurité incendie."
    )
    p = doc.add_paragraph(body)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    _set_paragraph_spacing(p, 0, 6, 1.15)

    # ── SERVICES ──
    p = doc.add_paragraph()
    _set_paragraph_spacing(p, 0, 3, 1.15)
    run = p.add_run("Nos services incluent :")
    run.bold = True

    services = [
        "✓ Inspection et certification de vos extincteurs",
        "✓ Tests fonctionnels de l'éclairage d'urgence (blocs autonomes)",
        "✓ Vérification des systèmes d'alarme incendie et détecteurs",
        "✓ Inspection des systèmes de gicleurs",
    ]
    for svc in services:
        p = doc.add_paragraph(svc)
        _set_paragraph_spacing(p, 0, 1, 1.15)
        p.paragraph_format.left_indent = Cm(0.5)

    # ── NOTES (optionnel) ──
    notes = prospect.get("Notes", "")
    if isinstance(notes, str) and notes.strip():
        p = doc.add_paragraph(f"Note : {notes.strip()}")
        _set_paragraph_spacing(p, 4, 6, 1.15)

    # ── CLOSING ──
    p = doc.add_paragraph(
        "Nous serions ravis de vous rencontrer pour évaluer vos besoins et vous proposer une soumission "
        "gratuite et sans engagement. N'hésitez pas à nous contacter au numéro ci-dessous."
    )
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    _set_paragraph_spacing(p, 4, 8, 1.15)

    p = doc.add_paragraph("Cordialement,")
    _set_paragraph_spacing(p, 0, 20, 1.15)

    # ── SOUS TOUTES RÉSERVES (underlined, per template) ──
    p = doc.add_paragraph("SOUS TOUTES RÉSERVES")
    _set_paragraph_spacing(p, 0, 16, 1.15)
    _add_underline(p)

    # ── SIGNATURE BLOCK ──
    rep_name = settings.get("rep_name", "")
    rep_title = settings.get("rep_title", "Gestionnaire de comptes clients")
    phone = settings.get("phone", "")

    p = doc.add_paragraph()
    _set_paragraph_spacing(p, 0, 0, 1.15)
    if rep_name:
        run = p.add_run(rep_name)
        run.bold = True
        run.font.size = Pt(11)
    if phone:
        run = p.add_run(f", Poste {phone}")
        run.font.size = Pt(11)

    if rep_title:
        p = doc.add_paragraph(rep_title)
        _set_paragraph_spacing(p, 0, 0, 1.15)

    # ── FOOTER with separator line ──
    p = doc.add_paragraph()
    _set_paragraph_spacing(p, 12, 0, 1.0)
    _add_horizontal_line(p)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_paragraph_spacing(p, 3, 0, 1.0)
    run = p.add_run(FOOTER_TEXT)
    run.font.size = Pt(8)
    run.font.color.rgb = GREY
    run.font.name = "Calibri Light"

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()
