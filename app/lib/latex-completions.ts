/**
 * Curated LaTeX completion items.
 *
 * Each item:
 *  - label:      displayed in dropdown (includes \)
 *  - filterText: Monaco filters by this (NO \, so "textbf" not "\textbf")
 *  - insertText: snippet inserted after the \ is already in doc
 *  - kind:       Monaco CompletionItemKind string name
 *  - detail:     right-side hint
 *  - documentation: shown in hover panel
 */

export interface LatexCompletion {
  label: string;
  filterText: string;
  insertText: string;
  kind: "Function" | "Keyword" | "Constant" | "Snippet" | "Value" | "Module";
  detail?: string;
  documentation?: string;
  sortText?: string;
}

// ── Environments (for \begin{...} completions) ─────────────────────────────
export const ENVIRONMENTS: { name: string; detail?: string; insertBody?: string }[] = [
  { name: "document",    detail: "Root document environment" },
  { name: "abstract",    detail: "Abstract section" },
  // Lists
  { name: "itemize",     detail: "Bullet list", insertBody: "  \\item $0" },
  { name: "enumerate",   detail: "Numbered list", insertBody: "  \\item $0" },
  { name: "description", detail: "Description list", insertBody: "  \\item[$1] $0" },
  // Math
  { name: "equation",    detail: "Numbered equation",     insertBody: "  $0" },
  { name: "equation*",   detail: "Unnumbered equation",   insertBody: "  $0" },
  { name: "align",       detail: "Aligned equations",     insertBody: "  $1 &= $2 \\\\" },
  { name: "align*",      detail: "Aligned (unnumbered)",  insertBody: "  $1 &= $2 \\\\" },
  { name: "gather",      detail: "Gathered equations",    insertBody: "  $0" },
  { name: "gather*",     detail: "Gathered (unnumbered)", insertBody: "  $0" },
  { name: "multline",    detail: "Multi-line equation",   insertBody: "  $0" },
  { name: "multline*",   detail: "Multi-line (unnumbered)", insertBody: "  $0" },
  { name: "split",       detail: "Split equation",        insertBody: "  $0" },
  { name: "cases",       detail: "Piecewise / cases",     insertBody: "  $1 & \\text{if } $2 \\\\\n  $3 & \\text{otherwise}" },
  // Matrices
  { name: "matrix",      detail: "Plain matrix" },
  { name: "pmatrix",     detail: "Matrix with ( )" },
  { name: "bmatrix",     detail: "Matrix with [ ]" },
  { name: "vmatrix",     detail: "Matrix with | |" },
  { name: "Bmatrix",     detail: "Matrix with { }" },
  { name: "Vmatrix",     detail: "Matrix with ‖ ‖" },
  { name: "smallmatrix", detail: "Inline small matrix" },
  // Figures & tables
  { name: "figure",      detail: "Floating figure",       insertBody: "  \\centering\n  \\includegraphics[width=\\linewidth]{$1}\n  \\caption{$2}\n  \\label{fig:$3}" },
  { name: "figure*",     detail: "Full-width figure" },
  { name: "table",       detail: "Floating table",        insertBody: "  \\centering\n  \\caption{$1}\n  \\label{tab:$2}\n  \\begin{tabular}{$3}\n    \\toprule\n    $0\n    \\bottomrule\n  \\end{tabular}" },
  { name: "table*",      detail: "Full-width table" },
  { name: "tabular",     detail: "Tabular data",          insertBody: "{$1}\n    \\toprule\n    $0\n    \\bottomrule" },
  { name: "tabularx",    detail: "Auto-width tabular",    insertBody: "{\\linewidth}{$1}\n    $0" },
  { name: "longtable",   detail: "Multi-page table",      insertBody: "{$1}\n    $0" },
  // Layout
  { name: "minipage",    detail: "Mini-page box",         insertBody: "{$1\\linewidth}\n  $0" },
  { name: "center",      detail: "Centered content" },
  { name: "flushleft",   detail: "Left-aligned content" },
  { name: "flushright",  detail: "Right-aligned content" },
  { name: "wrapfigure",  detail: "Text-wrapped figure",   insertBody: "{r}{$1\\linewidth}\n  \\centering\n  \\includegraphics[width=\\linewidth]{$2}\n  \\caption{$3}" },
  // Theorems
  { name: "theorem",     detail: "Theorem environment" },
  { name: "lemma",       detail: "Lemma environment" },
  { name: "corollary",   detail: "Corollary" },
  { name: "proposition", detail: "Proposition" },
  { name: "definition",  detail: "Definition" },
  { name: "remark",      detail: "Remark" },
  { name: "example",     detail: "Example" },
  { name: "proof",       detail: "Proof environment" },
  // Code
  { name: "verbatim",    detail: "Verbatim text (no formatting)" },
  { name: "lstlisting",  detail: "Code listing (listings package)", insertBody: "[language=$1]\n$0" },
  { name: "minted",      detail: "Syntax-highlighted code (minted)", insertBody: "{$1}\n$0" },
  // Beamer
  { name: "frame",       detail: "Beamer slide frame",    insertBody: "{$1}\n  $0" },
  { name: "block",       detail: "Beamer block",          insertBody: "{$1}\n  $0" },
  { name: "alertblock",  detail: "Beamer alert block",    insertBody: "{$1}\n  $0" },
  { name: "exampleblock", detail: "Beamer example block", insertBody: "{$1}\n  $0" },
  { name: "columns",     detail: "Beamer columns",        insertBody: "\n  \\begin{column}{0.5\\textwidth}\n    $0\n  \\end{column}" },
  { name: "column",      detail: "Beamer column",         insertBody: "{$1\\textwidth}\n  $0" },
  { name: "onlyenv",     detail: "Beamer only environment" },
  { name: "overlayarea", detail: "Beamer overlay area" },
  // tcolorbox
  { name: "tcolorbox",   detail: "Colored box (tcolorbox)" },
  // Misc
  { name: "quote",       detail: "Block quote" },
  { name: "quotation",   detail: "Indented quotation" },
  { name: "verse",       detail: "Poetry" },
  { name: "abstract",    detail: "Abstract block" },
  { name: "titlepage",   detail: "Title page" },
  { name: "scope",       detail: "TikZ scope" },
  { name: "tikzpicture", detail: "TikZ drawing",          insertBody: "\n  $0" },
  { name: "axis",        detail: "pgfplots axis",         insertBody: "\n  \\addplot{$1};\n  $0" },
];

// ── Document class names ───────────────────────────────────────────────────
export const DOCUMENT_CLASSES = [
  "article", "book", "report", "letter", "beamer", "memoir",
  "scrartcl", "scrbook", "scrreprt", "IEEEtran", "acmart", "llncs",
];

// ── Common package names ───────────────────────────────────────────────────
export const PACKAGES = [
  "amsmath", "amssymb", "amsthm", "amsfonts",
  "graphicx", "graphics",
  "hyperref", "url", "cleveref",
  "geometry",
  "fontenc", "inputenc", "fontspec", "unicode-math",
  "babel", "polyglossia",
  "xcolor", "color",
  "tikz", "pgfplots", "pgf",
  "listings", "minted", "fancyvrb",
  "biblatex", "natbib", "cite",
  "booktabs", "tabularx", "longtable", "array", "multirow", "makecell",
  "enumitem", "paralist",
  "caption", "subcaption", "float", "wrapfig",
  "microtype", "setspace", "parskip",
  "fancyhdr", "titlesec", "titletoc",
  "siunitx", "physics", "mathtools",
  "algorithm", "algorithmic", "algpseudocode", "algorithmicx",
  "mdframed", "tcolorbox", "framed",
  "todonotes", "changes",
  "appendix", "chngcntr",
  "lmodern", "palatino", "times", "mathpazo",
  "thmtools", "ntheorem",
  "varioref", "autoref",
  "doi", "xurl",
  "pdfpages", "epstopdf",
  "rotating", "pdflscape",
  "calc", "ifthen", "xifthen",
  "pgffor", "etoolbox",
  "acronym", "glossaries",
  "csquotes", "epigraph",
  "chemformula", "mhchem",
  "lineno", "showkeys",
  "multicol", "paracol",
  "nameref", "prettyref",
  "indentfirst", "noindent",
  "lastpage", "totcount",
  "beamerthemesplit", "beamerouterthememiniframes",
];

// ── Main curated command list ──────────────────────────────────────────────
export const LATEX_COMMANDS: LatexCompletion[] = [
  // ── Document structure ──────────────────────────────────────────────────
  {
    label: "\\documentclass", filterText: "documentclass",
    insertText: "documentclass[$1]{${2|article,book,report,beamer,memoir|}}", kind: "Keyword",
    detail: "Document class", documentation: "Declares the document class (e.g. article, book, report).",
  },
  {
    label: "\\usepackage", filterText: "usepackage",
    insertText: "usepackage{$1}", kind: "Module",
    detail: "Import package", documentation: "Loads a LaTeX package.",
  },
  {
    label: "\\usepackage[]", filterText: "usepackage",
    insertText: "usepackage[$1]{$2}", kind: "Module",
    detail: "Import package with options",
  },
  {
    label: "\\begin", filterText: "begin",
    insertText: "begin{${1:environment}}\n\t$0\n\\end{${1:environment}}", kind: "Snippet",
    detail: "Begin/end environment block",
    documentation: "Inserts a \\begin{...}...\\end{...} block. Tab to fill in the environment name.",
    sortText: "!begin",
  },
  {
    label: "\\end", filterText: "end",
    insertText: "end{$1}", kind: "Keyword",
    detail: "End environment",
  },
  {
    label: "\\maketitle", filterText: "maketitle",
    insertText: "maketitle", kind: "Function",
    detail: "Generate title",
  },
  {
    label: "\\tableofcontents", filterText: "tableofcontents",
    insertText: "tableofcontents", kind: "Function",
    detail: "Insert table of contents",
  },
  {
    label: "\\listoffigures", filterText: "listoffigures",
    insertText: "listoffigures", kind: "Function",
    detail: "Insert list of figures",
  },
  {
    label: "\\listoftables", filterText: "listoftables",
    insertText: "listoftables", kind: "Function",
    detail: "Insert list of tables",
  },
  {
    label: "\\title", filterText: "title",
    insertText: "title{$1}", kind: "Keyword",
    detail: "Set document title",
  },
  {
    label: "\\author", filterText: "author",
    insertText: "author{$1}", kind: "Keyword",
    detail: "Set author(s)",
  },
  {
    label: "\\date", filterText: "date",
    insertText: "date{$1}", kind: "Keyword",
    detail: "Set date",
  },
  {
    label: "\\input", filterText: "input",
    insertText: "input{$1}", kind: "Function",
    detail: "Input another file",
    documentation: "Includes the content of another .tex file directly.",
  },
  {
    label: "\\include", filterText: "include",
    insertText: "include{$1}", kind: "Function",
    detail: "Include file (starts new page)",
  },
  {
    label: "\\includeonly", filterText: "includeonly",
    insertText: "includeonly{$1}", kind: "Function",
    detail: "Restrict included files",
  },
  // ── Sections ─────────────────────────────────────────────────────────────
  {
    label: "\\part", filterText: "part",
    insertText: "part{$1}", kind: "Keyword",
    detail: "Part heading",
  },
  {
    label: "\\chapter", filterText: "chapter",
    insertText: "chapter{$1}", kind: "Keyword",
    detail: "Chapter heading",
  },
  {
    label: "\\section", filterText: "section",
    insertText: "section{$1}", kind: "Keyword",
    detail: "Section heading",
  },
  {
    label: "\\subsection", filterText: "subsection",
    insertText: "subsection{$1}", kind: "Keyword",
    detail: "Subsection heading",
  },
  {
    label: "\\subsubsection", filterText: "subsubsection",
    insertText: "subsubsection{$1}", kind: "Keyword",
    detail: "Subsubsection heading",
  },
  {
    label: "\\paragraph", filterText: "paragraph",
    insertText: "paragraph{$1}", kind: "Keyword",
    detail: "Paragraph heading",
  },
  {
    label: "\\subparagraph", filterText: "subparagraph",
    insertText: "subparagraph{$1}", kind: "Keyword",
    detail: "Subparagraph heading",
  },
  {
    label: "\\appendix", filterText: "appendix",
    insertText: "appendix", kind: "Keyword",
    detail: "Start appendix section",
  },
  // ── Text formatting ───────────────────────────────────────────────────────
  {
    label: "\\textbf", filterText: "textbf",
    insertText: "textbf{$1}", kind: "Function",
    detail: "Bold text",
    documentation: "Formats the argument in **bold** weight.",
  },
  {
    label: "\\textit", filterText: "textit",
    insertText: "textit{$1}", kind: "Function",
    detail: "Italic text",
  },
  {
    label: "\\emph", filterText: "emph",
    insertText: "emph{$1}", kind: "Function",
    detail: "Emphasized text (context-aware italic)",
    documentation: "Emphasizes text. In normal text this is italic; inside italic text it switches back to roman.",
  },
  {
    label: "\\underline", filterText: "underline",
    insertText: "underline{$1}", kind: "Function",
    detail: "Underlined text",
  },
  {
    label: "\\texttt", filterText: "texttt",
    insertText: "texttt{$1}", kind: "Function",
    detail: "Typewriter/monospace text",
  },
  {
    label: "\\textsc", filterText: "textsc",
    insertText: "textsc{$1}", kind: "Function",
    detail: "Small caps text",
  },
  {
    label: "\\textrm", filterText: "textrm",
    insertText: "textrm{$1}", kind: "Function",
    detail: "Roman (serif) text",
  },
  {
    label: "\\textsf", filterText: "textsf",
    insertText: "textsf{$1}", kind: "Function",
    detail: "Sans-serif text",
  },
  {
    label: "\\textcolor", filterText: "textcolor",
    insertText: "textcolor{$1}{$2}", kind: "Function",
    detail: "Colored text",
    documentation: "Requires `xcolor` package.",
  },
  {
    label: "\\colorbox", filterText: "colorbox",
    insertText: "colorbox{$1}{$2}", kind: "Function",
    detail: "Colored background box",
  },
  {
    label: "\\fcolorbox", filterText: "fcolorbox",
    insertText: "fcolorbox{$1}{$2}{$3}", kind: "Function",
    detail: "Framed colored box",
  },
  {
    label: "\\textsuperscript", filterText: "textsuperscript",
    insertText: "textsuperscript{$1}", kind: "Function",
    detail: "Superscript in text mode",
  },
  {
    label: "\\textsubscript", filterText: "textsubscript",
    insertText: "textsubscript{$1}", kind: "Function",
    detail: "Subscript in text mode",
  },
  // ── Font size ─────────────────────────────────────────────────────────────
  {
    label: "\\tiny",         filterText: "tiny",         insertText: "tiny",         kind: "Keyword", detail: "Font size: tiny" },
  { label: "\\scriptsize",   filterText: "scriptsize",   insertText: "scriptsize",   kind: "Keyword", detail: "Font size: script" },
  { label: "\\footnotesize", filterText: "footnotesize", insertText: "footnotesize", kind: "Keyword", detail: "Font size: footnote" },
  { label: "\\small",        filterText: "small",        insertText: "small",        kind: "Keyword", detail: "Font size: small" },
  { label: "\\normalsize",   filterText: "normalsize",   insertText: "normalsize",   kind: "Keyword", detail: "Font size: normal" },
  { label: "\\large",        filterText: "large",        insertText: "large",        kind: "Keyword", detail: "Font size: large" },
  { label: "\\Large",        filterText: "Large",        insertText: "Large",        kind: "Keyword", detail: "Font size: Large" },
  { label: "\\LARGE",        filterText: "LARGE",        insertText: "LARGE",        kind: "Keyword", detail: "Font size: LARGE" },
  { label: "\\huge",         filterText: "huge",         insertText: "huge",         kind: "Keyword", detail: "Font size: huge" },
  { label: "\\Huge",         filterText: "Huge",         insertText: "Huge",         kind: "Keyword", detail: "Font size: Huge" },
  // ── References ────────────────────────────────────────────────────────────
  {
    label: "\\label", filterText: "label",
    insertText: "label{$1}", kind: "Function",
    detail: "Set a label",
    documentation: "Marks a position in the document. Reference with \\ref{} or \\autoref{}.",
  },
  {
    label: "\\ref", filterText: "ref",
    insertText: "ref{$1}", kind: "Function",
    detail: "Cross-reference",
  },
  {
    label: "\\autoref", filterText: "autoref",
    insertText: "autoref{$1}", kind: "Function",
    detail: "Auto-labeled cross-reference (hyperref)",
  },
  {
    label: "\\pageref", filterText: "pageref",
    insertText: "pageref{$1}", kind: "Function",
    detail: "Page reference",
  },
  {
    label: "\\nameref", filterText: "nameref",
    insertText: "nameref{$1}", kind: "Function",
    detail: "Reference by name (hyperref)",
  },
  {
    label: "\\eqref", filterText: "eqref",
    insertText: "eqref{$1}", kind: "Function",
    detail: "Equation reference with (n) format",
  },
  // ── Citations ─────────────────────────────────────────────────────────────
  {
    label: "\\cite", filterText: "cite",
    insertText: "cite{$1}", kind: "Function",
    detail: "Cite a reference",
  },
  {
    label: "\\cite[]", filterText: "cite",
    insertText: "cite[$1]{$2}", kind: "Function",
    detail: "Cite with note (e.g. page number)",
  },
  {
    label: "\\citep", filterText: "citep",
    insertText: "citep{$1}", kind: "Function",
    detail: "Parenthetical citation (natbib)",
  },
  {
    label: "\\citet", filterText: "citet",
    insertText: "citet{$1}", kind: "Function",
    detail: "Textual citation (natbib)",
  },
  {
    label: "\\citeauthor", filterText: "citeauthor",
    insertText: "citeauthor{$1}", kind: "Function",
    detail: "Author name only",
  },
  {
    label: "\\citeyear", filterText: "citeyear",
    insertText: "citeyear{$1}", kind: "Function",
    detail: "Year only",
  },
  {
    label: "\\bibliography", filterText: "bibliography",
    insertText: "bibliography{$1}", kind: "Function",
    detail: "Bibliography file",
  },
  {
    label: "\\bibliographystyle", filterText: "bibliographystyle",
    insertText: "bibliographystyle{${1|plain,alpha,abbrv,unsrt,apalike,ieeetr|}}", kind: "Function",
    detail: "Bibliography style",
  },
  // ── Math ─────────────────────────────────────────────────────────────────
  {
    label: "\\frac", filterText: "frac",
    insertText: "frac{$1}{$2}", kind: "Function",
    detail: "Fraction",
    documentation: "Typsets a fraction. First arg = numerator, second = denominator.",
  },
  {
    label: "\\dfrac", filterText: "dfrac",
    insertText: "dfrac{$1}{$2}", kind: "Function",
    detail: "Display-style fraction",
  },
  {
    label: "\\tfrac", filterText: "tfrac",
    insertText: "tfrac{$1}{$2}", kind: "Function",
    detail: "Text-style fraction",
  },
  {
    label: "\\sqrt", filterText: "sqrt",
    insertText: "sqrt{$1}", kind: "Function",
    detail: "Square root",
  },
  {
    label: "\\sqrt[]", filterText: "sqrt",
    insertText: "sqrt[$1]{$2}", kind: "Function",
    detail: "Nth root",
  },
  {
    label: "\\sum", filterText: "sum",
    insertText: "sum_{$1}^{$2}", kind: "Value",
    detail: "Summation",
  },
  {
    label: "\\prod", filterText: "prod",
    insertText: "prod_{$1}^{$2}", kind: "Value",
    detail: "Product",
  },
  {
    label: "\\int", filterText: "int",
    insertText: "int_{$1}^{$2}", kind: "Value",
    detail: "Integral",
  },
  {
    label: "\\oint", filterText: "oint",
    insertText: "oint_{$1}^{$2}", kind: "Value",
    detail: "Contour integral",
  },
  {
    label: "\\iint", filterText: "iint",
    insertText: "iint_{$1}^{$2}", kind: "Value",
    detail: "Double integral",
  },
  {
    label: "\\iiint", filterText: "iiint",
    insertText: "iiint_{$1}^{$2}", kind: "Value",
    detail: "Triple integral",
  },
  {
    label: "\\lim", filterText: "lim",
    insertText: "lim_{$1 \\to $2}", kind: "Value",
    detail: "Limit",
  },
  {
    label: "\\binom", filterText: "binom",
    insertText: "binom{$1}{$2}", kind: "Function",
    detail: "Binomial coefficient",
  },
  // Math accents
  { label: "\\hat",      filterText: "hat",      insertText: "hat{$1}",      kind: "Function", detail: "Hat accent" },
  { label: "\\bar",      filterText: "bar",      insertText: "bar{$1}",      kind: "Function", detail: "Bar accent" },
  { label: "\\tilde",    filterText: "tilde",    insertText: "tilde{$1}",    kind: "Function", detail: "Tilde accent" },
  { label: "\\vec",      filterText: "vec",      insertText: "vec{$1}",      kind: "Function", detail: "Vector arrow" },
  { label: "\\dot",      filterText: "dot",      insertText: "dot{$1}",      kind: "Function", detail: "Dot accent" },
  { label: "\\ddot",     filterText: "ddot",     insertText: "ddot{$1}",     kind: "Function", detail: "Double dot accent" },
  { label: "\\overline", filterText: "overline", insertText: "overline{$1}", kind: "Function", detail: "Overline" },
  { label: "\\underline",filterText: "underline",insertText: "underline{$1}",kind: "Function", detail: "Underline" },
  { label: "\\overbrace",filterText: "overbrace",insertText: "overbrace{$1}^{$2}", kind: "Function", detail: "Overbrace" },
  { label: "\\underbrace",filterText: "underbrace",insertText: "underbrace{$1}_{$2}", kind: "Function", detail: "Underbrace" },
  { label: "\\widehat",  filterText: "widehat",  insertText: "widehat{$1}",  kind: "Function", detail: "Wide hat" },
  { label: "\\widetilde",filterText: "widetilde",insertText: "widetilde{$1}",kind: "Function", detail: "Wide tilde" },
  // Math fonts
  { label: "\\mathbf",   filterText: "mathbf",   insertText: "mathbf{$1}",   kind: "Function", detail: "Bold (math mode)" },
  { label: "\\mathrm",   filterText: "mathrm",   insertText: "mathrm{$1}",   kind: "Function", detail: "Roman (math mode)" },
  { label: "\\mathit",   filterText: "mathit",   insertText: "mathit{$1}",   kind: "Function", detail: "Italic (math mode)" },
  { label: "\\mathcal",  filterText: "mathcal",  insertText: "mathcal{$1}",  kind: "Function", detail: "Calligraphic (math mode)" },
  { label: "\\mathbb",   filterText: "mathbb",   insertText: "mathbb{$1}",   kind: "Function", detail: "Blackboard bold (amssymb)" },
  { label: "\\mathfrak", filterText: "mathfrak", insertText: "mathfrak{$1}", kind: "Function", detail: "Fraktur (amssymb)" },
  { label: "\\mathsf",   filterText: "mathsf",   insertText: "mathsf{$1}",   kind: "Function", detail: "Sans-serif (math mode)" },
  { label: "\\mathtt",   filterText: "mathtt",   insertText: "mathtt{$1}",   kind: "Function", detail: "Typewriter (math mode)" },
  { label: "\\text",     filterText: "text",     insertText: "text{$1}",     kind: "Function", detail: "Text inside math mode (amsmath)" },
  { label: "\\mbox",     filterText: "mbox",     insertText: "mbox{$1}",     kind: "Function", detail: "Text box (non-breaking)" },
  // Delimiters
  {
    label: "\\left(\\right)", filterText: "left",
    insertText: "left($1\\right)", kind: "Snippet",
    detail: "Auto-sized parentheses",
  },
  {
    label: "\\left[\\right]", filterText: "left",
    insertText: "left[$1\\right]", kind: "Snippet",
    detail: "Auto-sized brackets",
  },
  {
    label: "\\left\\{\\right\\}", filterText: "left",
    insertText: "left\\{$1\\right\\}", kind: "Snippet",
    detail: "Auto-sized braces",
  },
  // ── Greek lowercase ───────────────────────────────────────────────────────
  { label: "\\alpha",      filterText: "alpha",      insertText: "alpha",      kind: "Constant", detail: "α" },
  { label: "\\beta",       filterText: "beta",       insertText: "beta",       kind: "Constant", detail: "β" },
  { label: "\\gamma",      filterText: "gamma",      insertText: "gamma",      kind: "Constant", detail: "γ" },
  { label: "\\delta",      filterText: "delta",      insertText: "delta",      kind: "Constant", detail: "δ" },
  { label: "\\epsilon",    filterText: "epsilon",    insertText: "epsilon",    kind: "Constant", detail: "ε" },
  { label: "\\varepsilon", filterText: "varepsilon", insertText: "varepsilon", kind: "Constant", detail: "ε (variant)" },
  { label: "\\zeta",       filterText: "zeta",       insertText: "zeta",       kind: "Constant", detail: "ζ" },
  { label: "\\eta",        filterText: "eta",        insertText: "eta",        kind: "Constant", detail: "η" },
  { label: "\\theta",      filterText: "theta",      insertText: "theta",      kind: "Constant", detail: "θ" },
  { label: "\\vartheta",   filterText: "vartheta",   insertText: "vartheta",   kind: "Constant", detail: "ϑ (variant)" },
  { label: "\\iota",       filterText: "iota",       insertText: "iota",       kind: "Constant", detail: "ι" },
  { label: "\\kappa",      filterText: "kappa",      insertText: "kappa",      kind: "Constant", detail: "κ" },
  { label: "\\lambda",     filterText: "lambda",     insertText: "lambda",     kind: "Constant", detail: "λ" },
  { label: "\\mu",         filterText: "mu",         insertText: "mu",         kind: "Constant", detail: "μ" },
  { label: "\\nu",         filterText: "nu",         insertText: "nu",         kind: "Constant", detail: "ν" },
  { label: "\\xi",         filterText: "xi",         insertText: "xi",         kind: "Constant", detail: "ξ" },
  { label: "\\pi",         filterText: "pi",         insertText: "pi",         kind: "Constant", detail: "π" },
  { label: "\\varpi",      filterText: "varpi",      insertText: "varpi",      kind: "Constant", detail: "ϖ (variant)" },
  { label: "\\rho",        filterText: "rho",        insertText: "rho",        kind: "Constant", detail: "ρ" },
  { label: "\\varrho",     filterText: "varrho",     insertText: "varrho",     kind: "Constant", detail: "ϱ (variant)" },
  { label: "\\sigma",      filterText: "sigma",      insertText: "sigma",      kind: "Constant", detail: "σ" },
  { label: "\\varsigma",   filterText: "varsigma",   insertText: "varsigma",   kind: "Constant", detail: "ς (variant)" },
  { label: "\\tau",        filterText: "tau",        insertText: "tau",        kind: "Constant", detail: "τ" },
  { label: "\\upsilon",    filterText: "upsilon",    insertText: "upsilon",    kind: "Constant", detail: "υ" },
  { label: "\\phi",        filterText: "phi",        insertText: "phi",        kind: "Constant", detail: "φ" },
  { label: "\\varphi",     filterText: "varphi",     insertText: "varphi",     kind: "Constant", detail: "φ (variant)" },
  { label: "\\chi",        filterText: "chi",        insertText: "chi",        kind: "Constant", detail: "χ" },
  { label: "\\psi",        filterText: "psi",        insertText: "psi",        kind: "Constant", detail: "ψ" },
  { label: "\\omega",      filterText: "omega",      insertText: "omega",      kind: "Constant", detail: "ω" },
  // ── Greek uppercase ───────────────────────────────────────────────────────
  { label: "\\Gamma",   filterText: "Gamma",   insertText: "Gamma",   kind: "Constant", detail: "Γ" },
  { label: "\\Delta",   filterText: "Delta",   insertText: "Delta",   kind: "Constant", detail: "Δ" },
  { label: "\\Theta",   filterText: "Theta",   insertText: "Theta",   kind: "Constant", detail: "Θ" },
  { label: "\\Lambda",  filterText: "Lambda",  insertText: "Lambda",  kind: "Constant", detail: "Λ" },
  { label: "\\Xi",      filterText: "Xi",      insertText: "Xi",      kind: "Constant", detail: "Ξ" },
  { label: "\\Pi",      filterText: "Pi",      insertText: "Pi",      kind: "Constant", detail: "Π" },
  { label: "\\Sigma",   filterText: "Sigma",   insertText: "Sigma",   kind: "Constant", detail: "Σ" },
  { label: "\\Upsilon", filterText: "Upsilon", insertText: "Upsilon", kind: "Constant", detail: "Υ" },
  { label: "\\Phi",     filterText: "Phi",     insertText: "Phi",     kind: "Constant", detail: "Φ" },
  { label: "\\Psi",     filterText: "Psi",     insertText: "Psi",     kind: "Constant", detail: "Ψ" },
  { label: "\\Omega",   filterText: "Omega",   insertText: "Omega",   kind: "Constant", detail: "Ω" },
  // ── Operators & relations ─────────────────────────────────────────────────
  { label: "\\cdot",         filterText: "cdot",         insertText: "cdot",         kind: "Constant", detail: "⋅ center dot" },
  { label: "\\times",        filterText: "times",        insertText: "times",        kind: "Constant", detail: "× multiplication" },
  { label: "\\div",          filterText: "div",          insertText: "div",          kind: "Constant", detail: "÷ division" },
  { label: "\\pm",           filterText: "pm",           insertText: "pm",           kind: "Constant", detail: "± plus-minus" },
  { label: "\\mp",           filterText: "mp",           insertText: "mp",           kind: "Constant", detail: "∓ minus-plus" },
  { label: "\\leq",          filterText: "leq",          insertText: "leq",          kind: "Constant", detail: "≤ less-or-equal" },
  { label: "\\geq",          filterText: "geq",          insertText: "geq",          kind: "Constant", detail: "≥ greater-or-equal" },
  { label: "\\neq",          filterText: "neq",          insertText: "neq",          kind: "Constant", detail: "≠ not equal" },
  { label: "\\approx",       filterText: "approx",       insertText: "approx",       kind: "Constant", detail: "≈ approximately equal" },
  { label: "\\equiv",        filterText: "equiv",        insertText: "equiv",        kind: "Constant", detail: "≡ equivalent" },
  { label: "\\sim",          filterText: "sim",          insertText: "sim",          kind: "Constant", detail: "∼ similar" },
  { label: "\\simeq",        filterText: "simeq",        insertText: "simeq",        kind: "Constant", detail: "≃ similar-equal" },
  { label: "\\cong",         filterText: "cong",         insertText: "cong",         kind: "Constant", detail: "≅ congruent" },
  { label: "\\propto",       filterText: "propto",       insertText: "propto",       kind: "Constant", detail: "∝ proportional" },
  { label: "\\ll",           filterText: "ll",           insertText: "ll",           kind: "Constant", detail: "≪ much less than" },
  { label: "\\gg",           filterText: "gg",           insertText: "gg",           kind: "Constant", detail: "≫ much greater than" },
  // ── Set theory & logic ────────────────────────────────────────────────────
  { label: "\\in",           filterText: "in",           insertText: "in",           kind: "Constant", detail: "∈ element of" },
  { label: "\\notin",        filterText: "notin",        insertText: "notin",        kind: "Constant", detail: "∉ not element of" },
  { label: "\\subset",       filterText: "subset",       insertText: "subset",       kind: "Constant", detail: "⊂ subset" },
  { label: "\\subseteq",     filterText: "subseteq",     insertText: "subseteq",     kind: "Constant", detail: "⊆ subset-or-equal" },
  { label: "\\supset",       filterText: "supset",       insertText: "supset",       kind: "Constant", detail: "⊃ superset" },
  { label: "\\supseteq",     filterText: "supseteq",     insertText: "supseteq",     kind: "Constant", detail: "⊇ superset-or-equal" },
  { label: "\\cup",          filterText: "cup",          insertText: "cup",          kind: "Constant", detail: "∪ union" },
  { label: "\\cap",          filterText: "cap",          insertText: "cap",          kind: "Constant", detail: "∩ intersection" },
  { label: "\\setminus",     filterText: "setminus",     insertText: "setminus",     kind: "Constant", detail: "∖ set minus" },
  { label: "\\emptyset",     filterText: "emptyset",     insertText: "emptyset",     kind: "Constant", detail: "∅ empty set" },
  { label: "\\forall",       filterText: "forall",       insertText: "forall",       kind: "Constant", detail: "∀ for all" },
  { label: "\\exists",       filterText: "exists",       insertText: "exists",       kind: "Constant", detail: "∃ exists" },
  { label: "\\nexists",      filterText: "nexists",      insertText: "nexists",      kind: "Constant", detail: "∄ not exists" },
  { label: "\\neg",          filterText: "neg",          insertText: "neg",          kind: "Constant", detail: "¬ logical not" },
  { label: "\\land",         filterText: "land",         insertText: "land",         kind: "Constant", detail: "∧ logical and" },
  { label: "\\lor",          filterText: "lor",          insertText: "lor",          kind: "Constant", detail: "∨ logical or" },
  { label: "\\Rightarrow",   filterText: "Rightarrow",   insertText: "Rightarrow",   kind: "Constant", detail: "⇒ implies" },
  { label: "\\Leftarrow",    filterText: "Leftarrow",    insertText: "Leftarrow",    kind: "Constant", detail: "⇐ implied by" },
  { label: "\\Leftrightarrow",filterText:"Leftrightarrow",insertText:"Leftrightarrow",kind:"Constant", detail: "⇔ iff" },
  { label: "\\rightarrow",   filterText: "rightarrow",   insertText: "rightarrow",   kind: "Constant", detail: "→ right arrow" },
  { label: "\\leftarrow",    filterText: "leftarrow",    insertText: "leftarrow",    kind: "Constant", detail: "← left arrow" },
  { label: "\\leftrightarrow",filterText:"leftrightarrow",insertText:"leftrightarrow",kind:"Constant", detail: "↔ left-right arrow" },
  { label: "\\to",           filterText: "to",           insertText: "to",           kind: "Constant", detail: "→ to (arrow)" },
  { label: "\\gets",         filterText: "gets",         insertText: "gets",         kind: "Constant", detail: "← gets (arrow)" },
  // ── Misc math ─────────────────────────────────────────────────────────────
  { label: "\\infty",   filterText: "infty",   insertText: "infty",   kind: "Constant", detail: "∞ infinity" },
  { label: "\\partial", filterText: "partial", insertText: "partial", kind: "Constant", detail: "∂ partial derivative" },
  { label: "\\nabla",   filterText: "nabla",   insertText: "nabla",   kind: "Constant", detail: "∇ nabla / gradient" },
  { label: "\\hbar",    filterText: "hbar",    insertText: "hbar",    kind: "Constant", detail: "ℏ reduced Planck constant" },
  { label: "\\ell",     filterText: "ell",     insertText: "ell",     kind: "Constant", detail: "ℓ script l" },
  { label: "\\Re",      filterText: "Re",      insertText: "Re",      kind: "Constant", detail: "ℜ real part" },
  { label: "\\Im",      filterText: "Im",      insertText: "Im",      kind: "Constant", detail: "ℑ imaginary part" },
  { label: "\\ldots",   filterText: "ldots",   insertText: "ldots",   kind: "Constant", detail: "… lower dots" },
  { label: "\\cdots",   filterText: "cdots",   insertText: "cdots",   kind: "Constant", detail: "⋯ center dots" },
  { label: "\\vdots",   filterText: "vdots",   insertText: "vdots",   kind: "Constant", detail: "⋮ vertical dots" },
  { label: "\\ddots",   filterText: "ddots",   insertText: "ddots",   kind: "Constant", detail: "⋱ diagonal dots" },
  { label: "\\prime",   filterText: "prime",   insertText: "prime",   kind: "Constant", detail: "′ prime" },
  { label: "\\circ",    filterText: "circ",    insertText: "circ",    kind: "Constant", detail: "∘ composition / degree" },
  { label: "\\bullet",  filterText: "bullet",  insertText: "bullet",  kind: "Constant", detail: "∙ bullet" },
  { label: "\\star",    filterText: "star",    insertText: "star",    kind: "Constant", detail: "⋆ star" },
  { label: "\\oplus",   filterText: "oplus",   insertText: "oplus",   kind: "Constant", detail: "⊕ direct sum / XOR" },
  { label: "\\otimes",  filterText: "otimes",  insertText: "otimes",  kind: "Constant", detail: "⊗ tensor product" },
  { label: "\\perp",    filterText: "perp",    insertText: "perp",    kind: "Constant", detail: "⊥ perpendicular" },
  { label: "\\mid",     filterText: "mid",     insertText: "mid",     kind: "Constant", detail: "∣ divides" },
  { label: "\\nmid",    filterText: "nmid",    insertText: "nmid",    kind: "Constant", detail: "∤ does not divide" },
  // ── Spacing & layout ──────────────────────────────────────────────────────
  {
    label: "\\vspace", filterText: "vspace",
    insertText: "vspace{$1}", kind: "Function",
    detail: "Vertical space",
  },
  {
    label: "\\hspace", filterText: "hspace",
    insertText: "hspace{$1}", kind: "Function",
    detail: "Horizontal space",
  },
  { label: "\\vspace*", filterText: "vspace*", insertText: "vspace*{$1}", kind: "Function", detail: "Vertical space (forced)" },
  { label: "\\hspace*", filterText: "hspace*", insertText: "hspace*{$1}", kind: "Function", detail: "Horizontal space (forced)" },
  { label: "\\vfill",  filterText: "vfill",  insertText: "vfill",  kind: "Keyword", detail: "Fill vertical space" },
  { label: "\\hfill",  filterText: "hfill",  insertText: "hfill",  kind: "Keyword", detail: "Fill horizontal space" },
  { label: "\\newpage",  filterText: "newpage",  insertText: "newpage",  kind: "Keyword", detail: "Start new page" },
  { label: "\\clearpage",filterText: "clearpage",insertText: "clearpage",kind: "Keyword", detail: "Clear page (flush floats)" },
  { label: "\\noindent", filterText: "noindent", insertText: "noindent", kind: "Keyword", detail: "Suppress paragraph indent" },
  { label: "\\centering",filterText: "centering",insertText: "centering",kind: "Keyword", detail: "Center content" },
  { label: "\\raggedright",filterText:"raggedright",insertText:"raggedright",kind:"Keyword",detail:"Left-align (ragged right)" },
  { label: "\\raggedleft", filterText:"raggedleft", insertText:"raggedleft", kind:"Keyword",detail:"Right-align (ragged left)" },
  { label: "\\linebreak",  filterText:"linebreak",  insertText:"linebreak",  kind:"Keyword",detail:"Force line break" },
  { label: "\\pagebreak",  filterText:"pagebreak",  insertText:"pagebreak",  kind:"Keyword",detail:"Force page break" },
  // ── Footnotes & margin notes ──────────────────────────────────────────────
  {
    label: "\\footnote", filterText: "footnote",
    insertText: "footnote{$1}", kind: "Function",
    detail: "Footnote",
  },
  {
    label: "\\footnotemark", filterText: "footnotemark",
    insertText: "footnotemark", kind: "Function",
    detail: "Footnote mark (without text)",
  },
  {
    label: "\\footnotetext", filterText: "footnotetext",
    insertText: "footnotetext{$1}", kind: "Function",
    detail: "Footnote text (matching footnotemark)",
  },
  {
    label: "\\marginpar", filterText: "marginpar",
    insertText: "marginpar{$1}", kind: "Function",
    detail: "Margin note",
  },
  // ── Figures & graphics ────────────────────────────────────────────────────
  {
    label: "\\includegraphics", filterText: "includegraphics",
    insertText: "includegraphics[$1]{$2}", kind: "Function",
    detail: "Include image (graphicx)",
    documentation: "Requires `graphicx` package. Options: width=, height=, scale=, angle=.",
  },
  {
    label: "\\caption", filterText: "caption",
    insertText: "caption{$1}", kind: "Function",
    detail: "Figure/table caption",
  },
  {
    label: "\\captionof", filterText: "captionof",
    insertText: "captionof{$1}{$2}", kind: "Function",
    detail: "Caption for non-floating content",
  },
  // ── Tables ────────────────────────────────────────────────────────────────
  { label: "\\hline",      filterText: "hline",      insertText: "hline",             kind: "Keyword", detail: "Horizontal table line" },
  { label: "\\toprule",    filterText: "toprule",    insertText: "toprule",           kind: "Keyword", detail: "Top rule (booktabs)" },
  { label: "\\midrule",    filterText: "midrule",    insertText: "midrule",           kind: "Keyword", detail: "Mid rule (booktabs)" },
  { label: "\\bottomrule", filterText: "bottomrule", insertText: "bottomrule",        kind: "Keyword", detail: "Bottom rule (booktabs)" },
  { label: "\\cline",      filterText: "cline",      insertText: "cline{$1-$2}",      kind: "Function", detail: "Partial horizontal line" },
  {
    label: "\\multicolumn", filterText: "multicolumn",
    insertText: "multicolumn{$1}{$2}{$3}", kind: "Function",
    detail: "Span multiple columns",
    documentation: "Args: number of columns, alignment (l/c/r), content.",
  },
  {
    label: "\\multirow", filterText: "multirow",
    insertText: "multirow{$1}{*}{$2}", kind: "Function",
    detail: "Span multiple rows (multirow package)",
  },
  // ── Hyperlinks ────────────────────────────────────────────────────────────
  {
    label: "\\href", filterText: "href",
    insertText: "href{$1}{$2}", kind: "Function",
    detail: "Hyperlink (hyperref)",
    documentation: "Args: URL, display text. Requires `hyperref` package.",
  },
  {
    label: "\\url", filterText: "url",
    insertText: "url{$1}", kind: "Function",
    detail: "Typeset URL",
  },
  {
    label: "\\hyperref", filterText: "hyperref",
    insertText: "hyperref[$1]{$2}", kind: "Function",
    detail: "Internal hyperlink (hyperref)",
  },
  // ── Items ─────────────────────────────────────────────────────────────────
  {
    label: "\\item", filterText: "item",
    insertText: "item $0", kind: "Keyword",
    detail: "List item",
  },
  {
    label: "\\item[]", filterText: "item",
    insertText: "item[$1] $0", kind: "Keyword",
    detail: "List item with custom label",
  },
  // ── Custom command definitions ─────────────────────────────────────────────
  {
    label: "\\newcommand", filterText: "newcommand",
    insertText: "newcommand{\\$1}[$2]{$3}", kind: "Snippet",
    detail: "Define new command",
    documentation: "Args: command name (with \\), optional arg count, body.",
  },
  {
    label: "\\renewcommand", filterText: "renewcommand",
    insertText: "renewcommand{\\$1}[$2]{$3}", kind: "Snippet",
    detail: "Redefine existing command",
  },
  {
    label: "\\newenvironment", filterText: "newenvironment",
    insertText: "newenvironment{$1}[$2]{$3}{$4}", kind: "Snippet",
    detail: "Define new environment",
    documentation: "Args: name, arg count, begin-code, end-code.",
  },
  {
    label: "\\DeclareMathOperator", filterText: "DeclareMathOperator",
    insertText: "DeclareMathOperator{\\$1}{$2}", kind: "Snippet",
    detail: "Define math operator (amsmath)",
  },
  // ── Lengths ───────────────────────────────────────────────────────────────
  {
    label: "\\setlength", filterText: "setlength",
    insertText: "setlength{$1}{$2}", kind: "Function",
    detail: "Set a length",
  },
  {
    label: "\\addtolength", filterText: "addtolength",
    insertText: "addtolength{$1}{$2}", kind: "Function",
    detail: "Increment a length",
  },
  // Length constants (no args)
  { label: "\\textwidth",   filterText: "textwidth",   insertText: "textwidth",   kind: "Constant", detail: "Text area width" },
  { label: "\\linewidth",   filterText: "linewidth",   insertText: "linewidth",   kind: "Constant", detail: "Current line width" },
  { label: "\\columnwidth", filterText: "columnwidth", insertText: "columnwidth", kind: "Constant", detail: "Column width" },
  { label: "\\textheight",  filterText: "textheight",  insertText: "textheight",  kind: "Constant", detail: "Text area height" },
  { label: "\\paperwidth",  filterText: "paperwidth",  insertText: "paperwidth",  kind: "Constant", detail: "Paper width" },
  { label: "\\paperheight", filterText: "paperheight", insertText: "paperheight", kind: "Constant", detail: "Paper height" },
  { label: "\\parindent",   filterText: "parindent",   insertText: "parindent",   kind: "Constant", detail: "Paragraph indent length" },
  { label: "\\parskip",     filterText: "parskip",     insertText: "parskip",     kind: "Constant", detail: "Paragraph skip length" },
  // ── biblatex / natbib ─────────────────────────────────────────────────────
  {
    label: "\\printbibliography", filterText: "printbibliography",
    insertText: "printbibliography", kind: "Function",
    detail: "Print bibliography (biblatex)",
  },
  {
    label: "\\addbibresource", filterText: "addbibresource",
    insertText: "addbibresource{$1.bib}", kind: "Function",
    detail: "Add bibliography resource (biblatex)",
  },
  // ── Theorem-like ──────────────────────────────────────────────────────────
  {
    label: "\\newtheorem", filterText: "newtheorem",
    insertText: "newtheorem{$1}{$2}", kind: "Snippet",
    detail: "Define theorem-like environment",
  },
  // ── SI units ──────────────────────────────────────────────────────────────
  {
    label: "\\SI", filterText: "SI",
    insertText: "SI{$1}{$2}", kind: "Function",
    detail: "Value with unit (siunitx)",
  },
  {
    label: "\\si", filterText: "si",
    insertText: "si{$1}", kind: "Function",
    detail: "Unit only (siunitx)",
  },
  // ── Todo ──────────────────────────────────────────────────────────────────
  {
    label: "\\todo", filterText: "todo",
    insertText: "todo{$1}", kind: "Function",
    detail: "Todo note (todonotes package)",
  },
  {
    label: "\\missingfigure", filterText: "missingfigure",
    insertText: "missingfigure{$1}", kind: "Function",
    detail: "Placeholder figure (todonotes)",
  },
];
