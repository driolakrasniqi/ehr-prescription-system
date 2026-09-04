export function filterAndSortMedications<
  T extends {
    genericName: string;
    brandName: string | null;
    strength: string;
    dosageForm: string;
    medicationCode: string;
  }
>(medications: T[], query: string): T[] {
  const term = query.trim().toLowerCase();

  return medications
    .map((medication) => ({ medication, rank: medicationMatchRank(medication, term) }))
    .filter((item) => item.rank < 9)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      return left.medication.genericName.localeCompare(right.medication.genericName);
    })
    .map((item) => item.medication);
}

function medicationMatchRank(
  medication: {
    genericName: string;
    brandName: string | null;
    strength: string;
    dosageForm: string;
    medicationCode: string;
  },
  term: string
): number {
  const generic = medication.genericName.toLowerCase();
  const brand = (medication.brandName ?? "").toLowerCase();
  if (!term) return 0;
  if (generic.startsWith(term) || brand.startsWith(term)) return 0;
  if (nameStartsWithWord(generic, term) || nameStartsWithWord(brand, term)) return 1;
  if (generic.includes(term) || brand.includes(term)) return 2;
  if (medication.medicationCode.toLowerCase().startsWith(term)) return 3;
  return 9;
}

function nameStartsWithWord(value: string, term: string): boolean {
  return value.split(/[\s()/,-]+/).some((word) => word.startsWith(term));
}
