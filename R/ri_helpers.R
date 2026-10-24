# =============================================================================
# Gedeelde hulpfuncties voor de referentie-interval scripts
#   - R/prol_reference_intervals.R
#   - R/indirect_ri.R
# Dit bestand hoeft niet aangepast te worden; het wordt met source() geladen.
# =============================================================================

library(dplyr)
library(tidyr)

# Versie van dit bestand; de scripts controleren dit zodat een oude kopie van
# ri_helpers.R een duidelijke melding geeft i.p.v. een "unused argument"-fout.
ri_helpers_version <- 2L

# Populatienaam -> veilig stukje bestandsnaam ("Alle aanvragers" -> "alle_aanvragers")
file_tag <- function(x) gsub("[^a-z0-9]+", "_", tolower(x))

# ---- inlezen ----------------------------------------------------------------

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

# ---- exclusie-log (flowchart) -----------------------------------------------
# Elke stap: aantal rijen en patienten dat over is, en hoeveel er t.o.v. de
# vorige stap zijn uitgesloten. Zet `flow <- flow[0, ]` om opnieuw te beginnen.
flow <- tibble(step = character(), n_rows = integer(), n_patients = integer(),
               rows_excluded = integer(), patients_excluded = integer())

log_step <- function(df, step) {
  n_r <- nrow(df)
  n_p <- n_distinct(df$Unique_Pt_ID)
  prev <- if (nrow(flow) > 0) flow[nrow(flow), ] else NULL
  ex_r <- if (is.null(prev)) 0L else as.integer(prev$n_rows - n_r)
  ex_p <- if (is.null(prev)) 0L else as.integer(prev$n_patients - n_p)
  flow <<- bind_rows(flow, tibble(step = step, n_rows = n_r, n_patients = n_p,
                                  rows_excluded = ex_r, patients_excluded = ex_p))
  message(sprintf("%-52s rijen: %7d (-%6d)  patienten: %6d (-%5d)",
                  step, n_r, ex_r, n_p, ex_p))
  invisible(df)
}

# ---- statistiek -------------------------------------------------------------

# Non-parametrisch BI voor een percentiel (Reed, Henry & Mason 1971; CLSI EP28-A3c).
# type = 7 is de R-standaard; type = 6 gebruikt rang p * (n + 1) zoals CLSI.
percentile_ci <- function(x, p = 0.95, conf_level = 0.95, type = 7) {
  x <- sort(x[!is.na(x)])
  n <- length(x)
  if (n == 0) return(tibble::tibble(p_est = NA_real_, ci_low = NA_real_, ci_high = NA_real_))
  z <- qnorm(1 - (1 - conf_level) / 2)
  se <- sqrt(n * p * (1 - p))
  lower_rank <- max(1, floor(n * p - z * se))
  upper_rank <- min(n, ceiling(n * p + z * se) + 1)
  tibble::tibble(p_est = quantile(x, p, names = FALSE, type = type),
                 ci_low = x[lower_rank], ci_high = x[upper_rank])
}

# ---- populatietabel (publicatieklaar) -----------------------------------------

fmt_num <- function(x, d) formatC(x, format = "f", digits = d)

# Eén kolom van de tabel: samenvatting van één groep.
# `analytes`: tabel met kolommen analyte, unit, digits en optioneel label.
summarise_group <- function(d, include_sex = TRUE, analytes = table_analytes,
                            include_zorglijn = FALSE) {
  n   <- nrow(d)
  age <- d$Age[!is.na(d$Age)]
  rows <- c()
  if (include_sex) {
    n_m <- sum(d$Geslacht == "M", na.rm = TRUE)
    rows["Sex, male, n (%)"] <- sprintf("%d (%s)", n_m, fmt_num(100 * n_m / n, 1))
  }
  if (include_zorglijn && "Zorglijn" %in% names(d)) {
    zl <- d$Zorglijn
    care <- c("Care line: primary, n (%)"   = sum(zl %in% "Eerstelijnszorg"),
              "Care line: secondary, n (%)" = sum(zl %in% "Tweedelijnszorg"))
    care["Care line: unknown, n (%)"] <- n - sum(care)
    for (nm in names(care)) rows[nm] <- sprintf("%d (%s)", care[[nm]], fmt_num(100 * care[[nm]] / n, 1))
  }
  rows["Age (years), mean [range]"] <- if (length(age) == 0) "\u2013" else
    sprintf("%s [%s\u2013%s]", fmt_num(mean(age), 1), fmt_num(min(age), 0), fmt_num(max(age), 0))
  rows["Age (years), median"] <- if (length(age) == 0) "\u2013" else fmt_num(median(age), 1)

  for (i in seq_len(nrow(analytes))) {
    a  <- analytes$analyte[i]
    dg <- analytes$digits[i]
    nm <- if ("label" %in% names(analytes)) analytes$label[i] else a
    x  <- if (a %in% names(d)) d[[a]][!is.na(d[[a]])] else numeric(0)
    label <- sprintf("%s (%s), median [Q1\u2013Q3]", nm, analytes$unit[i])
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
                                include_sex = TRUE, total_label = "Total",
                                analytes = table_analytes, include_zorglijn = FALSE) {
  g <- as.character(d[[group_col]])
  g[is.na(g)] <- "Unknown"
  if (is.null(group_levels)) group_levels <- sort(unique(g))
  group_levels <- intersect(c(group_levels, "Unknown"), unique(g))

  groups <- c(lapply(setNames(group_levels, group_levels), function(l) d[g == l, , drop = FALSE]),
              setNames(list(d), total_label))
  # alleen één groep: geen aparte Total-kolom nodig
  if (length(group_levels) == 1) groups <- groups[1]
  cols <- lapply(groups, summarise_group, include_sex = include_sex, analytes = analytes,
                 include_zorglijn = include_zorglijn)

  tab <- tibble::tibble(Characteristic = names(cols[[1]]))
  for (nm in names(groups)) {
    lab <- if (!is.null(group_labels) && nm %in% names(group_labels)) group_labels[[nm]] else nm
    tab[[sprintf("%s (n = %d)", lab, nrow(groups[[nm]]))]] <- unname(cols[[nm]])
  }
  tab
}

# Lijst met tabellen -> één Excel-bestand, één tabblad per tabel.
# Per tabel optioneel attr(tab, "title") en attr(tab, "note").
write_publication_tables <- function(tables, file, note = NULL) {
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
      openxlsx::writeData(wb, sheet, as.data.frame(tab), startRow = 3, headerStyle = header_style)
      if (nrow(tab) > 0) {
        openxlsx::addStyle(wb, sheet, openxlsx::createStyle(border = "Bottom"),
                           rows = nrow(tab) + 3, cols = seq_len(ncol(tab)), stack = TRUE)
        openxlsx::addStyle(wb, sheet, first_col, rows = 4:(nrow(tab) + 3), cols = 1, stack = TRUE)
        if (ncol(tab) > 1) {
          openxlsx::addStyle(wb, sheet, openxlsx::createStyle(halign = "center"),
                             rows = 4:(nrow(tab) + 3), cols = 2:ncol(tab),
                             gridExpand = TRUE, stack = TRUE)
        }
      }
      tab_note <- if (!is.null(attr(tab, "note"))) attr(tab, "note") else note
      if (!is.null(tab_note)) {
        openxlsx::writeData(wb, sheet, tab_note, startRow = nrow(tab) + 5)
        openxlsx::addStyle(wb, sheet, openxlsx::createStyle(textDecoration = "italic"),
                           rows = nrow(tab) + 5, cols = 1)
      }
      openxlsx::setColWidths(wb, sheet, cols = 1, widths = 34)
      if (ncol(tab) > 1) openxlsx::setColWidths(wb, sheet, cols = 2:ncol(tab), widths = 20)
    }
    openxlsx::saveWorkbook(wb, file, overwrite = TRUE)
  } else if (requireNamespace("writexl", quietly = TRUE)) {
    names(tables) <- substr(gsub("[\\[\\]\\*\\?/\\\\:]", "", names(tables)), 1, 31)
    writexl::write_xlsx(lapply(tables, as.data.frame), file)
  } else {
    warning("Installeer 'openxlsx' (of 'writexl') voor Excel-uitvoer; tabellen opgeslagen als CSV.",
            call. = FALSE)
    for (nm in names(tables)) {
      write.csv(tables[[nm]], sub("\\.xlsx$", paste0("_", file_tag(nm), ".csv"), file),
                row.names = FALSE)
    }
    return(invisible(NULL))
  }
  message("Tabellen opgeslagen: ", file)
}
