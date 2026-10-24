rm(list = ls())
# =============================================================================
# Indirecte referentie-intervallen — generiek script voor ÉÉN analyt en ÉÉN lab
#
# Vul alleen blok "0. INSTELLINGEN" in (analyt, kolomnamen, screening, ...)
# en draai het script. Alle uitvoer komt in output/<lab>/<analyt>/.
#
# Stappen (bij elke stap wordt gelogd hoeveel rijen/patienten zijn uitgesloten):
#   0. Kolomnamen koppelen, getallen/datums inlezen, dubbele/ongeldige rijen eruit
#   1. Screening: alle rijen van een patient binnen +/- venster rond een
#      afwijkende waarde van een screeningsanalyt eruit (per analyt instelbaar)
#   2. Patienten met 2+ tests binnen 365 dagen volledig uitsluiten
#   3. Per patient de EERSTE test houden (of de laatste, instelbaar)
#   4. Zorglijn (via TypeArts) en selectie op zorglijn
#   5. Stratificatie (optioneel) + vlag bij te weinig waarden per stratum
#   6. Normaliteit: histogram, QQ-plot, boxplot, scheefheid (voor en na outliers)
#   7. Outlier-verwijdering per stratum
#   8. Partitie-check (Harris-Boyd) tussen strata
#   9. Percentielen (p2.5-p97.5 of p5-p95) met BI, en/of export voor refineR/TMC
#  10. Flagging rate oud vs nieuw RI in de originele data
#  11. Excel-overzicht van alle tabellen
#
# Gebaseerd op IFCC C-RIDL (Jones et al., CCLM 2019) en CLSI EP28-A3c.
# install.packages(c("tidyverse", "openxlsx"))   # dplyr >= 1.1.0 vereist
# =============================================================================

library(dplyr)
library(tidyr)
library(ggplot2)

stopifnot(packageVersion("dplyr") >= "1.1.0")

# =============================================================================
# 0. INSTELLINGEN — ALLEEN DIT BLOK AANPASSEN
# =============================================================================

lab_name    <- "MLS"
input_file  <- "Datasets/APTT.csv"
input_sep   <- ";"
date_format <- "%m/%d/%Y"          # controleer per bestand!

# ---- analyt waarvoor het referentie-interval bepaald wordt ----
analyte <- "APTT"                  # naam in titels en bestandsnamen
unit    <- "s"
digits  <- 1                       # decimalen in tabellen

# ---- kolomnamen: naam in het script = naam in JOUW bestand ----
# Verplicht: Unique_Pt_ID, Ontvangstdatum, Geslacht, Age, Value (= de analyt).
# Optioneel: Aanvrager (voor TypeArts) of Zorglijn (als die al in je data staat).
# Elke extra regel (bv. PT, FIB) is een extra analyt voor screening/stratificatie.
column_map <- c(
  Unique_Pt_ID   = "Pt_ID",
  Ontvangstdatum = "Ontvangstdatum",
  Geslacht       = "Geslacht",
  Age            = "Age",
  Aanvrager      = "Aanvrager",
  Value          = "APTT",
  PT             = "PT",
  FIB            = "FIB"
)

# Hoe staat geslacht in je bestand? (script gebruikt M en V)
sex_codes <- list(M = c("M", "Man", "Male"), V = c("V", "F", "Vrouw", "Female"))

# ---- 1. screening op andere analyten (per analyt anders) ----
# Een waarde buiten [Lower, Upper] = afwijkend -> alle rijen van die patient
# binnen +/- exclusion_window_days eruit. Geslacht: "M", "V" of "All".
# Leeftijdsklassen zijn [Age_min, Age_max); de hoogste klasse loopt door.
# NA bij Lower of Upper = die kant niet toetsen. Lege tabel = geen screening.
screening_reference <- tibble::tribble(
  ~Analyte, ~Geslacht, ~Age_min, ~Age_max, ~Lower, ~Upper,
  "PT",     "All",     0,        120,      9.5,    12.5,
  "FIB",    "All",     0,        120,      2.0,    4.0
)
# Geen screening:
# screening_reference <- tibble::tribble(~Analyte, ~Geslacht, ~Age_min, ~Age_max, ~Lower, ~Upper)

exclusion_window_days  <- 365   # Inf = hele patient eruit bij één afwijking
exclude_no_screening_range <- TRUE  # screeningswaarde zonder passend interval -> sample eruit

# ---- 2 + 3. herhaalde tests ----
repeat_window_days <- 365       # 2+ tests binnen dit aantal dagen -> patient eruit
keep_test          <- "first"   # "first" (aanbevolen) of "latest"

# ---- 4. zorglijn ----
typearts_file <- "TypeArts.csv" # Aanvrager -> Type_Arts; NULL als Zorglijn al in data staat
typearts_sep  <- ";"
zorglijn_keep <- "Eerstelijnszorg"  # bv. c("Eerstelijnszorg", "Onbekend"); NULL = alle

eerstelijns_artsen <- c(
  "BGD-arts", "Huisarts", "Klinisch Chemicus", "Marinearts", "Marine-Arts", "Vliegarts",
  "Patient is aanvrager"
)
tweedelijns_artsen <- c(
  "Anesthesioloog", "Anesthesioloog / pijnspecialist",
  "Arts-assistent (ANIOS), chirurgie/urologie/orthopedie",
  "Cardioloog", "Chirurg", "Dermatoloog", "Gastro-enteroloog", "Gynaecoloog",
  "Internist", "Internist / endocrinoloog", "Internist / infectioloog",
  "Internist / intensivist", "Internist / nefroloog", "Internist-nefroloog",
  "Internist / oncoloog", "Kinder-cardioloog", "Kinder-longarts", "Kinderarts",
  "KNO-arts", "Longarts", "Neuroloog", "Oogarts", "Orthopedisch Chirurg", "Orthopeed",
  "Plastisch Chirurg", "Psychiater", "Uroloog", "Ziekenhuis", "Advent", "Verloskundige"
)

# ---- 5. stratificatie ----
stratify        <- FALSE        # FALSE = een groep "All"
stratify_by_sex <- TRUE         # alleen gebruikt als stratify = TRUE
age_breaks      <- NULL         # bv. c(18, 50, 120) -> [18,50) en [50,120); NULL = niet op leeftijd
# Eigen strata (overschrijven geslacht/leeftijd). Elke regel is een voorwaarde
# in R; kolommen uit column_map mogen gebruikt worden. Eerste passende stratum telt.
custom_strata <- NULL
# custom_strata <- list(
#   "Men"                  = quote(Geslacht == "M" & Age >= 18),
#   "Premenopausal women"  = quote(Geslacht == "V" & Age >= 18 & Age <= 50),
#   "Postmenopausal women" = quote(Geslacht == "V" & Age > 50 & FSH > 30)
# )
min_n_partition <- 120          # minder waarden per stratum -> vlag

# ---- 7. outliers ----
outlier_method <- "horn"        # "horn" (Box-Cox + Tukey), "tukey", "tukey_log", "reed_dixon", "none"

# ---- 9. percentielen / export ----
percentiles <- "p2.5_p97.5"     # "p2.5_p97.5", "p5_p95" of "none"
ci_level    <- 0.90             # betrouwbaarheid van het BI rond elke grens (CLSI: 90%)
export_for  <- "none"           # "none", "refineR" of "TMC" (export van data VOOR outlier-verwijdering)

# ---- 10. huidig referentie-interval (voor de flagging rate) ----
# Stratum = naam van het stratum, of "All" voor alle strata. NA = geen grens.
ri_old <- tibble::tribble(
  ~Stratum, ~Lower, ~Upper,
  "All",    25,     35
)
flag_sides <- "both"            # "both", "upper" of "lower": welke kant telt als flag

# ---- populatietabel: extra analyten om te beschrijven (naast de analyt zelf) ----
table_extra_analytes <- tibble::tribble(
  ~analyte, ~unit, ~digits,
  "PT",     "s",   1,
  "FIB",    "g/L", 2
)

output_dir <- file.path("output", lab_name, analyte)

# =============================================================================
# HULPFUNCTIES
# =============================================================================

# Gedeelde functies (to_numeric_lab, log_step, percentile_ci, populatietabel)
local({
  this <- tryCatch(sys.frame(1)$ofile, error = function(e) NULL)
  args <- commandArgs(FALSE)
  f <- sub("^--file=", "", args[grepl("^--file=", args)])
  if (length(f)) this <- f[1]
  if (is.null(this) && requireNamespace("rstudioapi", quietly = TRUE) &&
      rstudioapi::isAvailable()) this <- rstudioapi::getSourceEditorContext()$path
  cands <- c(if (!is.null(this) && nzchar(this)) file.path(dirname(this), "ri_helpers.R"),
             "ri_helpers.R", file.path("R", "ri_helpers.R"))
  hit <- cands[file.exists(cands)][1]
  if (is.na(hit)) stop("ri_helpers.R niet gevonden; zet het in dezelfde map als dit script.")
  source(hit)
})

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
out <- function(file) file.path(output_dir, paste0(lab_name, "_", analyte, "_", file))

# ---- Box-Cox ----
bc_shift <- function(x) if (min(x, na.rm = TRUE) <= 0) 1 - min(x, na.rm = TRUE) else 0
boxcox_lambda <- function(x) {
  x <- x[!is.na(x)]
  if (length(x) < 3 || length(unique(x)) < 3) return(1)
  lx <- log(x)
  ll <- function(l) {
    y <- if (abs(l) < 1e-6) lx else (x^l - 1) / l
    -length(x) / 2 * log(mean((y - mean(y))^2)) + (l - 1) * sum(lx)
  }
  optimize(ll, c(-3, 3), maximum = TRUE)$maximum
}
bc <- function(x, l) if (abs(l) < 1e-6) log(x) else (x^l - 1) / l
bc_inv <- function(y, l) {
  if (abs(l) < 1e-6) return(exp(y))
  z <- l * y + 1
  ifelse(z > 0, z^(1 / l), if (l > 0) -Inf else Inf)
}
# Box-Cox transformatie met eigen lambda (en verschuiving bij waarden <= 0)
bc_transform <- function(x) {
  s <- bc_shift(x)
  l <- boxcox_lambda(x + s)
  list(y = bc(x + s, l), lambda = l, shift = s)
}

skewness <- function(x) {
  x <- x[!is.na(x)]
  if (length(x) < 3) return(NA_real_)
  mean((x - mean(x))^3) / sd(x)^3
}

# ---- outliers: geeft keep (TRUE/FALSE) en de grenzen in originele eenheden ----
outlier_fences <- function(x, method) {
  n <- length(x)
  res <- list(keep = rep(TRUE, n), lower = NA_real_, upper = NA_real_, lambda = NA_real_)
  if (method == "none" || n < 4) return(res)

  tukey <- function(y) {
    q <- quantile(y, c(0.25, 0.75), names = FALSE)
    c(q[1] - 1.5 * diff(q), q[2] + 1.5 * diff(q))
  }
  if (method == "tukey") {
    f <- tukey(x)
    res$lower <- f[1]; res$upper <- f[2]
  } else if (method == "tukey_log") {
    if (any(x <= 0)) stop("tukey_log kan niet met waarden <= 0; kies 'horn'.")
    f <- exp(tukey(log(x)))
    res$lower <- f[1]; res$upper <- f[2]
  } else if (method == "horn") {
    t <- bc_transform(x)
    f <- tukey(t$y)
    res$lower  <- bc_inv(f[1], t$lambda) - t$shift
    res$upper  <- bc_inv(f[2], t$lambda) - t$shift
    res$lambda <- t$lambda
    res$keep   <- t$y >= f[1] & t$y <= f[2]
    return(res)
  } else if (method == "reed_dixon") {
    # Herhaald: extreme waarde eruit als het gat > 1/3 van de range is
    xs <- sort(x)
    repeat {
      m <- length(xs)
      if (m < 4) break
      r <- xs[m] - xs[1]
      if (r == 0) break
      if ((xs[2] - xs[1]) / r > 1 / 3) { xs <- xs[-1]; next }
      if ((xs[m] - xs[m - 1]) / r > 1 / 3) { xs <- xs[-m]; next }
      break
    }
    res$lower <- min(xs); res$upper <- max(xs)
  } else {
    stop("Onbekende outlier_method: ", method)
  }
  res$keep <- x >= res$lower & x <= res$upper
  res
}

# ---- strata ----
age_band_labels <- function(br) sprintf("%g to <%g y", head(br, -1), tail(br, -1))

assign_stratum <- function(d) {
  d$Stratum <- NA_character_
  d$strat_sex <- NA_character_
  d$strat_age <- NA_integer_
  if (!stratify) {
    d$Stratum <- "All"
    return(d)
  }
  if (!is.null(custom_strata)) {
    for (nm in rev(names(custom_strata))) {   # omgekeerd: eerste passende wint
      hit <- tryCatch(eval(custom_strata[[nm]], d, parent.frame()),
                      error = function(e) stop("Stratum '", nm, "': ", conditionMessage(e)))
      d$Stratum[!is.na(hit) & hit] <- nm
    }
    return(d)
  }
  sex_lab <- if (stratify_by_sex) c(M = "Men", V = "Women")[d$Geslacht] else rep("", nrow(d))
  if (!is.null(age_breaks)) {
    idx <- findInterval(d$Age, age_breaks, rightmost.closed = FALSE)
    idx[idx < 1 | idx >= length(age_breaks)] <- NA
    age_lab <- age_band_labels(age_breaks)[idx]
  } else {
    idx <- rep(0L, nrow(d))
    age_lab <- rep("", nrow(d))
  }
  lab <- trimws(paste(sex_lab, age_lab))
  lab[is.na(sex_lab) | is.na(idx) | lab == ""] <- NA
  d$Stratum   <- lab
  d$strat_sex <- unname(sex_lab)
  d$strat_age <- idx
  d
}

stratum_levels <- function() {
  if (!stratify) return("All")
  if (!is.null(custom_strata)) return(names(custom_strata))
  s <- if (stratify_by_sex) c("Men", "Women") else ""
  a <- if (!is.null(age_breaks)) age_band_labels(age_breaks) else ""
  trimws(as.vector(t(outer(s, a, paste))))
}

# ---- plots ----
plot_distributions <- function(d, stage) {
  lv <- intersect(stratum_levels(), unique(d$Stratum))
  d <- d |> mutate(Stratum = factor(Stratum, levels = lv))

  p_hist <- ggplot(d, aes(x = Value)) +
    geom_histogram(aes(y = after_stat(density)), bins = 40, fill = "grey75", colour = "white") +
    geom_density(colour = "steelblue", linewidth = 0.8) +
    facet_wrap(~Stratum, scales = "free") +
    labs(title = paste0(analyte, " - histogram (", stage, ")"),
         x = paste0(analyte, " (", unit, ")"), y = "Density") +
    theme_minimal(base_size = 12)

  p_box <- ggplot(d, aes(x = Stratum, y = Value)) +
    geom_boxplot(fill = "grey85", outlier.colour = "firebrick") +
    labs(title = paste0(analyte, " - boxplot (", stage, ")"),
         x = NULL, y = paste0(analyte, " (", unit, ")")) +
    theme_minimal(base_size = 12)

  qq_df <- d |>
    group_by(Stratum) |>
    mutate(BoxCox = if (n() >= 3) bc_transform(Value)$y else NA_real_) |>
    ungroup() |>
    transmute(Stratum, Raw = Value, `Box-Cox` = BoxCox) |>
    pivot_longer(c(Raw, `Box-Cox`), names_to = "Scale", values_to = "y") |>
    filter(!is.na(y)) |>
    group_by(Stratum, Scale) |>
    mutate(y = (y - mean(y)) / sd(y)) |>     # standaardiseren: panelen vergelijkbaar
    ungroup() |>
    mutate(Scale = factor(Scale, levels = c("Raw", "Box-Cox")))
  p_qq <- ggplot(qq_df, aes(sample = y)) +
    stat_qq(size = 0.6, alpha = 0.5) +
    stat_qq_line(colour = "firebrick") +
    facet_grid(Scale ~ Stratum) +
    labs(title = paste0(analyte, " - QQ-plot raw vs Box-Cox (", stage, ")"),
         x = "Theoretical quantiles", y = "Standardized sample quantiles") +
    theme_minimal(base_size = 12)

  tag <- file_tag(stage)
  n_s <- length(lv)
  ggsave(out(paste0("histogram_", tag, ".png")), p_hist, width = 4 + 3 * min(n_s, 3), height = 3 + 3 * ceiling(n_s / 3), dpi = 200)
  ggsave(out(paste0("boxplot_", tag, ".png")), p_box, width = 3 + 1.5 * n_s, height = 5, dpi = 200)
  ggsave(out(paste0("qqplot_", tag, ".png")), p_qq, width = 3 + 3 * n_s, height = 6, dpi = 200)
  print(p_hist); print(p_box); print(p_qq)
}

normality_table <- function(d, stage) {
  d |>
    group_by(Stratum) |>
    summarise(
      stage         = stage,
      n             = n(),
      skewness_raw  = round(skewness(Value), 2),
      lambda_boxcox = if (n() >= 3) round(boxcox_lambda(Value + bc_shift(Value)), 2) else NA_real_,
      skewness_boxcox = if (n() >= 3) round(skewness(bc_transform(Value)$y), 2) else NA_real_,
      .groups = "drop"
    )
}

# ---- flagging ----
classify_ri <- function(v, lo, hi) {
  case_when(
    flag_sides %in% c("both", "lower") & !is.na(lo) & v < lo ~ "Low",
    flag_sides %in% c("both", "upper") & !is.na(hi) & v > hi ~ "High",
    TRUE ~ "Normal"
  )
}

summarise_flags <- function(d) {
  d |>
    summarise(
      n_tests        = n(),
      n_patients     = n_distinct(Unique_Pt_ID),
      n_flag_old     = sum(class_old != "Normal"),
      pct_flag_old   = round(100 * mean(class_old != "Normal"), 1),
      pct_low_old    = round(100 * mean(class_old == "Low"), 1),
      pct_high_old   = round(100 * mean(class_old == "High"), 1),
      n_flag_new     = sum(class_new != "Normal"),
      pct_flag_new   = round(100 * mean(class_new != "Normal"), 1),
      pct_low_new    = round(100 * mean(class_new == "Low"), 1),
      pct_high_new   = round(100 * mean(class_new == "High"), 1),
      n_changed      = sum(class_old != class_new),
      pct_changed    = round(100 * mean(class_old != class_new), 1),
      newly_high     = sum(class_old != class_new & class_new == "High"),
      newly_low      = sum(class_old != class_new & class_new == "Low"),
      newly_normal   = sum(class_old != class_new & class_new == "Normal"),
      .groups = "drop"
    )
}

# =============================================================================
# CONTROLE VAN DE INSTELLINGEN
# =============================================================================

stopifnot(keep_test %in% c("first", "latest"),
          outlier_method %in% c("horn", "tukey", "tukey_log", "reed_dixon", "none"),
          percentiles %in% c("p2.5_p97.5", "p5_p95", "none"),
          export_for %in% c("none", "refineR", "TMC"),
          flag_sides %in% c("both", "upper", "lower"))

if (stratify && is.null(custom_strata) && !stratify_by_sex && is.null(age_breaks)) {
  stop("stratify = TRUE, maar geen geslacht, age_breaks of custom_strata opgegeven.")
}

required_keys <- c("Unique_Pt_ID", "Ontvangstdatum", "Geslacht", "Age", "Value")
missing_keys <- setdiff(required_keys, names(column_map))
if (length(missing_keys) > 0) {
  stop("Vul in column_map ook in: ", paste(missing_keys, collapse = ", "))
}
extra_analytes <- setdiff(names(column_map), c(required_keys, "Aanvrager", "Zorglijn"))

missing_screen <- setdiff(unique(screening_reference$Analyte), extra_analytes)
if (length(missing_screen) > 0) {
  stop("Screeningsanalyt(en) niet in column_map: ", paste(missing_screen, collapse = ", "))
}

# =============================================================================
# STAP 0. INLEZEN, KOLOMNAMEN KOPPELEN EN OPSCHONEN
# =============================================================================
message("\n==== ", analyte, " (", lab_name, ") ====")

raw <- read.csv(input_file, sep = input_sep, stringsAsFactors = FALSE, check.names = FALSE)

missing_cols <- setdiff(unname(column_map), names(raw))
if (length(missing_cols) > 0) {
  stop("Deze kolommen uit column_map staan niet in ", input_file, ": ",
       paste(missing_cols, collapse = ", "),
       "\nKolommen in het bestand: ", paste(names(raw), collapse = ", "))
}

# Hernoemen naar de namen van het script; overige kolommen vallen weg
data <- raw |> select(all_of(column_map))

# Geslacht naar M/V
sex_raw <- toupper(trimws(as.character(data$Geslacht)))
sex_new <- rep(NA_character_, length(sex_raw))
for (s in names(sex_codes)) sex_new[sex_raw %in% toupper(sex_codes[[s]])] <- s
if (any(is.na(sex_new) & !is.na(sex_raw) & sex_raw != "")) {
  warning("Onbekende waarden in Geslacht (worden NA): ",
          paste(head(unique(sex_raw[is.na(sex_new) & sex_raw != ""]), 5), collapse = ", "),
          ". Pas sex_codes aan.", call. = FALSE)
}

data <- data |>
  mutate(
    Unique_Pt_ID   = trimws(as.character(Unique_Pt_ID)),
    Ontvangstdatum = as.Date(as.character(Ontvangstdatum), format = date_format),
    Geslacht       = sex_new,
    Age            = to_numeric_lab(Age, "Age"),
    Value          = to_numeric_lab(Value, analyte)
  )
for (a in extra_analytes) data[[a]] <- to_numeric_lab(data[[a]], a)
if ("Aanvrager" %in% names(data)) data$Aanvrager <- trimws(as.character(data$Aanvrager))

data <- data |> log_step("0a. Ingelezen")

if (all(is.na(data$Ontvangstdatum))) {
  stop("Geen enkele Ontvangstdatum kon gelezen worden; controleer date_format (nu '", date_format, "').")
}

data <- data |>
  distinct() |>
  log_step("0b. Exact dubbele rijen verwijderd")

data <- data |>
  filter(!is.na(Unique_Pt_ID), Unique_Pt_ID != "", !is.na(Ontvangstdatum)) |>
  log_step("0c. Geldig patient-ID en datum")

data <- data |>
  filter(!is.na(Geslacht), !is.na(Age)) |>
  mutate(row_id = row_number()) |>
  log_step("0d. Geslacht en leeftijd bekend")

# ---- Zorglijn voor alle rijen (gebruikt in stap 4 en bij de flagging rate) ----
if (!"Zorglijn" %in% names(data)) {
  if (!is.null(typearts_file) && "Aanvrager" %in% names(data)) {
    TypeArts <- read.csv(typearts_file, sep = typearts_sep, stringsAsFactors = FALSE) |>
      transmute(Aanvrager = trimws(Aanvrager), Type_Arts = trimws(Type_Arts)) |>
      distinct(Aanvrager, .keep_all = TRUE)
    data <- data |>
      left_join(TypeArts, by = "Aanvrager", relationship = "many-to-one") |>
      mutate(Zorglijn = case_when(
        Type_Arts %in% eerstelijns_artsen ~ "Eerstelijnszorg",
        Type_Arts %in% tweedelijns_artsen ~ "Tweedelijnszorg",
        TRUE                              ~ "Onbekend"
      ))
    # Ontbrekende aanvragers / types ter controle wegschrijven
    data |> filter(is.na(Type_Arts)) |> count(Aanvrager, name = "n_rijen") |>
      arrange(desc(n_rijen)) |> write.csv(out("aanvragers_zonder_type_arts.csv"), row.names = FALSE)
    data |> filter(!is.na(Type_Arts), Zorglijn == "Onbekend") |> count(Type_Arts, name = "n_rijen") |>
      write.csv(out("type_arts_zonder_zorglijn.csv"), row.names = FALSE)
  } else {
    data$Zorglijn <- "Onbekend"
    if (!is.null(zorglijn_keep)) {
      warning("Geen Zorglijn of Aanvrager + typearts_file: alle rijen krijgen Zorglijn 'Onbekend'.",
              call. = FALSE)
    }
  }
} else {
  data$Zorglijn <- ifelse(is.na(data$Zorglijn) | data$Zorglijn == "", "Onbekend", data$Zorglijn)
}
print(count(data, Zorglijn))

data_all <- data   # na stap 0: basis voor de flagging rate

# =============================================================================
# STAP 1. SCREENING OP ANDERE ANALYTEN
# =============================================================================

if (nrow(screening_reference) > 0) {
  scr_ref <- bind_rows(
    screening_reference |> filter(Geslacht != "All"),
    screening_reference |> filter(Geslacht == "All") |> mutate(Geslacht = "M"),
    screening_reference |> filter(Geslacht == "All") |> mutate(Geslacht = "V")
  ) |>
    group_by(Analyte, Geslacht) |>
    mutate(Age_max_join = if_else(Age_max == max(Age_max), Inf, Age_max)) |>
    ungroup()

  scr_analytes <- unique(scr_ref$Analyte)
  screening <- data |>
    select(row_id, Unique_Pt_ID, Ontvangstdatum, Geslacht, Age, all_of(scr_analytes)) |>
    pivot_longer(all_of(scr_analytes), names_to = "Analyte", values_to = "Result") |>
    left_join(scr_ref, by = join_by(Analyte, Geslacht, Age >= Age_min, Age < Age_max_join),
              relationship = "many-to-one") |>
    mutate(status = case_when(
      is.na(Result)                                ~ "missing",
      is.na(Age_min)                               ~ "no_reference",
      (!is.na(Lower) & Result < Lower) |
        (!is.na(Upper) & Result > Upper)           ~ "abnormal",
      TRUE                                         ~ "normal"
    ))
  screening_counts <- count(screening, Analyte, status)
  print(screening_counts)

  abnormal_events <- screening |>
    filter(status == "abnormal") |>
    distinct(Unique_Pt_ID, abnormal_date = Ontvangstdatum) |>
    mutate(win_start = abnormal_date - exclusion_window_days,
           win_end   = abnormal_date + exclusion_window_days)

  rows_near_abnormal <- data |>
    select(row_id, Unique_Pt_ID, Ontvangstdatum) |>
    inner_join(abnormal_events,
               by = join_by(Unique_Pt_ID, between(Ontvangstdatum, win_start, win_end))) |>
    distinct(row_id)

  data <- data |>
    anti_join(rows_near_abnormal, by = "row_id") |>
    log_step(sprintf("1a. Excl. <= %s d rond afwijkende %s", exclusion_window_days,
                     paste(scr_analytes, collapse = "/")))

  if (exclude_no_screening_range) {
    data <- data |>
      anti_join(screening |> filter(status == "no_reference") |> distinct(row_id), by = "row_id") |>
      log_step("1b. Excl. samples zonder passend screeningsinterval")
  }
} else {
  screening_counts <- tibble(Analyte = character(), status = character(), n = integer())
  data <- data |> log_step("1. Geen screening ingesteld")
}

data <- data |>
  filter(!is.na(Value)) |>
  log_step(paste0("1c. ", analyte, " aanwezig"))

# =============================================================================
# STAP 2. PATIENTEN MET 2+ TESTS BINNEN 1 JAAR UITSLUITEN
# =============================================================================

repeat_patients <- data |>
  group_by(Unique_Pt_ID) |>
  filter(n() > 1) |>
  summarise(min_gap = min(diff(sort(as.numeric(Ontvangstdatum)))), .groups = "drop") |>
  filter(min_gap < repeat_window_days)

data <- data |>
  anti_join(repeat_patients, by = "Unique_Pt_ID") |>
  log_step(sprintf("2. Excl. patienten met 2+ tests binnen %s d", repeat_window_days))

# =============================================================================
# STAP 3. EÉN TEST PER PATIENT (EERSTE OF LAATSTE)
# =============================================================================

data <- data |>
  arrange(Unique_Pt_ID, Ontvangstdatum, row_id) |>
  group_by(Unique_Pt_ID) |>
  slice(if (keep_test == "first") 1L else n()) |>
  ungroup() |>
  log_step(paste0("3. Een test per patient (", keep_test, ")"))

# =============================================================================
# STAP 4. ZORGLIJN
# =============================================================================

print(count(data, Zorglijn))
if (!is.null(zorglijn_keep)) {
  data <- data |>
    filter(Zorglijn %in% zorglijn_keep) |>
    log_step(paste("4. Zorglijn:", paste(zorglijn_keep, collapse = " + ")))
} else {
  data <- data |> log_step("4. Alle zorglijnen")
}

# =============================================================================
# STAP 5. STRATIFICATIE
# =============================================================================

data <- assign_stratum(data)
n_unassigned <- sum(is.na(data$Stratum))
data <- data |>
  filter(!is.na(Stratum)) |>
  log_step("5. In te delen in een stratum")
if (n_unassigned > 0) message(n_unassigned, " rijen pasten in geen enkel stratum.")

strata <- intersect(stratum_levels(), unique(data$Stratum))
data <- data |> mutate(Stratum = factor(Stratum, levels = strata))

n_per_stratum <- data |>
  count(Stratum, name = "n") |>
  mutate(min_n_flag = if_else(n < min_n_partition,
                              paste0("LOW N (< ", min_n_partition, ")"), "OK"))
print(n_per_stratum)
low_n <- n_per_stratum |> filter(n < min_n_partition)
if (nrow(low_n) > 0) {
  warning("Te weinig waarden (< ", min_n_partition, ") in: ",
          paste0(low_n$Stratum, " (n = ", low_n$n, ")", collapse = ", "), call. = FALSE)
}

data_pre_outlier <- data   # voor export naar refineR / TMC

# =============================================================================
# STAP 6. NORMALITEIT (VOOR OUTLIER-VERWIJDERING)
# =============================================================================

plot_distributions(data, "before outlier removal")
normality <- normality_table(data, "before outlier removal")

# =============================================================================
# STAP 7. OUTLIER-VERWIJDERING PER STRATUM
# =============================================================================

outlier_info <- list()
keep_flags <- rep(TRUE, nrow(data))
for (s in strata) {
  idx <- which(data$Stratum == s)
  f <- outlier_fences(data$Value[idx], outlier_method)
  keep_flags[idx] <- f$keep
  outlier_info[[s]] <- tibble(
    Stratum       = s,
    method        = outlier_method,
    n_before      = length(idx),
    removed_low   = sum(!f$keep & data$Value[idx] < median(data$Value[idx])),
    removed_high  = sum(!f$keep & data$Value[idx] >= median(data$Value[idx])),
    n_after       = sum(f$keep),
    lower_fence   = round(f$lower, digits + 1),
    upper_fence   = round(f$upper, digits + 1),
    boxcox_lambda = round(f$lambda, 2)
  )
}
outlier_summary <- bind_rows(outlier_info)
print(outlier_summary)

data <- data[keep_flags, ] |>
  log_step(paste0("7. Outliers verwijderd (", outlier_method, ")"))

plot_distributions(data, "after outlier removal")
normality <- bind_rows(normality, normality_table(data, "after outlier removal"))
print(normality)

# =============================================================================
# STAP 8. PARTITIE-CHECK (HARRIS-BOYD)
# =============================================================================
# Per paar strata, op Box-Cox getransformeerde data (na outliers):
#   z  = |m1 - m2| / sqrt(s1^2/n1 + s2^2/n2),  z* = 3 * sqrt((n1 + n2) / 240)
#   apart houden als z > z*  of  SD-ratio (grootste/kleinste) > 1.5

partition_check <- tibble()
if (length(strata) > 1) {
  meta <- data |> distinct(Stratum, strat_sex, strat_age) |> mutate(Stratum = as.character(Stratum))
  pairs <- combn(strata, 2, simplify = FALSE)
  for (pr in pairs) {
    # Automatische strata: alleen paren die in één factor verschillen (buren in leeftijd)
    if (is.null(custom_strata)) {
      m1 <- meta[meta$Stratum == pr[1], ][1, ]
      m2 <- meta[meta$Stratum == pr[2], ][1, ]
      same_sex <- identical(m1$strat_sex, m2$strat_sex)
      age_diff <- abs(m1$strat_age - m2$strat_age)
      if (!((same_sex && age_diff == 1) || (!same_sex && age_diff == 0))) next
    }
    x1 <- data$Value[data$Stratum == pr[1]]
    x2 <- data$Value[data$Stratum == pr[2]]
    if (length(x1) < 3 || length(x2) < 3) next
    s  <- bc_shift(c(x1, x2))
    l  <- boxcox_lambda(c(x1, x2) + s)
    y1 <- bc(x1 + s, l); y2 <- bc(x2 + s, l)
    z      <- abs(mean(y1) - mean(y2)) / sqrt(var(y1) / length(y1) + var(y2) / length(y2))
    z_crit <- 3 * sqrt((length(y1) + length(y2)) / 240)
    sd_ratio <- max(sd(y1), sd(y2)) / min(sd(y1), sd(y2))
    partition_check <- bind_rows(partition_check, tibble(
      stratum_1 = pr[1], stratum_2 = pr[2], n_1 = length(y1), n_2 = length(y2),
      z = round(z, 2), z_critical = round(z_crit, 2), sd_ratio = round(sd_ratio, 2),
      split_justified = if_else(z > z_crit | sd_ratio > 1.5, "yes", "no")
    ))
  }
  print(partition_check)
}

# =============================================================================
# STAP 9. PERCENTIELEN MET BI, EN/OF EXPORT VOOR refineR / TMC
# =============================================================================

limits <- tibble()
if (percentiles != "none") {
  p <- if (percentiles == "p2.5_p97.5") c(0.025, 0.975) else c(0.05, 0.95)
  for (s in strata) {
    x  <- data$Value[data$Stratum == s]
    lo <- percentile_ci(x, p[1], ci_level, type = 6)
    hi <- percentile_ci(x, p[2], ci_level, type = 6)
    limits <- bind_rows(limits, tibble(
      Stratum        = s,
      n              = length(x),
      min_n_flag     = if_else(length(x) < min_n_partition,
                               paste0("LOW N (< ", min_n_partition, ")"), "OK"),
      percentiles    = sprintf("p%g-p%g", 100 * p[1], 100 * p[2]),
      lower          = round(lo$p_est, digits),
      lower_ci_low   = round(lo$ci_low, digits),
      lower_ci_high  = round(lo$ci_high, digits),
      upper          = round(hi$p_est, digits),
      upper_ci_low   = round(hi$ci_low, digits),
      upper_ci_high  = round(hi$ci_high, digits),
      ci_level       = paste0(100 * ci_level, "%")
    ))
  }
  print(limits, width = Inf)
}

if (export_for != "none") {
  export_df <- data_pre_outlier |>
    transmute(Unique_Pt_ID, Ontvangstdatum, Geslacht, Age, Zorglijn,
              Stratum = as.character(Stratum), Value)
  write.csv(export_df, out(paste0("export_", export_for, "_alle_strata.csv")), row.names = FALSE)
  for (s in strata) {
    write.csv(export_df |> filter(Stratum == s),
              out(paste0("export_", export_for, "_", file_tag(s), ".csv")), row.names = FALSE)
  }
  message("Export voor ", export_for, " (data VOOR outlier-verwijdering) opgeslagen in ", output_dir)
}

# =============================================================================
# STAP 10. FLAGGING RATE OUD vs NIEUW RI (ORIGINELE DATA)
# =============================================================================
# Alle uitslagen van de analyt na stap 0 (geen screening, geen herhaal-filter),
# ingedeeld in dezelfde strata als hierboven.

flag_summary <- tibble()
flag_summary_zorglijn <- tibble()
if (nrow(limits) > 0 && nrow(ri_old) > 0) {
  flag_df <- data_all |>
    filter(!is.na(Value)) |>
    assign_stratum()
  n_flag_unassigned <- sum(is.na(flag_df$Stratum))
  if (n_flag_unassigned > 0) {
    message(n_flag_unassigned, " uitslagen passen in geen stratum en tellen niet mee in de flagging rate.")
  }

  old_lim <- bind_rows(
    ri_old |> filter(Stratum != "All"),
    tidyr::crossing(ri_old |> filter(Stratum == "All") |> select(-Stratum), Stratum = strata)
  ) |>
    distinct(Stratum, .keep_all = TRUE) |>
    rename(old_lower = Lower, old_upper = Upper)

  flag_df <- flag_df |>
    filter(!is.na(Stratum)) |>
    left_join(old_lim, by = "Stratum") |>
    left_join(limits |> select(Stratum, new_lower = lower, new_upper = upper), by = "Stratum") |>
    mutate(class_old = classify_ri(Value, old_lower, old_upper),
           class_new = classify_ri(Value, new_lower, new_upper))

  flag_summary <- flag_df |> group_by(Stratum) |> summarise_flags()
  if (length(strata) > 1) {
    flag_summary <- bind_rows(flag_summary,
                              flag_df |> summarise_flags() |> mutate(Stratum = "Total"))
  }
  flag_summary <- flag_summary |> relocate(Stratum)
  flag_summary_zorglijn <- flag_df |> group_by(Zorglijn, Stratum) |> summarise_flags()

  print(flag_summary, width = Inf)
} else {
  message("Flagging rate overgeslagen (percentiles = 'none' of geen ri_old).")
}

# =============================================================================
# STAP 11. ALLE TABELLEN NAAR EXCEL
# =============================================================================

analyte_label <- analyte
table_analytes <- bind_rows(
  tibble(analyte = "Value", label = analyte_label, unit = unit, digits = digits),
  table_extra_analytes |> filter(analyte %in% names(data)) |> mutate(label = analyte)
)
population_table <- describe_population(
  data |> mutate(Stratum = as.character(Stratum)), "Stratum",
  group_levels = strata,
  include_sex = !(stratify && is.null(custom_strata) && stratify_by_sex),
  analytes = table_analytes
)
attr(population_table, "title") <- paste0("Reference population ", analyte, " (", lab_name,
                                         ", after outlier removal)")
attr(population_table, "note") <- paste(
  "Values are n (%), mean [range], or median [Q1\u2013Q3].",
  "n = number of results when not available for all subjects.")
print(population_table, width = Inf)

attr(flow, "title") <- paste0("Flowchart ", analyte, " (", lab_name, ")")
attr(flow, "note")  <- "rows/patients_excluded = excluded compared with the previous step."

tables <- list(
  "Flowchart"      = flow,
  "Population"     = population_table,
  "N per stratum"  = n_per_stratum,
  "Screening"      = screening_counts,
  "Normality"      = normality,
  "Outliers"       = outlier_summary
)
if (nrow(partition_check) > 0) {
  attr(partition_check, "note") <- paste(
    "Harris-Boyd on Box-Cox transformed data: split justified if z > z* = 3*sqrt(N/240)",
    "or SD ratio > 1.5.")
  tables[["Partition check"]] <- partition_check
}
if (nrow(limits) > 0) {
  attr(limits, "note") <- paste0("Nonparametric limits (rank p(n+1)) with ", 100 * ci_level,
                                 "% confidence intervals; LOW N = fewer than ", min_n_partition,
                                 " results.")
  tables[["Limits"]] <- limits
}
if (nrow(flag_summary) > 0) {
  tables[["Flagging rate"]]          <- flag_summary
  tables[["Flagging per zorglijn"]]  <- flag_summary_zorglijn
}

write_publication_tables(tables, out("resultaten.xlsx"))
write.csv(flow, out("flowchart.csv"), row.names = FALSE)
message("\nKlaar. Uitvoer in: ", normalizePath(output_dir))
