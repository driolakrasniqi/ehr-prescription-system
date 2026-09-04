import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, BarChart3, LoaderCircle, RefreshCw } from "lucide-react";
import {
  getAdminReports,
  type AdminReports,
  type ReportPair,
  type ReportPeriod
} from "../../api/adminReportsApi";
import "./AdminReportsPage.css";

type Tab =
  | "overview"
  | "doctors"
  | "encounters"
  | "patients"
  | "clinical"
  | "prescriptions"
  | "organizations"
  | "security";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "doctors", label: "Doctors" },
  { id: "encounters", label: "Visits" },
  { id: "patients", label: "Patients" },
  { id: "clinical", label: "Clinical" },
  { id: "prescriptions", label: "Prescriptions" },
  { id: "organizations", label: "Clinics & pharmacies" },
  { id: "security", label: "Security" }
];

const chartColors = ["#0b8a86", "#2b7fc0", "#d0892a", "#6c4db0", "#d84d5b", "#16825f", "#725de2"];

function message(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    return body?.error?.message ?? "Reports could not be loaded.";
  }
  return "Reports could not be loaded.";
}

function asPairs(value: number | ReportPair[] | undefined): ReportPair[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: number | ReportPair[] | undefined): number {
  return typeof value === "number" ? value : 0;
}

function rankedOrganizations(data: AdminReports, type: string) {
  return data.organizations.staff
    .filter((organization) => organization.type === type)
    .map((organization) => {
      const activity = data.organizations.activity.find((item) => item.name === organization.name);
      return {
        ...organization,
        encounters: activity?.encounters ?? 0,
        uniquePatients: activity?.uniquePatients ?? 0,
        prescriptions: activity?.prescriptions ?? 0
      };
    })
    .sort((left, right) =>
      type === "CLINIC"
        ? right.uniquePatients - left.uniquePatients || right.encounters - left.encounters
        : right.pharmacists - left.pharmacists
    );
}

export function AdminReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<AdminReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let requestId = 0;

    async function load(silent: boolean) {
      const id = ++requestId;
      if (!silent) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const result = await getAdminReports(period);
        if (active && id === requestId) {
          setData(result);
          setError(null);
        }
      } catch (loadError: unknown) {
        if (active && id === requestId && !silent) setError(message(loadError));
      } finally {
        if (active && id === requestId) {
          if (!silent) setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load(false);
    const interval = window.setInterval(() => void load(true), 15000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void load(true);
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [period]);

  return (
    <div className="reports-page">
      <section className="reports-hero">
        <div>
          <span>ADMINISTRATION</span>
          <h2>Statistical reports</h2>
          <p>Activity counts only — no patient names, and not a score of clinical quality.</p>
          {data?.generatedAt ? (
            <p className="reports-updated">
              Live · updates every 15 seconds · Last refresh{" "}
              {new Date(data.generatedAt).toLocaleTimeString()}
              {refreshing ? " · refreshing…" : ""}
            </p>
          ) : null}
        </div>
        <BarChart3 size={48} />
      </section>

      <div className="reports-toolbar">
        <div className="reports-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label>
          Period
          <select value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="reports-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setPeriod(period)}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="reports-state">
          <LoaderCircle className="spin" />
          Building reports…
        </div>
      ) : data ? (
        <ReportsBody data={data} tab={tab} />
      ) : null}
    </div>
  );
}

function ReportsBody({ data, tab }: { data: AdminReports; tab: Tab }) {
  if (tab === "overview") {
    return (
      <>
        <StatGrid
          items={[
            ["Users", data.overview.totalUsers],
            ["Doctors", data.overview.totalDoctors],
            ["Patients", data.overview.totalPatients],
            ["Clinics & pharmacies", data.overview.totalOrganizations],
            ["Visits", data.overview.totalEncounters],
            ["Prescriptions", data.overview.totalPrescriptions],
            ["Diagnoses", data.overview.totalDiagnoses],
            ["Allergies", data.overview.totalAllergies]
          ]}
        />
        <div className="reports-charts reports-charts--overview">
          <DonutChart title="Users by role" unit="accounts" rows={data.users.byRole} />
          <BarList title="Account status" rows={data.users.byStatus} />
          <LineChart
            title="New accounts by month"
            xLabel="Month"
            yLabel="New accounts"
            rows={data.users.registeredByMonth}
          />
          <ColumnChart
            title="Visits by month"
            xLabel="Month"
            yLabel="Visits"
            rows={data.encounters.byMonth}
          />
        </div>
      </>
    );
  }

  if (tab === "doctors") {
    const byVisits = [...data.doctorPerformance].sort((left, right) => right.encounters - left.encounters);
    const byPatients = [...data.doctorPerformance].sort(
      (left, right) => right.uniquePatients - left.uniquePatients
    );
    const topVisits = byVisits[0];
    const topPatients = byPatients[0];
    return (
      <>
        <StatGrid
          items={[
            ["Doctors", data.doctors.total],
            ["Active", data.doctors.active],
            ["With a clinic", data.doctors.withActiveOrg],
            ["Active in this period", data.doctors.recentlyActive]
          ]}
        />
        <div className="reports-highlights">
          <article className="reports-chart reports-highlight">
            <h3>Most visits</h3>
            {topVisits ? (
              <>
                <strong>{topVisits.doctorName}</strong>
                <p>
                  {topVisits.encounters} visits · {topVisits.uniquePatients} patients
                </p>
              </>
            ) : (
              <p>No visit data yet.</p>
            )}
          </article>
          <article className="reports-chart reports-highlight">
            <h3>Most patients</h3>
            {topPatients ? (
              <>
                <strong>{topPatients.doctorName}</strong>
                <p>
                  {topPatients.uniquePatients} patients · {topPatients.encounters} visits
                </p>
              </>
            ) : (
              <p>No patient data yet.</p>
            )}
          </article>
        </div>
        <div className="reports-charts">
          <GroupedBarChart
            title="Workload by doctor"
            xLabel="Doctor"
            yLabel="Count"
            series={[
              { name: "Patients", color: "#0b8a86" },
              { name: "Visits", color: "#2b7fc0" },
              { name: "Prescriptions", color: "#d0892a" }
            ]}
            rows={byVisits.slice(0, 6).map((row) => ({
              label: row.doctorName,
              values: [row.uniquePatients, row.encounters, row.prescriptions]
            }))}
          />
          <DonutChart title="Doctors by specialty" unit="doctors" rows={data.doctors.bySpecialty} />
          <BarList title="Doctors by clinic" rows={data.doctors.byClinic} />
          <LineChart
            title="Doctors added by month"
            xLabel="Month"
            yLabel="Doctors added"
            rows={data.doctors.addedByMonth}
          />
        </div>
        <section className="reports-table-wrap">
          <header>
            <h3>Activity by doctor</h3>
            <p>Ordered by visits. These are workload counts, not a quality score.</p>
          </header>
          <div className="reports-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Doctor</th>
                  <th>Patients</th>
                  <th>Visits</th>
                  <th>Prescriptions</th>
                  <th>Diagnoses</th>
                </tr>
              </thead>
              <tbody>
                {byVisits.map((row, index) => (
                  <tr key={row.doctorName}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{row.doctorName}</strong>
                      <small>{row.specialty}</small>
                    </td>
                    <td>{row.uniquePatients}</td>
                    <td>{row.encounters}</td>
                    <td>{row.prescriptions}</td>
                    <td>{row.diagnoses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  if (tab === "encounters") {
    return (
      <>
        <StatGrid
          items={[
            ["Visits", data.encounters.total],
            ["Unique patients", data.encounters.uniquePatients],
            ["Completed", data.encounters.completedRate, "%"],
            ["With a prescription", data.encounters.withPrescription]
          ]}
        />
        <div className="reports-charts">
          <DonutChart title="Visits by status" unit="visits" rows={data.encounters.byStatus} />
          <BarList title="Visits by type" rows={data.encounters.byType} />
          <LineChart
            title="Visits by month"
            xLabel="Month"
            yLabel="Visits"
            rows={data.encounters.byMonth}
          />
          <ColumnChart
            title="Visits by age group"
            xLabel="Age group"
            yLabel="Visits"
            rows={data.encounters.byAge}
          />
          <BarList title="Visits by doctor" rows={data.encounters.byDoctor} />
          <BarList title="Visits by clinic" rows={data.encounters.byClinic} />
        </div>
      </>
    );
  }

  if (tab === "patients") {
    return (
      <>
        <StatGrid
          items={[
            ["Patients", data.patients.total],
            ["With a visit", data.patients.withEncounters],
            ["Returned for another visit", data.patients.returning],
            ["With an active prescription", data.patients.withActivePrescriptions]
          ]}
        />
        <div className="reports-charts">
          <DonutChart title="Patients by sex" unit="patients" rows={data.patients.bySex} />
          <ColumnChart
            title="Patients by age group"
            xLabel="Age group"
            yLabel="Patients"
            rows={data.patients.byAge}
          />
          <LineChart
            title="Patients registered by month"
            xLabel="Month"
            yLabel="Patients registered"
            rows={data.patients.registeredByMonth}
          />
          <BarList title="Patients by doctor" rows={data.patients.uniqueByDoctor} />
          <DonutChart title="Patients by status" unit="patients" rows={data.patients.byStatus} />
          <BarList title="Patients by city" rows={data.patients.byCity} />
        </div>
      </>
    );
  }

  if (tab === "clinical") {
    const diagnoses = data.clinical.diagnoses;
    const allergies = data.clinical.allergies;
    return (
      <>
        <StatGrid
          items={[
            ["Diagnoses", asNumber(diagnoses.total)],
            ["Active diagnoses", asNumber(diagnoses.active)],
            ["Allergies", asNumber(allergies.total)],
            ["Active allergies", asNumber(allergies.active)]
          ]}
        />
        <div className="reports-charts">
          <BarList title="Most frequent diagnoses" rows={asPairs(diagnoses.top)} />
          <DonutChart title="Diagnoses by category" unit="diagnoses" rows={asPairs(diagnoses.byCategory)} />
          <BarList title="Most frequent allergy substances" rows={asPairs(allergies.topSubstances)} />
          <DonutChart title="Allergies by category" unit="allergies" rows={asPairs(allergies.byCategory)} />
          <ColumnChart
            title="Diagnoses by month"
            xLabel="Month"
            yLabel="Diagnoses"
            rows={asPairs(diagnoses.byMonth)}
          />
          <BarList title="Diagnoses by doctor" rows={asPairs(diagnoses.byDoctor)} />
        </div>
      </>
    );
  }

  if (tab === "prescriptions") {
    const meds = data.prescriptions.medications;
    return (
      <>
        <StatGrid
          items={[
            ["Prescriptions", data.prescriptions.total],
            ["Active", data.prescriptions.activeValid],
            ["Cancelled", data.prescriptions.cancelled],
            ["Medicines in catalogue", asNumber(meds.active)]
          ]}
        />
        <div className="reports-charts">
          <DonutChart title="Prescriptions by status" unit="prescriptions" rows={data.prescriptions.byStatus} />
          <LineChart
            title="Prescriptions issued by month"
            xLabel="Month"
            yLabel="Prescriptions"
            rows={data.prescriptions.byMonth}
          />
          <BarList title="Most prescribed medicines" rows={asPairs(meds.mostPrescribed)} />
          <BarList title="Prescriptions by doctor" rows={data.prescriptions.byDoctor} />
          <ColumnChart
            title="Prescriptions by clinic"
            xLabel="Clinic"
            yLabel="Prescriptions"
            rows={data.prescriptions.byClinic}
          />
          <DonutChart title="Signature method" unit="prescriptions" rows={data.prescriptions.bySignature} />
        </div>
      </>
    );
  }

  if (tab === "organizations") {
    const clinics = rankedOrganizations(data, "CLINIC");
    const pharmacies = rankedOrganizations(data, "PHARMACY");
    const busiestClinic = clinics[0];
    const largestPharmacy = pharmacies[0];
    return (
      <>
        <StatGrid
          items={[
            ["Organizations", data.organizations.total],
            ["Clinics", clinics.length],
            ["Pharmacies", pharmacies.length],
            ["Pharmacists", data.organizations.pharmacists?.length ?? 0]
          ]}
        />
        <div className="reports-highlights">
          <article className="reports-chart reports-highlight">
            <h3>Clinic with most patients</h3>
            {busiestClinic ? (
              <>
                <strong>{busiestClinic.name}</strong>
                <p>
                  {busiestClinic.uniquePatients} patients · {busiestClinic.doctors} doctors ·{" "}
                  {busiestClinic.encounters} visits
                </p>
              </>
            ) : (
              <p>No clinic activity yet.</p>
            )}
          </article>
          <article className="reports-chart reports-highlight">
            <h3>Pharmacy with most pharmacists</h3>
            {largestPharmacy ? (
              <>
                <strong>{largestPharmacy.name}</strong>
                <p>{largestPharmacy.pharmacists} pharmacists</p>
              </>
            ) : (
              <p>No pharmacy staff yet.</p>
            )}
          </article>
        </div>
        <div className="reports-charts">
          <DonutChart title="Organizations by type" unit="organizations" rows={data.organizations.byType} />
          <BarList title="Organizations by status" rows={data.organizations.byStatus} />
          <BarList title="Organizations by city" rows={data.organizations.byCity} />
          <ColumnChart
            title="Visits by clinic"
            xLabel="Clinic"
            yLabel="Visits"
            rows={clinics.slice(0, 8).map((clinic) => ({
              label: clinic.name,
              count: clinic.encounters
            }))}
          />
        </div>
        <section className="reports-table-wrap">
          <header>
            <h3>Clinics</h3>
            <p>Ranked by unique patients, then visits.</p>
          </header>
          <div className="reports-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Clinic</th>
                  <th>Doctors</th>
                  <th>Patients</th>
                  <th>Visits</th>
                  <th>Prescriptions</th>
                </tr>
              </thead>
              <tbody>
                {clinics.map((org, index) => (
                  <tr key={org.name}>
                    <td>{index + 1}</td>
                    <td>{org.name}</td>
                    <td>{org.doctors}</td>
                    <td>{org.uniquePatients}</td>
                    <td>{org.encounters}</td>
                    <td>{org.prescriptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="reports-table-wrap">
          <header>
            <h3>Pharmacies</h3>
            <p>Ranked by assigned pharmacists.</p>
          </header>
          <div className="reports-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Pharmacy</th>
                  <th>Pharmacists</th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.map((org, index) => (
                  <tr key={org.name}>
                    <td>{index + 1}</td>
                    <td>{org.name}</td>
                    <td>{org.pharmacists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="reports-table-wrap">
          <header>
            <h3>Pharmacists</h3>
            <p>Assigned pharmacists by pharmacy. Lookup work is not a quality score.</p>
          </header>
          <div className="reports-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pharmacist</th>
                  <th>Pharmacy</th>
                  <th>Status</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {(data.organizations.pharmacists ?? []).map((row) => (
                  <tr key={`${row.name}-${row.pharmacy}`}>
                    <td>{row.name}</td>
                    <td>{row.pharmacy}</td>
                    <td>{readableLabel(row.status)}</td>
                    <td>{row.lastLogin ? new Date(row.lastLogin).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <StatGrid
        items={[
          ["Events", data.security.totalEvents],
          ["Failed or denied", data.security.failed],
          ["Failed logins", data.security.failedLogins],
          ["Locked accounts", data.security.lockedAccounts]
        ]}
      />
      <div className="reports-charts">
        <DonutChart title="Activity by role" unit="events" rows={data.security.byRole} />
        <LineChart
          title="Activity by month"
          xLabel="Month"
          yLabel="Events"
          rows={data.security.byMonth}
        />
        <BarList title="Most frequent actions" rows={data.security.topActions} />
        <BarList title="Failed or denied by IP" rows={data.security.failedIps} />
      </div>
    </>
  );
}

function StatGrid({ items }: { items: Array<[string, number, string?]> }) {
  return (
    <section className="reports-stats">
      {items.map(([label, value, suffix]) => (
        <article key={label}>
          <small>{label}</small>
          <strong>
            {value}
            {suffix ?? ""}
          </strong>
        </article>
      ))}
    </section>
  );
}

function readableLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function axisLabel(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, 1).toLocaleString(undefined, {
      month: "short",
      year: "2-digit"
    });
  }
  const label = readableLabel(value);
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

function LineChart({
  title,
  rows,
  xLabel,
  yLabel
}: {
  title: string;
  rows: ReportPair[];
  xLabel: string;
  yLabel: string;
}) {
  const visible = rows.slice(-12);
  const width = 440;
  const height = 228;
  const pad = { top: 22, right: 14, bottom: 52, left: 56 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const yMax = Math.max(4, Math.ceil(Math.max(...visible.map((row) => row.count), 1) / 4) * 4);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * yMax);
  const points = visible.map((row, index) => {
    const x =
      visible.length === 1
        ? pad.left + innerWidth / 2
        : pad.left + (index / (visible.length - 1)) * innerWidth;
    const y = pad.top + innerHeight - (row.count / yMax) * innerHeight;
    return { ...row, x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area =
    points.length > 0
      ? `${line} L ${points[points.length - 1].x} ${pad.top + innerHeight} L ${points[0].x} ${pad.top + innerHeight} Z`
      : "";

  return (
    <article className="reports-chart">
      <h3>{title}</h3>
      {visible.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <div className="chart-line">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. Y: ${yLabel}. X: ${xLabel}.`}>
            {yTicks.map((tick) => {
              const y = pad.top + innerHeight - (tick / yMax) * innerHeight;
              return (
                <g key={tick}>
                  <line
                    x1={pad.left}
                    y1={y}
                    x2={width - pad.right}
                    y2={y}
                    className="chart-line__grid"
                  />
                  <text x={pad.left - 6} y={y + 3} textAnchor="end" className="chart-line__tick" fontSize="9">
                    {tick}
                  </text>
                </g>
              );
            })}
            <text
              x={13}
              y={pad.top + innerHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90 13 ${pad.top + innerHeight / 2})`}
              className="chart-line__axis"
              fontSize="10"
            >
              {yLabel}
            </text>
            {area ? <path d={area} className="chart-line__area" /> : null}
            {line ? <path d={line} className="chart-line__path" /> : null}
            {points.map((point) => (
              <g key={`${title}-${point.label}`}>
                <circle cx={point.x} cy={point.y} r="3.2" className="chart-line__dot" />
                <text
                  x={point.x}
                  y={point.y - 8}
                  textAnchor="middle"
                  className="chart-line__value"
                  fontSize="8"
                >
                  {point.count}
                </text>
                <text x={point.x} y={height - 22} textAnchor="middle" className="chart-line__tick" fontSize="8">
                  {axisLabel(point.label)}
                </text>
              </g>
            ))}
            <text
              x={pad.left + innerWidth / 2}
              y={height - 6}
              textAnchor="middle"
              className="chart-line__axis"
              fontSize="10"
            >
              {xLabel}
            </text>
          </svg>
        </div>
      )}
    </article>
  );
}

function GroupedBarChart({
  title,
  rows,
  series,
  xLabel,
  yLabel
}: {
  title: string;
  rows: Array<{ label: string; values: number[] }>;
  series: Array<{ name: string; color: string }>;
  xLabel: string;
  yLabel: string;
}) {
  const visible = rows.slice(0, 6);
  const width = 640;
  const height = 236;
  const pad = { top: 22, right: 12, bottom: 52, left: 56 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const yMax = Math.max(
    4,
    Math.ceil(Math.max(...visible.flatMap((row) => row.values), 1) / 4) * 4
  );
  const groupWidth = visible.length ? innerWidth / visible.length : innerWidth;
  const barWidth = Math.max(6, (groupWidth - 16) / Math.max(series.length, 1));

  return (
    <article className="reports-chart reports-chart--wide">
      <h3>{title}</h3>
      {visible.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <>
          <ul className="chart-legend">
            {series.map((item) => (
              <li key={item.name}>
                <i style={{ background: item.color }} />
                {item.name}
              </li>
            ))}
          </ul>
          <div className="chart-line">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. Y: ${yLabel}. X: ${xLabel}.`}>
              {[0, 0.5, 1].map((fraction) => {
                const y = pad.top + innerHeight - fraction * innerHeight;
                const tick = fraction * yMax;
                return (
                  <g key={fraction}>
                    <line
                      x1={pad.left}
                      y1={y}
                      x2={width - pad.right}
                      y2={y}
                      className="chart-line__grid"
                    />
                    <text x={pad.left - 6} y={y + 3} textAnchor="end" className="chart-line__tick" fontSize="9">
                      {tick}
                    </text>
                  </g>
                );
              })}
              <text
                x={13}
                y={pad.top + innerHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90 13 ${pad.top + innerHeight / 2})`}
                className="chart-line__axis"
                fontSize="10"
              >
                {yLabel}
              </text>
              {visible.map((row, groupIndex) => {
                const groupX = pad.left + groupIndex * groupWidth;
                return (
                  <g key={row.label}>
                    {row.values.map((value, seriesIndex) => {
                      const barHeight = (value / yMax) * innerHeight;
                      const x = groupX + 8 + seriesIndex * barWidth;
                      const y = pad.top + innerHeight - barHeight;
                      return (
                        <g key={`${row.label}-${series[seriesIndex]?.name ?? seriesIndex}`}>
                          <rect
                            x={x}
                            y={y}
                            width={Math.max(4, barWidth - 3)}
                            height={Math.max(0, barHeight)}
                            rx="3"
                            fill={series[seriesIndex]?.color ?? "#0b8a86"}
                          />
                          <text
                            x={x + Math.max(4, barWidth - 3) / 2}
                            y={y - 4}
                            textAnchor="middle"
                            className="chart-line__value"
                            fontSize="7"
                          >
                            {value}
                          </text>
                        </g>
                      );
                    })}
                    <text
                      x={groupX + groupWidth / 2}
                      y={height - 22}
                      textAnchor="middle"
                      className="chart-line__tick"
                      fontSize="8"
                    >
                      {axisLabel(row.label)}
                    </text>
                  </g>
                );
              })}
              <text
                x={pad.left + innerWidth / 2}
                y={height - 6}
                textAnchor="middle"
                className="chart-line__axis"
                fontSize="10"
              >
                {xLabel}
              </text>
            </svg>
          </div>
        </>
      )}
    </article>
  );
}

function DonutChart({ title, rows, unit }: { title: string; rows: ReportPair[]; unit: string }) {
  const visible = rows.filter((row) => row.count > 0).slice(0, 6);
  const total = visible.reduce((sum, row) => sum + row.count, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <article className="reports-chart">
      <h3>{title}</h3>
      {visible.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <div className="chart-donut">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e8eef0" strokeWidth="16" />
            {visible.map((row, index) => {
              const length = total ? (row.count / total) * circumference : 0;
              const circle = (
                <circle
                  key={row.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={chartColors[index % chartColors.length]}
                  strokeWidth="16"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 60 60)"
                />
              );
              offset += length;
              return circle;
            })}
            <text x="60" y="56" textAnchor="middle" className="chart-donut__total">
              {total}
            </text>
            <text x="60" y="72" textAnchor="middle" className="chart-donut__caption">
              {unit}
            </text>
          </svg>
          <ul>
            {visible.map((row, index) => (
              <li key={`${title}-${row.label}`}>
                <i style={{ background: chartColors[index % chartColors.length] }} />
                <span>{readableLabel(row.label)}</span>
                <strong>
                  {row.count}
                  <small>{total ? Math.round((row.count / total) * 100) : 0}%</small>
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function ColumnChart({
  title,
  rows,
  xLabel,
  yLabel
}: {
  title: string;
  rows: ReportPair[];
  xLabel: string;
  yLabel: string;
}) {
  const visible = rows.slice(-12);
  const width = 440;
  const height = 228;
  const pad = { top: 22, right: 12, bottom: 52, left: 56 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const yMax = Math.max(4, Math.ceil(Math.max(...visible.map((row) => row.count), 1) / 4) * 4);
  const yTicks = [0, 0.5, 1].map((fraction) => fraction * yMax);
  const barSlot = visible.length ? innerWidth / visible.length : innerWidth;
  const barWidth = Math.max(8, barSlot * 0.55);

  return (
    <article className="reports-chart">
      <h3>{title}</h3>
      {visible.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <div className="chart-line">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. Y: ${yLabel}. X: ${xLabel}.`}>
            {yTicks.map((tick) => {
              const y = pad.top + innerHeight - (tick / yMax) * innerHeight;
              return (
                <g key={tick}>
                  <line
                    x1={pad.left}
                    y1={y}
                    x2={width - pad.right}
                    y2={y}
                    className="chart-line__grid"
                  />
                  <text x={pad.left - 6} y={y + 3} textAnchor="end" className="chart-line__tick" fontSize="9">
                    {tick}
                  </text>
                </g>
              );
            })}
            <text
              x={13}
              y={pad.top + innerHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90 13 ${pad.top + innerHeight / 2})`}
              className="chart-line__axis"
              fontSize="10"
            >
              {yLabel}
            </text>
            {visible.map((row, index) => {
              const barHeight = (row.count / yMax) * innerHeight;
              const x = pad.left + index * barSlot + (barSlot - barWidth) / 2;
              const y = pad.top + innerHeight - barHeight;
              return (
                <g key={`${title}-${row.label}`}>
                  <rect x={x} y={y} width={barWidth} height={Math.max(0, barHeight)} rx="3" className="chart-column__bar" />
                  <text
                    x={x + barWidth / 2}
                    y={y - 5}
                    textAnchor="middle"
                    className="chart-line__value"
                    fontSize="8"
                  >
                    {row.count}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y={height - 22}
                    textAnchor="middle"
                    className="chart-line__tick"
                    fontSize="8"
                  >
                    {axisLabel(row.label)}
                  </text>
                </g>
              );
            })}
            <text
              x={pad.left + innerWidth / 2}
              y={height - 6}
              textAnchor="middle"
              className="chart-line__axis"
              fontSize="10"
            >
              {xLabel}
            </text>
          </svg>
        </div>
      )}
    </article>
  );
}

function BarList({
  title,
  rows
}: {
  title: string;
  rows: ReportPair[];
}) {
  const visible = rows.filter((row) => row.count > 0).slice(0, 8);
  const max = Math.max(...visible.map((row) => row.count), 1);

  return (
    <article className="reports-chart">
      <h3>{title}</h3>
      {visible.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <ul className="chart-bars">
          {visible.map((row) => (
            <li key={`${title}-${row.label}`}>
              <div>
                <span>{readableLabel(row.label)}</span>
                <strong>{row.count}</strong>
              </div>
              <i style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
