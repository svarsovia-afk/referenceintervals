# =============================================================================
# Vier analyt-bestanden (PROL, LH, FSH, TSH) samenvoegen op Accessionnummer
#
# Regels:
#   - PROL is de basis (left join): elke PROL-rij blijft behouden.
#   - Geslacht moet overeenkomen in alle bestanden (Accessionnummer + Geslacht
#     is de koppelsleutel).
#   - LH, FSH en TSH worden eerst onderling gekoppeld op Accessionnummer +
#     Geslacht + Leeftijd:
#        * Leeftijd gelijk     -> één rij, één kolom Leeftijd
#        * Leeftijd verschilt  -> aparte rij per leeftijd voor dat Accessionnummer
#   - Kolommen PROL, LH, FSH, TSH staan naast elkaar.
#   - Aanvrager uit LH/FSH/TSH: is die gelijk, dan één kolom Aanvrager. Wijkt
#     een analyt af, dan krijgt die een extra kolom (bv. Aanvrager_TSH) met de
#     afwijkende aanvrager voor die rij.
#   - Accessionnummers waar Geslacht niet overeenkomt worden NIET gekoppeld en
#     worden apart weggeschreven ter controle.
# =============================================================================

library(dplyr)
library(tidyr)

# ---- INSTELLINGEN -----------------------------------------------------------
# Per analyt: bestand en de naam van de kolom met de uitslag in dat bestand.
files <- list(
  PROL = list(file = "PROL.csv", value_col = "PROL"),
  LH   = list(file = "LH.csv",   value_col = "LH"),
  FSH  = list(file = "FSH.csv",  value_col = "FSH"),
  TSH  = list(file = "TSH.csv",  value_col = "TSH")
)
input_sep   <- ";"
acc_col     <- "Accessionnummer"
sex_col     <- "Geslacht"
age_col     <- "Leeftijd"
aanvrager_col <- "Aanvrager"
output_file <- "PROL_LH_FSH_TSH_merged.csv"

analytes <- c("PROL", "LH", "FSH", "TSH")   # volgorde van de kolommen

# ---- HULPFUNCTIES -----------------------------------------------------------

# Bestand inlezen, sleutelkolommen opschonen en uitslagkolom hernoemen naar analyt
read_analyte <- function(analyte, cfg, keep_other_cols = FALSE) {
  d <- read.csv(cfg$file, sep = input_sep, stringsAsFactors = FALSE,
                check.names = FALSE, colClasses = "character")

  needed <- c(acc_col, sex_col, cfg$value_col)
  miss <- setdiff(needed, names(d))
  if (length(miss) > 0) {
    stop(cfg$file, ": ontbrekende kolom(men): ", paste(miss, collapse = ", "))
  }
  if (!age_col %in% names(d)) {
    if (analyte != "PROL") stop(cfg$file, ": kolom '", age_col, "' ontbreekt")
    d[[age_col]] <- NA_character_
  }

  d <- d |>
    rename(Accessionnummer = all_of(acc_col),
           Geslacht        = all_of(sex_col),
           Leeftijd        = all_of(age_col),
           !!analyte       := all_of(cfg$value_col)) |>
    mutate(
      Accessionnummer = trimws(Accessionnummer),
      Geslacht        = toupper(trimws(Geslacht)),
      Leeftijd        = suppressWarnings(as.numeric(gsub(",", ".", trimws(Leeftijd)))),
      across(all_of(analyte), trimws)
    ) |>
    filter(!is.na(Accessionnummer), Accessionnummer != "")

  if (!keep_other_cols) {
    # Aanvrager meenemen als Aanvrager_<analyt>
    aanvr_name <- paste0("Aanvrager_", analyte)
    if (aanvrager_col %in% names(d)) {
      d[[aanvr_name]] <- trimws(d[[aanvrager_col]])
      d[[aanvr_name]][d[[aanvr_name]] == ""] <- NA
    } else {
      warning(cfg$file, ": geen kolom '", aanvrager_col, "'; Aanvrager wordt NA", call. = FALSE)
      d[[aanvr_name]] <- NA_character_
    }
    d <- d |> select(Accessionnummer, Geslacht, Leeftijd, all_of(analyte), all_of(aanvr_name))
  } else if (aanvrager_col %in% names(d)) {
    # Aanvrager uit het basisbestand apart houden
    d <- d |> rename(Aanvrager_PROL = all_of(aanvrager_col))
  }

  # exact dubbele rijen weg; resterende dubbelingen melden
  n_before <- nrow(d)
  d <- distinct(d)
  if (nrow(d) < n_before) {
    message(analyte, ": ", n_before - nrow(d), " exact dubbele rij(en) verwijderd")
  }
  dup <- d |> count(Accessionnummer, Geslacht, Leeftijd) |> filter(n > 1)
  if (nrow(dup) > 0) {
    warning(analyte, ": ", nrow(dup), " Accessionnummer(s) met meerdere verschillende uitslagen ",
            "bij dezelfde leeftijd; die geven extra rijen. Zie dubbel_", analyte, ".csv",
            call. = FALSE)
    d |> semi_join(dup, by = c("Accessionnummer", "Geslacht", "Leeftijd")) |>
      write.csv(paste0("dubbel_", analyte, ".csv"), row.names = FALSE)
  }

  message(sprintf("%-4s: %6d rijen, %6d accessionnummers",
                  analyte, nrow(d), n_distinct(d$Accessionnummer)))
  d
}

# ---- 1. INLEZEN -------------------------------------------------------------

prol <- read_analyte("PROL", files$PROL, keep_other_cols = TRUE)
lh   <- read_analyte("LH",   files$LH)
fsh  <- read_analyte("FSH",  files$FSH)
tsh  <- read_analyte("TSH",  files$TSH)

# ---- 2. LH, FSH, TSH onderling koppelen -------------------------------------
# Full join op Accessionnummer + Geslacht + Leeftijd:
# gelijke leeftijd -> zelfde rij; andere leeftijd -> aparte rij.
key_age <- c("Accessionnummer", "Geslacht", "Leeftijd")

hormones <- lh |>
  full_join(fsh, by = key_age, relationship = "many-to-many") |>
  full_join(tsh, by = key_age, relationship = "many-to-many")

# Accessionnummers waarbij LH/FSH/TSH meerdere leeftijden hebben (-> meerdere rijen)
age_mismatch <- hormones |>
  group_by(Accessionnummer, Geslacht) |>
  filter(n_distinct(Leeftijd) > 1) |>
  ungroup() |>
  arrange(Accessionnummer, Leeftijd)
message(n_distinct(age_mismatch$Accessionnummer),
        " accessionnummer(s) met verschillende Leeftijd tussen LH/FSH/TSH (aparte rijen)")
write.csv(age_mismatch, "controle_leeftijd_verschil.csv", row.names = FALSE)

# ---- 3. Geslacht-controle over alle 4 bestanden -----------------------------
sex_check <- bind_rows(
  prol     |> distinct(Accessionnummer, Geslacht) |> mutate(bron = "PROL"),
  lh       |> distinct(Accessionnummer, Geslacht) |> mutate(bron = "LH"),
  fsh      |> distinct(Accessionnummer, Geslacht) |> mutate(bron = "FSH"),
  tsh      |> distinct(Accessionnummer, Geslacht) |> mutate(bron = "TSH")
)
sex_mismatch <- sex_check |>
  group_by(Accessionnummer) |>
  filter(n_distinct(Geslacht) > 1) |>
  ungroup() |>
  arrange(Accessionnummer, bron)
if (nrow(sex_mismatch) > 0) {
  warning(n_distinct(sex_mismatch$Accessionnummer),
          " accessionnummer(s) met verschillend Geslacht tussen bestanden; die uitslagen ",
          "worden niet gekoppeld. Zie controle_geslacht_verschil.csv", call. = FALSE)
}
write.csv(sex_mismatch, "controle_geslacht_verschil.csv", row.names = FALSE)

# ---- 4. PROL als basis, left join op Accessionnummer + Geslacht -------------
merged <- prol |>
  rename(Leeftijd_PROL = Leeftijd) |>
  left_join(hormones, by = c("Accessionnummer", "Geslacht"),
            relationship = "many-to-many") |>
  # Leeftijd uit LH/FSH/TSH; als die er niet is, die van PROL
  mutate(Leeftijd = coalesce(Leeftijd, Leeftijd_PROL)) |>
  relocate(Accessionnummer, Geslacht, Leeftijd, all_of(analytes)) |>
  # Aanvrager: eerste bekende uit LH/FSH/TSH. De per-analyt kolom blijft alleen
  # gevuld als die aanvrager daarvan afwijkt.
  mutate(Aanvrager = coalesce(Aanvrager_LH, Aanvrager_FSH, Aanvrager_TSH),
         across(c(Aanvrager_LH, Aanvrager_FSH, Aanvrager_TSH),
                ~ if_else(!is.na(.x) & .x != Aanvrager, .x, NA_character_))) |>
  relocate(Aanvrager, any_of(c("Aanvrager_LH", "Aanvrager_FSH", "Aanvrager_TSH")),
           .after = TSH) |>
  arrange(Accessionnummer, Leeftijd)

# PROL-leeftijd alleen bewaren als die ergens afwijkt
if (all(is.na(merged$Leeftijd_PROL) | merged$Leeftijd_PROL == merged$Leeftijd)) {
  merged <- merged |> select(-Leeftijd_PROL)
} else {
  message("Let op: Leeftijd in PROL wijkt soms af van LH/FSH/TSH; kolom Leeftijd_PROL behouden.")
}

# Aanvrager_<analyt> alleen behouden als er ergens een afwijkende aanvrager is
aanvr_cols <- c("Aanvrager_LH", "Aanvrager_FSH", "Aanvrager_TSH")
aanvr_differs <- aanvr_cols[colSums(!is.na(merged[aanvr_cols])) > 0]
merged <- merged |> select(-all_of(setdiff(aanvr_cols, aanvr_differs)))
if (length(aanvr_differs) > 0) {
  message("Afwijkende aanvrager gevonden voor: ", paste(aanvr_differs, collapse = ", "))
}

# ---- 5. Controles en export -------------------------------------------------
stopifnot(all(prol$Accessionnummer %in% merged$Accessionnummer))  # geen PROL-rij kwijt

message("\nResultaat: ", nrow(merged), " rijen, ",
        n_distinct(merged$Accessionnummer), " accessionnummers (PROL: ",
        n_distinct(prol$Accessionnummer), ")")
merged |>
  summarise(across(all_of(analytes), ~ sum(!is.na(.x)), .names = "n_{.col}")) |>
  print()

write.csv(merged, output_file, row.names = FALSE)
