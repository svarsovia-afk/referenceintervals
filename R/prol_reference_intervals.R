rm(list = ls())
# =============================================================================
# Prolactine (PROL) referentie-intervallen — volledige analyse voor ÉÉN lab
#
# Het script maakt geen onderscheid meer tussen MLS en Advent: pas alleen het
# blok "0. INSTELLINGEN" aan en draai het script per laboratorium apart.
# Alle uitvoer komt in output/<lab_name>/, zodat runs elkaar niet overschrijven.
#
#  1. Data laden en opschonen (getallen, datums, patient-ID)
#  2. Type_Arts koppelen en indelen in eerste-/tweedelijnszorg
#  3. Populatiebeschrijving (Excel-tabel, klaar voor publicatie)
#  4. Gezonde referentiepopulatie — voor ELKE populatie in `populaties`
#     (standaard: eerstelijnszorg én alle aanvragers zonder filter op aanvrager):
#       a. TSH/FSH/LH toetsen aan referentie-intervallen
#       b. ALLE rijen van een patient binnen 1 jaar rond een afwijkende waarde eruit
#          (gebeurt VOOR het filteren op PROL en VOOR "max 1 test per jaar")
#       c. PROL aanwezig
#       d. max 1 test per patient per jaar
#  5. Indeling Men / premenopausal / postmenopausal
#  6. Validatie nieuwe RI's (observed p95 vs 95%-BI van het nieuwe RI) + figuur
#     per populatie, plus één vergelijkingsfiguur van de populaties
#  7. Flagging rate oude vs nieuwe RI's in de ORIGINELE dataset (alle PROL-waarden)
#
# install.packages(c("tidyverse", "openxlsx"))   # dplyr >= 1.1.0 vereist
# =============================================================================

library(dplyr)
library(tidyr)
library(ggplot2)

stopifnot(packageVersion("dplyr") >= "1.1.0")

# =============================================================================
# 0. INSTELLINGEN — ALLEEN DIT BLOK AANPASSEN PER LAB
# =============================================================================

lab_name    <- "Advent"            # "MLS" of "Advent" (alleen voor labels/mapnaam)
input_file  <- "Datasets/PROL_advent.csv"   # Advent: "Datasets/PROL_TSH_W_M_Advent.csv"
input_sep   <- ","
id_col      <- "Accessionnummer"   # Advent: "Pt_ID"
date_format <- "%m/%d/%Y"       # controleer per lab!

# Bestand met Aanvrager -> Type_Arts. Wordt alleen gebruikt als de data nog
# geen kolom "Zorglijn" heeft. Zet op NULL als die kolom er al in staat.
typearts_file <- "TypeArts_Advent.csv"

output_dir <- file.path("output", lab_name)

# ---- referentiepopulaties die geanalyseerd worden ----
# naam = label in grafieken en bestandsnamen; waarde = welke Zorglijn(en)
# meedoen. NULL = geen filter op aanvrager (alle rijen, ook zonder Zorglijn).
populaties <- list(
  "Eerstelijnszorg" = "Eerstelijnszorg",
  "Alle aanvragers" = NULL
)

# ---- analyse-instellingen (gelijk voor beide labs) ----
screening_analytes     <- c("TSH", "FSH", "LH")
value_col              <- "PROL"
exclusion_window_days  <- 365   # rijen binnen +/- 365 d rond een afwijking eruit (Inf = hele patient)
min_days_between       <- 365   # max 1 test per patient per jaar
exclude_unclassifiable <- TRUE  # waarde aanwezig maar geen passend ref-interval -> sample eruit

status_levels <- c("Men", "premenopausal", "postmenopausal")

eerstelijns_artsen <- c(
  "BGD-arts", "Huisarts", "Klinisch Chemicus", "Marinearts", "Vliegarts",
  "Patient is aanvrager"
)

tweedelijns_artsen <- c(
  "Anesthesioloog", "Anesthesioloog / pijnspecialist",
  "Arts-assistent (ANIOS), chirurgie/urologie/orthopedie",
  "Cardioloog", "Chirurg", "Dermatoloog", "Gastro-enteroloog", "Gynaecoloog",
  "Internist", "Internist / endocrinoloog", "Internist / infectioloog",
  "Internist / intensivist", "Internist / nefroloog", "Internist / oncoloog",
  "Kinder-cardioloog", "Kinder-longarts", "Kinderarts", "KNO-arts", "Longarts",
  "Neuroloog", "Oogarts", "Orthopedisch Chirurg", "Orthopeed",
  "Plastisch Chirurg", "Psychiater", "Uroloog", "Ziekenhuis", "Advent", "Verloskundige"
)

# RI_old = limiet die nu in de routine gebruikt wordt; RI_new = nieuw RI (ng/mL)
ri_table <- tibble::tribble(
  ~Status,           ~RI_old, ~RI_new,
  "Men",              25,    25.9,
  "premenopausal",    18.3,    40.6,
  "postmenopausal",   12.55,    27.8
) |>
  mutate(Status = factor(Status, levels = status_levels))

# 95%-BI van de nieuwe RI's in U/L, omgerekend naar ng/mL
conversion_factor <- 47.1  # ng/mL = U/L * factor (draai om naar `/` als jullie lab dat zo definieert)
ci_table <- tibble::tribble(
  ~Status,           ~ci_low_UL, ~ci_high_UL,
  "Men",              0.39,       0.62,
  "premenopausal",    0.77,       0.98,
  "postmenopausal",   0.47,       1.08
) |>
  mutate(
    Status  = factor(Status, levels = status_levels),
    ci_low  = ci_low_UL  * conversion_factor,
    ci_high = ci_high_UL * conversion_factor
  )

p_percentile <- 0.95

# ---- populatietabel (Excel) ----
# Analyten in de tabel, met eenheid en aantal decimalen
table_analytes <- tibble::tribble(
  ~analyte, ~unit,    ~digits,
  "PROL",   "ng/mL",  1,
  "TSH",    "mU/L",   2,
  "FSH",    "U/L",    1,
  "LH",     "U/L",    1
)
status_labels <- c(Men = "Men", premenopausal = "Premenopausal women",
                   postmenopausal = "Postmenopausal women")

# =============================================================================
# HULPFUNCTIES
# =============================================================================

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
out <- function(file) file.path(output_dir, paste0(lab_name, "_", file))

# Populatienaam -> veilig stukje bestandsnaam ("Alle aanvragers" -> "alle_aanvragers")
file_tag <- function(x) gsub("[^a-z0-9]+", "_", tolower(x))

# ---- beschrijvende tabel ----
fmt_num <- function(x, d) formatC(x, format = "f", digits = d)

# Eén kolom van de tabel: samenvatting van één groep
summarise_group <- function(d, include_sex = TRUE) {
  n   <- nrow(d)
  age <- d$Age[!is.na(d$Age)]
  rows <- c()
  if (include_sex) {
    n_m <- sum(d$Geslacht == "M", na.rm = TRUE)
    rows["Sex, male, n (%)"] <- sprintf("%d (%s)", n_m, fmt_num(100 * n_m / n, 1))
  }
  rows["Age (years), mean [range]"] <- if (length(age) == 0) "\u2013" else
    sprintf("%s [%s\u2013%s]", fmt_num(mean(age), 1), fmt_num(min(age), 0), fmt_num(max(age), 0))
  rows["Age (years), median"] <- if (length(age) == 0) "\u2013" else fmt_num(median(age), 1)

  for (i in seq_len(nrow(table_analytes))) {
    a <- table_analytes$analyte[i]
    dg <- table_analytes$digits[i]
    x <- d[[a]][!is.na(d[[a]])]
    label <- sprintf("%s (%s), median [Q1\u2013Q3]", a, table_analytes$unit[i])
    val <- if (length(x) == 0) "\u2013" else {
      q <- quantile(x, c(0.25, 0.5, 0.75), names = FALSE)
      sprintf("%s [%s\u2013%s]", fmt_num(q[2], dg), fmt_num(q[1], dg), fmt_num(q[3], dg))
    }
    # aantal meetwaarden vermelden als niet iedereen deze analyt heeft
    if (length(x) > 0 && length(x) < n) val <- sprintf("%s (n = %d)", val, length(x))
    rows[label] <- val
  }
  rows
}

# Tabel: rijen = parameters, kolommen = groepen + Total (kop bevat n)
describe_population <- function(d, group_col, group_levels = NULL, group_labels = NULL,
                                include_sex = TRUE, total_label = "Total") {
  g <- as.character(d[[group_col]])
  g[is.na(g)] <- "Unknown"
  if (is.null(group_levels)) group_levels <- sort(unique(g))
  group_levels <- intersect(c(group_levels, "Unknown"), unique(g))

  groups <- c(lapply(setNames(group_levels, group_levels), function(l) d[g == l, , drop = FALSE]),
              setNames(list(d), total_label))
  cols <- lapply(groups, summarise_group, include_sex = include_sex)

  tab <- tibble::tibble(Characteristic = names(cols[[1]]))
  for (nm in names(groups)) {
    lab <- if (!is.null(group_labels) && nm %in% names(group_labels)) group_labels[[nm]] else nm
    tab[[sprintf("%s (n = %d)", lab, nrow(groups[[nm]]))]] <- unname(cols[[nm]])
  }
  tab
}

# Lijst met tabellen -> één Excel-bestand, één tabblad per tabel
write_publication_tables <- function(tables, file, note) {
  if (requireNamespace("openxlsx", quietly = TRUE)) {
    wb <- openxlsx::createWorkbook()
    header_style <- openxlsx::createStyle(textDecoration = "bold", border = "TopBottom",
                                          halign = "center", wrapText = TRUE)
    first_col    <- openxlsx::createStyle(halign = "left")
    for (nm in names(tables)) {
      sheet <- substr(gsub("[\\[\\]\\*\\?/\\\\:]", "", nm), 1, 31)
      tab <- tables[[nm]]
      openxlsx::addWorksheet(wb, sheet)
      title <- if (!is.null(attr(tab, "title"))) attr(tab, "title") else nm
      openxlsx::writeData(wb, sheet, title, startRow = 1)
      openxlsx::addStyle(wb, sheet, openxlsx::createStyle(textDecoration = "bold"), rows = 1, cols = 1)
      openxlsx::writeData(wb, sheet, tab, startRow = 3, headerStyle = header_style)
      openxlsx::addStyle(wb, sheet, openxlsx::createStyle(border = "Bottom"),
                         rows = nrow(tab) + 3, cols = seq_len(ncol(tab)), stack = TRUE)
      openxlsx::addStyle(wb, sheet, first_col, rows = 4:(nrow(tab) + 3), cols = 1, stack = TRUE)
      openxlsx::addStyle(wb, sheet, openxlsx::createStyle(halign = "center"),
                         rows = 4:(nrow(tab) + 3), cols = 2:ncol(tab),
                         gridExpand = TRUE, stack = TRUE)
      openxlsx::writeData(wb, sheet, note, startRow = nrow(tab) + 5)
      openxlsx::addStyle(wb, sheet, openxlsx::createStyle(textDecoration = "italic"),
                         rows = nrow(tab) + 5, cols = 1)
      openxlsx::setColWidths(wb, sheet, cols = 1, widths = 34)
      openxlsx::setColWidths(wb, sheet, cols = 2:ncol(tab), widths = 24)
    }
    openxlsx::saveWorkbook(wb, file, overwrite = TRUE)
  } else if (requireNamespace("writexl", quietly = TRUE)) {
    writexl::write_xlsx(tables, file)
  } else {
    warning("Installeer 'openxlsx' (of 'writexl') voor Excel-uitvoer; tabellen opgeslagen als CSV.",
            call. = FALSE)
    for (nm in names(tables)) {
      write.csv(tables[[nm]], sub("\\.xlsx$", paste0("_", file_tag(nm), ".csv"), file),
                row.names = FALSE)
    }
    return(invisible(NULL))
  }
  message("Populatietabellen opgeslagen: ", file)
}

# Labwaarden robuust naar getal: komma als decimaalteken, spaties, en censored
# waarden zoals "<0.1" of ">100" (krijgen de grenswaarde).
to_numeric_lab <- function(x, name = "") {
  if (is.numeric(x)) return(x)
  x_chr <- trimws(as.character(x))
  x_chr <- gsub(",", ".", x_chr, fixed = TRUE)
  x_chr <- gsub("^[<>]=?\\s*", "", x_chr)
  x_chr[x_chr == ""] <- NA
  res <- suppressWarnings(as.numeric(x_chr))
  lost <- unique(x_chr[!is.na(x_chr) & is.na(res)])
  if (length(lost) > 0) {
    warning(name, ": ", sum(!is.na(x_chr) & is.na(res)),
            " waarde(n) niet om te zetten naar getal (worden NA), bv: ",
            paste(head(lost, 5), collapse = ", "), call. = FALSE)
  }
  res
}

# Eerste test houden, daarna alleen tests >= min_days na de laatst BEHOUDEN test.
keep_one_per_period <- function(dates, min_days) {
  keep <- logical(length(dates))
  last_kept <- -Inf
  d <- as.numeric(dates)
  for (i in seq_along(d)) {
    if (d[i] - last_kept >= min_days) {
      keep[i] <- TRUE
      last_kept <- d[i]
    }
  }
  keep
}

# Indeling in RI-groepen. Vrouwen > 50 zonder FSH kunnen niet ingedeeld worden.
assign_status <- function(d) {
  d |>
    mutate(Status = case_when(
      Geslacht == "V" & Age > 50 & FSH > 30   ~ "postmenopausal",
      Geslacht == "V" & Age > 50 & FSH <= 30  ~ "exclude",
      Geslacht == "V" & Age > 50 & is.na(FSH) ~ "unknown_menopause",
      Geslacht == "V" & Age >= 18             ~ "premenopausal",
      Geslacht == "M" & Age >= 18             ~ "Men",
      Age < 18                                ~ "exclude",
      TRUE                                    ~ "unknown"
    ))
}

# Exclusie-log (flowchart); wordt per populatie opnieuw gestart
flow <- tibble(step = character(), n_rows = integer(), n_patients = integer())
log_step <- function(df, step) {
  flow <<- bind_rows(flow, tibble(step = step, n_rows = nrow(df),
                                  n_patients = n_distinct(df$Unique_Pt_ID)))
  message(sprintf("%-55s rijen: %7d  patienten: %6d",
                  step, nrow(df), n_distinct(df$Unique_Pt_ID)))
  invisible(df)
}

# =============================================================================
# 1. DATA LADEN EN OPSCHONEN
# =============================================================================

data <- read.csv(input_file, sep = input_sep, stringsAsFactors = FALSE)

if (!id_col %in% names(data)) stop("Kolom '", id_col, "' niet gevonden in ", input_file)
if (id_col != "Unique_Pt_ID") data <- data |> rename(Unique_Pt_ID = all_of(id_col))

required_cols <- c("Unique_Pt_ID", "Ontvangstdatum", "Geslacht", "Age",
                   screening_analytes, value_col)
missing_cols <- setdiff(required_cols, names(data))
if (length(missing_cols) > 0) {
  stop("Ontbrekende kolommen in ", input_file, ": ", paste(missing_cols, collapse = ", "))
}

data <- data |>
  mutate(
    row_id         = row_number(),
    Ontvangstdatum = as.Date(as.character(Ontvangstdatum), format = date_format),
    Geslacht       = toupper(trimws(as.character(Geslacht))),
    Age            = to_numeric_lab(Age, "Age")
  )
for (a in c(screening_analytes, value_col)) data[[a]] <- to_numeric_lab(data[[a]], a)

summary(data[[value_col]])

# =============================================================================
# 2. TYPE_ARTS EN ZORGLIJN
# =============================================================================

if (!"Zorglijn" %in% names(data)) {
  if (is.null(typearts_file) || !"Aanvrager" %in% names(data)) {
    stop("Geen kolom 'Zorglijn' in de data, en geen 'Aanvrager' + typearts_file om hem te maken.")
  }

  TypeArts <- read.csv(typearts_file, sep = ",", stringsAsFactors = FALSE) |>
    transmute(Aanvrager = trimws(Aanvrager), Type_Arts = trimws(Type_Arts)) |>
    distinct()

  # Een aanvrager met meerdere types zou rijen dupliceren -> eerste type houden
  conflicts <- TypeArts |> add_count(Aanvrager) |> filter(n > 1)
  if (nrow(conflicts) > 0) {
    warning(n_distinct(conflicts$Aanvrager), " aanvrager(s) met meerdere Type_Arts; ",
            "eerste wordt gebruikt. Zie ", out("typearts_conflicten.csv"), call. = FALSE)
    write.csv(conflicts, out("typearts_conflicten.csv"), row.names = FALSE)
    TypeArts <- TypeArts |> distinct(Aanvrager, .keep_all = TRUE)
  }

  data <- data |>
    mutate(Aanvrager = trimws(Aanvrager)) |>
    left_join(TypeArts, by = "Aanvrager", relationship = "many-to-one") |>
    mutate(Zorglijn = case_when(
      Type_Arts %in% eerstelijns_artsen ~ "Eerstelijnszorg",
      Type_Arts %in% tweedelijns_artsen ~ "Tweedelijnszorg",
      TRUE                              ~ NA_character_
    ))

  data |> filter(is.na(Type_Arts)) |> distinct(Aanvrager) |>
    write.csv(out("missing_type_arts.csv"), row.names = FALSE)
  data |> filter(!is.na(Type_Arts), is.na(Zorglijn)) |> distinct(Type_Arts) |>
    write.csv(out("type_arts_zonder_zorglijn.csv"), row.names = FALSE)
}

data |> count(Zorglijn) |> print()

# =============================================================================
# 3. POPULATIETABEL
# =============================================================================

# Hele dataset (alle PROL-aanvragen), per zorglijn + totaal
pub_tables <- list()
pub_tables[["All requests"]] <- data |>
  filter(!is.na(.data[[value_col]])) |>
  describe_population("Zorglijn",
                      group_levels = c("Eerstelijnszorg", "Tweedelijnszorg"),
                      group_labels = c(Eerstelijnszorg = "Primary care",
                                       Tweedelijnszorg = "Secondary care"))
attr(pub_tables[["All requests"]], "title") <- "Study population: all requests with a PROL result"
print(pub_tables[[1]], width = Inf)

# =============================================================================
# 4 + 5. GEZONDE REFERENTIEPOPULATIE (per populatie)
# =============================================================================

TSH_reference <- data.frame(
  Geslacht = c("V", "M"),
  Age_min  = c(19, 19),
  Age_max  = c(120, 120),
  Lower    = c(0.27, 0.27),
  Upper    = c(4.20, 4.20),
  Analyte  = "TSH"
)
# caveat: menopauze en menstruele cyclus zijn niet meegenomen!
LH_reference <- data.frame(
  Geslacht = c("V", "M"), Age_min = c(0, 0), Age_max = c(120, 120),
  Lower = c(1, 1.7), Upper = c(95.6, 8.6), Analyte = "LH"
)
FSH_reference <- data.frame(
  Geslacht = c("V", "M"), Age_min = c(0, 0), Age_max = c(120, 120),
  Lower = c(1.7, 1.5), Upper = c(134.8, 12.4), Analyte = "FSH"
)
reference_intervals <- bind_rows(TSH_reference, FSH_reference, LH_reference)
write.csv(reference_intervals, out("reference_intervals.csv"), row.names = FALSE)

# Klassen zijn [Age_min, Age_max); de bovenste klasse loopt open door (Age >= 120)
reference_join <- reference_intervals |>
  group_by(Analyte, Geslacht) |>
  mutate(Age_max_join = if_else(Age_max == max(Age_max), Inf, Age_max)) |>
  ungroup()

# Bouwt de gezonde referentiepopulatie voor één selectie van aanvragers.
#   label    : naam van de populatie (voor log en bestandsnamen)
#   zorglijn : vector met Zorglijn(en) om te houden, of NULL = geen filter
build_reference_population <- function(data, label, zorglijn = NULL) {
  message("\n==== Referentiepopulatie: ", label, " ====")
  flow <<- flow[0, ]
  tag <- file_tag(label)

  # ---- 4.0 selectie aanvragers + geldige datum ----
  if (is.null(zorglijn)) {
    data1 <- data |> log_step("Alle aanvragers (geen filter op aanvrager)")
  } else {
    data1 <- data |>
      filter(Zorglijn %in% zorglijn) |>
      log_step(paste("Zorglijn:", paste(zorglijn, collapse = " + ")))
  }

  n_bad_date <- sum(is.na(data1$Ontvangstdatum))
  if (n_bad_date > 0) {
    warning(label, ": ", n_bad_date, " rijen zonder geldige Ontvangstdatum worden verwijderd ",
            "(controleer date_format).", call. = FALSE)
  }
  data1 <- data1 |>
    filter(!is.na(Ontvangstdatum), !is.na(Unique_Pt_ID)) |>
    log_step("Geldige datum en patient-ID")

  # ---- 4a. elke TSH/FSH/LH-waarde toetsen ----
  df_reference <- data1 |>
    select(row_id, Unique_Pt_ID, Ontvangstdatum, Geslacht, Age, all_of(screening_analytes)) |>
    pivot_longer(all_of(screening_analytes), names_to = "Analyte", values_to = "Value") |>
    left_join(
      reference_join,
      by = join_by(Analyte, Geslacht, Age >= Age_min, Age < Age_max_join),
      relationship = "many-to-one"   # error als een waarde in >1 leeftijdsklasse valt
    ) |>
    mutate(status = case_when(
      is.na(Value)                  ~ "missing",
      is.na(Lower) | is.na(Upper)   ~ "no_reference",
      Value < Lower | Value > Upper ~ "abnormal",
      TRUE                          ~ "normal"
    ))

  count(df_reference, Analyte, status) |> print()

  # ---- 4b. alle rijen binnen +/- 1 jaar rond een afwijkende waarde eruit ----
  abnormal_events <- df_reference |>
    filter(status == "abnormal") |>
    distinct(Unique_Pt_ID, abnormal_date = Ontvangstdatum) |>
    mutate(win_start = abnormal_date - exclusion_window_days,
           win_end   = abnormal_date + exclusion_window_days)

  rows_near_abnormal <- data1 |>
    select(row_id, Unique_Pt_ID, Ontvangstdatum) |>
    inner_join(abnormal_events,
               by = join_by(Unique_Pt_ID, between(Ontvangstdatum, win_start, win_end))) |>
    distinct(row_id)

  data_clean <- data1 |>
    anti_join(rows_near_abnormal, by = "row_id") |>
    log_step(sprintf("Excl. rijen <= %s d rond afwijkende TSH/FSH/LH", exclusion_window_days))

  if (exclude_unclassifiable) {
    data_clean <- data_clean |>
      anti_join(df_reference |> filter(status == "no_reference") |> distinct(row_id),
                by = "row_id") |>
      log_step("Excl. samples zonder passend referentie-interval")
  }

  # ---- 4c. PROL aanwezig ----
  data_clean <- data_clean |>
    filter(!is.na(.data[[value_col]])) |>
    log_step(paste(value_col, "aanwezig"))

  # ---- 4d. max 1 test per patient per jaar ----
  df_healthy <- data_clean |>
    arrange(Unique_Pt_ID, Ontvangstdatum, row_id) |>
    group_by(Unique_Pt_ID) |>
    filter(keep_one_per_period(Ontvangstdatum, min_days_between)) |>
    ungroup() |>
    log_step(sprintf("Max. 1 test per patient per %s d", min_days_between))

  # controles
  check_abn <- df_healthy |>
    select(row_id, Unique_Pt_ID, Ontvangstdatum) |>
    inner_join(abnormal_events,
               by = join_by(Unique_Pt_ID, between(Ontvangstdatum, win_start, win_end)))
  stopifnot(nrow(check_abn) == 0)

  check_gap <- df_healthy |>
    group_by(Unique_Pt_ID) |>
    summarise(min_gap = if (n() > 1) min(diff(sort(as.numeric(Ontvangstdatum)))) else Inf,
              .groups = "drop")
  stopifnot(all(check_gap$min_gap >= min_days_between))

  write.csv(df_healthy |> select(-row_id), out(paste0(tag, "_prol_schoon.csv")),
            row.names = FALSE)

  # ---- 5. indeling Men / pre- / postmenopausal ----
  df <- assign_status(df_healthy)
  count(df, Status) |> print()

  df <- df |>
    filter(Status %in% status_levels) |>
    log_step("Volwassen en in te delen in RI-groep")

  write.csv(flow, out(paste0(tag, "_flowchart.csv")), row.names = FALSE)

  df |> mutate(Populatie = label)
}

ref_pops <- lapply(names(populaties), function(nm) {
  build_reference_population(data, label = nm, zorglijn = populaties[[nm]])
})
names(ref_pops) <- names(populaties)

# Referentiepopulatie per RI-groep + totaal, één tabblad per populatie
for (nm in names(ref_pops)) {
  tab <- describe_population(ref_pops[[nm]], "Status",
                             group_levels = status_levels, group_labels = status_labels,
                             include_sex = FALSE)
  attr(tab, "title") <- paste0("Reference population: ", nm)
  pub_tables[[paste("Ref -", nm)]] <- tab
  print(tab, width = Inf)
}

write_publication_tables(
  pub_tables, out("populatiebeschrijving.xlsx"),
  note = "Values are n (%), mean [range], or median [Q1\u2013Q3]. n = number of results when not available for all subjects."
)

# =============================================================================
# 6. VALIDATIE NIEUWE RI'S: observed p95 (met BI) vs 95%-BI van het nieuwe RI
# =============================================================================

# Non-parametrisch BI voor een percentiel (Reed, Henry & Mason 1971; CLSI EP28-A3c)
percentile_ci <- function(x, p = 0.95, conf_level = 0.95) {
  x <- sort(x[!is.na(x)])
  n <- length(x)
  if (n == 0) return(tibble::tibble(p_est = NA_real_, ci_low = NA_real_, ci_high = NA_real_))
  z <- qnorm(1 - (1 - conf_level) / 2)
  se <- sqrt(n * p * (1 - p))
  lower_rank <- max(1, floor(n * p - z * se))
  upper_rank <- min(n, ceiling(n * p + z * se) + 1)
  tibble::tibble(p_est = quantile(x, p, names = FALSE),
                 ci_low = x[lower_rank], ci_high = x[upper_rank])
}

# Alle populaties onder elkaar, met Populatie als kolom
plot_df_all <- bind_rows(ref_pops) |>
  mutate(Status    = factor(Status, levels = status_levels),
         Populatie = factor(Populatie, levels = names(populaties)))

observed_all <- plot_df_all |>
  group_by(Populatie, Status) |>
  reframe(n = sum(!is.na(.data[[value_col]])),
          percentile_ci(.data[[value_col]], p = p_percentile)) |>
  rename(p95 = p_est, p95_ci_low = ci_low, p95_ci_high = ci_high)

ri_check <- observed_all |>
  left_join(ri_table, by = "Status") |>
  left_join(ci_table |> select(Status, ci_low, ci_high), by = "Status") |>
  mutate(
    point_within_RI_CI = p95 >= ci_low & p95 <= ci_high,
    ci_overlap         = p95_ci_low <= ci_high & p95_ci_high >= ci_low,
    lab                = lab_name
  ) |>
  relocate(lab, Populatie, Status, n, RI_new, ci_low, ci_high,
           p95, p95_ci_low, p95_ci_high, point_within_RI_CI, ci_overlap)

print(ri_check)
write.csv(ri_check, out("ri_validatie.csv"), row.names = FALSE)

# ---- 6a. één validatiefiguur per populatie (zelfde opmaak als voorheen) ----
plot_validation <- function(plot_df, observed, label) {
  ggplot(plot_df, aes(x = .data[[value_col]])) +
    geom_rect(data = ci_table,
              aes(xmin = ci_low, xmax = ci_high, ymin = -Inf, ymax = Inf, fill = "95% CI of new RI"),
              inherit.aes = FALSE, alpha = 0.25) +
    geom_rect(data = observed,
              aes(xmin = p95_ci_low, xmax = p95_ci_high, ymin = -Inf, ymax = Inf,
                  fill = "95% CI of observed p95"),
              inherit.aes = FALSE, alpha = 0.25) +
    geom_density(colour = "steelblue", linewidth = 0.9) +
    geom_vline(data = ri_table, aes(xintercept = RI_new, linetype = "New RI"),
               colour = "black", linewidth = 0.8) +
    geom_vline(data = observed, aes(xintercept = p95, linetype = "Observed p95"),
               colour = "firebrick", linewidth = 0.8) +
    scale_fill_manual(values = c("95% CI of new RI" = "grey40",
                                 "95% CI of observed p95" = "orange"), name = NULL) +
    scale_linetype_manual(values = c("New RI" = "solid", "Observed p95" = "dashed"), name = NULL) +
    guides(linetype = guide_legend(override.aes = list(colour = c("black", "firebrick"))),
           fill     = guide_legend(override.aes = list(colour = NA))) +
    facet_wrap(~Status, scales = "free", ncol = 1) +
    labs(title = "Validation of newly established reference intervals",
         subtitle = paste0(lab_name, " - ", label),
         x = paste0(value_col, " (ng/mL)"), y = "Density") +
    theme_minimal(base_size = 13) +
    theme(legend.position = "bottom", legend.box = "vertical", legend.title = element_blank())
}

validation_plots <- list()
for (nm in names(populaties)) {
  p <- plot_validation(
    plot_df  = plot_df_all  |> filter(Populatie == nm),
    observed = observed_all |> filter(Populatie == nm),
    label    = nm
  )
  print(p)
  ggsave(out(paste0("ri_validatie_", file_tag(nm), ".png")), p, width = 8, height = 10, dpi = 300)
  validation_plots[[nm]] <- p
}

# ---- 6b. vergelijking: populaties over elkaar heen ----
# Grijze band + zwarte lijn = nieuw RI met BI; gekleurde curves en stippellijnen
# = verdeling en observed p95 per populatie.
p_compare <- ggplot(plot_df_all, aes(x = .data[[value_col]], colour = Populatie)) +
  geom_rect(data = ci_table,
            aes(xmin = ci_low, xmax = ci_high, ymin = -Inf, ymax = Inf),
            inherit.aes = FALSE, fill = "grey40", alpha = 0.2) +
  geom_density(linewidth = 0.9) +
  geom_vline(data = ri_table, aes(xintercept = RI_new),
             colour = "black", linewidth = 0.8) +
  geom_vline(data = observed_all, aes(xintercept = p95, colour = Populatie),
             linetype = "dashed", linewidth = 0.8) +
  scale_colour_manual(values = c("steelblue", "darkorange", "forestgreen", "purple")[
    seq_along(populaties)], name = NULL) +
  facet_wrap(~Status, scales = "free", ncol = 1) +
  labs(title = "PROL distribution per reference population",
       subtitle = paste0(lab_name,
                         " - solid black: new RI (grey band: 95% CI); dashed: observed p95"),
       x = paste0(value_col, " (ng/mL)"), y = "Density") +
  theme_minimal(base_size = 13) +
  theme(legend.position = "bottom")

p_compare
ggsave(out("ri_validatie_vergelijking_populaties.png"), p_compare, width = 8, height = 10, dpi = 300)

# =============================================================================
# 7. FLAGGING RATE IN DE ORIGINELE DATASET (alle PROL-waarden, geen filtering)
# =============================================================================
# Alle aanvragen van dit lab (eerste- en tweedelijns) met een PROL-waarde.
# "Flagged" = PROL boven de bovengrens. Vrouwen > 50 zonder FSH en < 18 jaar
# kunnen niet aan een RI-groep gekoppeld worden; die worden apart geteld.

data_flag <- data |>
  filter(!is.na(.data[[value_col]])) |>
  assign_status()

message("\nOriginele dataset met ", value_col, ": ", nrow(data_flag), " tests, ",
        n_distinct(data_flag$Unique_Pt_ID), " patienten")
status_counts <- data_flag |> count(Status, name = "n_tests") |>
  mutate(pct = round(100 * n_tests / sum(n_tests), 1))
print(status_counts)
write.csv(status_counts, out("flagging_status_indeling.csv"), row.names = FALSE)

flag_df <- data_flag |>
  filter(Status %in% status_levels) |>
  mutate(Status = factor(Status, levels = status_levels)) |>
  left_join(ri_table, by = "Status") |>
  mutate(
    flag_old = .data[[value_col]] > RI_old,
    flag_new = .data[[value_col]] > RI_new,
    changed  = flag_old != flag_new
  )

summarise_flags <- function(d) {
  d |>
    summarise(
      n_tests        = n(),
      n_patients     = n_distinct(Unique_Pt_ID),
      n_flag_old     = sum(flag_old),
      pct_flag_old   = round(100 * mean(flag_old), 1),
      n_flag_new     = sum(flag_new),
      pct_flag_new   = round(100 * mean(flag_new), 1),
      n_changed      = sum(changed),
      pct_changed    = round(100 * mean(changed), 1),
      newly_elevated = sum(changed & flag_new),
      newly_normal   = sum(changed & !flag_new),
      .groups = "drop"
    )
}

flag_summary <- bind_rows(
  flag_df |> group_by(Status) |> summarise_flags() |> mutate(Status = as.character(Status)),
  flag_df |> summarise_flags() |> mutate(Status = "Totaal")
) |>
  mutate(lab = lab_name, .before = 1)

print(flag_summary)
write.csv(flag_summary, out("flagging_rate.csv"), row.names = FALSE)

# zelfde, uitgesplitst naar zorglijn
flag_summary_zorglijn <- flag_df |>
  group_by(Zorglijn, Status) |>
  summarise_flags() |>
  mutate(lab = lab_name, .before = 1)

print(flag_summary_zorglijn)
write.csv(flag_summary_zorglijn, out("flagging_rate_per_zorglijn.csv"), row.names = FALSE)
