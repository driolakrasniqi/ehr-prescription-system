export function filterAndSortPatients<
  T extends { firstName: string; lastName: string; patientNumber: string }
>(patients: T[], query: string): T[] {
  const term = query.trim().toLowerCase();
  if (!term) return patients;

  return patients
    .map((patient) => ({ patient, rank: patientMatchRank(patient, term) }))
    .filter((item) => item.rank < 9)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      return `${left.patient.lastName} ${left.patient.firstName}`.localeCompare(
        `${right.patient.lastName} ${right.patient.firstName}`
      );
    })
    .map((item) => item.patient);
}

function patientMatchRank(
  patient: { firstName: string; lastName: string; patientNumber: string },
  term: string
): number {
  const first = patient.firstName.toLowerCase();
  const last = patient.lastName.toLowerCase();
  const full = `${first} ${last}`;
  const number = patient.patientNumber.toLowerCase();
  if (first.startsWith(term) || last.startsWith(term) || full.startsWith(term)) return 0;
  if (number.startsWith(term)) return 1;
  if (full.includes(term) || number.includes(term)) return 2;
  return 9;
}
