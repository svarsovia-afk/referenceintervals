# =============================================================================
# Opschonen eerstelijns data voor indirecte referentie-intervallen (PROL)
#
# Volgorde van de stappen (belangrijk!):
#   1. Selectie eerstelijnszorg + datum/waarden netjes inlezen
#   2. Elke TSH/FSH/LH-waarde toetsen aan het referentie-interval (leeftijd/geslacht)
#   3. Patient-exclusie: ALLE rijen van een patient binnen 1 jaar (voor of na)
#      een afwijkende waarde van WELK analyt dan ook worden verwijderd.
#      -> dit gebeurt VOOR het filteren op analyt en VOOR "max 1 test per jaar",
#         zodat afwijkingen in rijen die later wegvallen toch meetellen.
#   4. Filter op het doel-analyt (PROL aanwezig)
#   5. Maximaal 1 test per patient per jaar
#   6. Exclusie-log (flowchart) + export
#
# Vereist: dplyr >= 1.1.0 (voor join_by met ongelijkheden), tidyr
# Verwacht in `data`: Unique_Pt_ID, Zorglijn, Ontvangstdatum, Geslacht, Age,
#                     TSH, FSH, LH, PROL
# =============================================================================

library(dplyr)
library(tidyr)

stopifnot(packageVersion("dplyr") >= "1.1.0")

# ---- Instellingen -----------------------------------------------------------
screening_analytes    <- c("TSH", "FSH", "LH")  # analyten die "gezond" bepalen
target_analyte        <- "PROL"                 # analyt waarvoor het RI wordt bepaald
date_format           <- "%m/%d/%Y"
exclusion_window_days <- 365   # rijen binnen +/- 365 dagen van een afwijking eruit
                               # (Inf = patient volledig verwijderen)
min_days_between      <- 365   # max 1 test per patient per jaar
exclude_unclassifiable <- TRUE # waarde aanwezig maar geen passend ref-interval
                               # (bv. geslacht/leeftijd onbekend) -> sample eruit

# ---- Hulpfuncties ------------------------------------------------------------

# Zet labwaarden robuust om naar numeriek: komma als decimaalteken, spaties,
# en censored waarden zoals "<0.1" of ">100" (krijgen de grenswaarde).
to_numeric_lab <- function(x) {
  if (is.numeric(x)) return(x)
  x_chr <- trimws(as.character(x))
  x_chr <- gsub(",", ".", x_chr, fixed = TRUE)
  x_chr <- gsub("^[<>]=?\\s*", "", x_chr)
  x_chr[x_chr == ""] <- NA
  out <- suppressWarnings(as.numeric(x_chr))
  n_lost <- sum(!is.na(x_chr) & is.na(out))
  if (n_lost > 0) {
    warning(n_lost, " waarde(n) konden niet naar een getal worden omgezet en zijn NA: ",
            paste(head(unique(x_chr[!is.na(x_chr) & is.na(out)]), 5), collapse = ", "))
  }
  out
}

# Houdt per patient de eerste test, daarna alleen tests die minstens
# `min_days` na de laatst BEHOUDEN test liggen. Verwacht oplopend gesorteerde datums.
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

# Exclusie-log bijhouden
flow <- tibble(step = character(), n_rows = integer(), n_patients = integer())
log_step <- function(df, step) {
  flow <<- bind_rows(flow, tibble(step = step,
                                  n_rows = nrow(df),
                                  n_patients = n_distinct(df$Unique_Pt_ID)))
  message(sprintf("%-55s rijen: %7d  patienten: %6d",
                  step, nrow(df), n_distinct(df$Unique_Pt_ID)))
  invisible(df)
}

# ---- Controle input ---------------------------------------------------------
required_cols <- c("Unique_Pt_ID", "Zorglijn", "Ontvangstdatum", "Geslacht", "Age",
                   screening_analytes, target_analyte)
missing_cols <- setdiff(required_cols, names(data))
if (length(missing_cols) > 0) {
  stop("Ontbrekende kolommen in `data`: ", paste(missing_cols, collapse = ", "))
}

# ---- Referentie-intervallen -------------------------------------------------
TSH_reference <- data.frame(
  Geslacht = c("V", "M", "M", "V", "M", "V", "M", "V", "M", "V"),
  Age_min  = c(0, 0, 5, 5, 10, 10, 15, 15, 19, 19),
  Age_max  = c(5, 5, 10, 10, 15, 15, 19, 19, 120, 120),
  Lower    = c(0.8, 0.8, 1.2, 0.5, 0.8, 0.8, 0.6, 0.4, 0.3, 0.3),
  Upper    = c(6.2, 6.2, 5.3, 4.8, 4.2, 4.2, 5.4, 2.8, 4.5, 4.5),
  Analyte  = "TSH"
)

# caveat: menopauze en menstruele cyclus zijn niet meegenomen!
LH_reference <- data.frame(
  Geslacht = c("V", "M"),
  Age_min  = c(0, 0),
  Age_max  = c(120, 120),
  Lower    = c(1, 1),
  Upper    = c(77, 8),
  Analyte  = "LH"
)

FSH_reference <- data.frame(
  Geslacht = c("V", "M"),
  Age_min  = c(0, 0),
  Age_max  = c(120, 120),
  Lower    = c(1, 1),
  Upper    = c(153, 11),
  Analyte  = "FSH"
)

reference_intervals <- bind_rows(TSH_reference, FSH_reference, LH_reference)

write.csv(reference_intervals, "reference intervals.csv", row.names = FALSE)

# Leeftijdsklassen zijn [Age_min, Age_max); de bovenste klasse loopt open door
# (zodat Age == 120 of ouder ook een interval krijgt).
reference_join <- reference_intervals %>%
  group_by(Analyte, Geslacht) %>%
  mutate(Age_max_join = if_else(Age_max == max(Age_max), Inf, Age_max)) %>%
  ungroup()

# Sanity check: geen overlappende leeftijdsklassen binnen analyt/geslacht
overlap <- reference_join %>%
  arrange(Analyte, Geslacht, Age_min) %>%
  group_by(Analyte, Geslacht) %>%
  filter(lead(Age_min, default = Inf) < Age_max_join) %>%
  ungroup()
if (nrow(overlap) > 0) stop("Overlappende leeftijdsklassen in reference_intervals.")

# ---- Stap 1: eerstelijns + opschonen ----------------------------------------
data1 <- data %>%
  filter(Zorglijn == "Eerstelijnszorg") %>%
  mutate(
    row_id         = row_number(),   # uniek ID per sample (rij)
    Ontvangstdatum = as.Date(as.character(Ontvangstdatum), format = date_format),
    Geslacht       = toupper(trimws(as.character(Geslacht))),
    Age            = as.numeric(Age),
    across(all_of(c(screening_analytes, target_analyte)), to_numeric_lab)
  ) %>%
  log_step("Eerstelijnszorg")

n_bad_date <- sum(is.na(data1$Ontvangstdatum))
if (n_bad_date > 0) {
  warning(n_bad_date, " rijen met ontbrekende/onleesbare Ontvangstdatum worden verwijderd ",
          "(controleer `date_format`).")
}
data1 <- data1 %>%
  filter(!is.na(Ontvangstdatum), !is.na(Unique_Pt_ID)) %>%
  log_step("Geldige datum en patient-ID")

# ---- Stap 2: elke waarde toetsen aan referentie-interval --------------------
df_long <- data1 %>%
  select(row_id, Unique_Pt_ID, Ontvangstdatum, Geslacht, Age,
         all_of(screening_analytes)) %>%
  pivot_longer(cols = all_of(screening_analytes),
               names_to = "Analyte", values_to = "Value")

df_reference <- df_long %>%
  left_join(
    reference_join,
    by = join_by(Analyte, Geslacht, Age >= Age_min, Age < Age_max_join),
    relationship = "many-to-one"   # error als een waarde in >1 klasse valt
  ) %>%
  mutate(
    status = case_when(
      is.na(Value)                     ~ "missing",
      is.na(Lower) | is.na(Upper)      ~ "no_reference",
      Value < Lower | Value > Upper    ~ "abnormal",
      TRUE                             ~ "normal"
    )
  )

message("\nStatus van screeningswaarden (TSH/FSH/LH):")
print(count(df_reference, Analyte, status))

write.csv(df_reference, "eerstelijns_screening_status.csv", row.names = FALSE)

# ---- Stap 3: patient-exclusie rond afwijkende waarden -----------------------
# Alle afwijkende momenten per patient (over ALLE analyten)
abnormal_events <- df_reference %>%
  filter(status == "abnormal") %>%
  distinct(Unique_Pt_ID, abnormal_date = Ontvangstdatum) %>%
  mutate(win_start = abnormal_date - exclusion_window_days,
         win_end   = abnormal_date + exclusion_window_days)

# Alle samples (rijen) van die patienten die binnen het venster vallen
rows_near_abnormal <- data1 %>%
  select(row_id, Unique_Pt_ID, Ontvangstdatum) %>%
  inner_join(
    abnormal_events,
    by = join_by(Unique_Pt_ID,
                 between(Ontvangstdatum, win_start, win_end))
  ) %>%
  distinct(row_id)

data_clean <- data1 %>%
  anti_join(rows_near_abnormal, by = "row_id") %>%
  log_step(sprintf("Excl. rijen <= %s dagen rond afwijkende TSH/FSH/LH",
                   exclusion_window_days))

if (exclude_unclassifiable) {
  rows_no_ref <- df_reference %>%
    filter(status == "no_reference") %>%
    distinct(row_id)
  data_clean <- data_clean %>%
    anti_join(rows_no_ref, by = "row_id") %>%
    log_step("Excl. samples zonder passend referentie-interval")
}

# ---- Stap 4: filter op doel-analyt ------------------------------------------
data_clean <- data_clean %>%
  filter(!is.na(.data[[target_analyte]])) %>%
  log_step(paste(target_analyte, "aanwezig"))

# ---- Stap 5: maximaal 1 test per patient per jaar ---------------------------
df_healthy <- data_clean %>%
  arrange(Unique_Pt_ID, Ontvangstdatum, row_id) %>%
  group_by(Unique_Pt_ID) %>%
  filter(keep_one_per_period(Ontvangstdatum, min_days_between)) %>%
  ungroup() %>%
  log_step(sprintf("Max. 1 test per patient per %s dagen", min_days_between))

# ---- Controles op eindresultaat ---------------------------------------------
# 1) Geen enkele behouden rij ligt binnen het venster van een afwijking
check_abn <- df_healthy %>%
  select(row_id, Unique_Pt_ID, Ontvangstdatum) %>%
  inner_join(abnormal_events,
             by = join_by(Unique_Pt_ID, between(Ontvangstdatum, win_start, win_end)))
stopifnot(nrow(check_abn) == 0)

# 2) Tussen opeenvolgende tests van dezelfde patient zit >= min_days_between
check_gap <- df_healthy %>%
  group_by(Unique_Pt_ID) %>%
  arrange(Ontvangstdatum, .by_group = TRUE) %>%
  summarise(min_gap = suppressWarnings(min(as.numeric(diff(Ontvangstdatum)))),
            .groups = "drop")
stopifnot(all(is.infinite(check_gap$min_gap) | check_gap$min_gap >= min_days_between))

# ---- Stap 6: export ---------------------------------------------------------
message("\nExclusie-overzicht:")
print(flow)
write.csv(flow, "eerstelijns_prol_flowchart.csv", row.names = FALSE)

df_healthy <- df_healthy %>% select(-row_id)
write.csv(df_healthy, "eerstelijns_prol_schoon.csv", row.names = FALSE)

df <- df_healthy
