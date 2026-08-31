import { useCallback, useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Check, LoaderCircle, Pencil, RefreshCw, Save, ShieldCheck, UserRound, X } from "lucide-react";
import {
  getPatientProfile,
  updatePatientProfile,
  type PatientProfile,
  type UpdatePatientProfileInput
} from "../../api/patientPortalApi";
import "./PatientProfilePage.css";

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    return (error.response?.data as { error?: { message?: string } })?.error?.message
      ?? "Your profile could not be loaded.";
  }
  return "Your profile could not be loaded.";
}

function toForm(profile: PatientProfile): UpdatePatientProfileInput {
  return {
    phone: profile.phone ?? "",
    occupation: profile.occupation ?? "",
    maritalStatus: profile.maritalStatus,
    smokingStatus: profile.smokingStatus,
    addressLine1: profile.addressLine1 ?? "",
    addressLine2: profile.addressLine2 ?? "",
    city: profile.city ?? "",
    postalCode: profile.postalCode ?? "",
    countryCode: profile.countryCode
  };
}

function readable(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}

export function PatientProfilePage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [form, setForm] = useState<UpdatePatientProfileInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProfile = await getPatientProfile();
      setProfile(nextProfile);
      setForm(toForm(nextProfile));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getPatientProfile()
      .then((nextProfile) => {
        if (!cancelled) {
          setProfile(nextProfile);
          setForm(toForm(nextProfile));
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function cancelEdit() {
    if (!profile) return;
    setForm(toForm(profile));
    setEditing(false);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updatePatientProfile(form);
      setProfile(updated);
      setForm(toForm(updated));
      setEditing(false);
      setNotice("Your profile was updated successfully.");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="patient-profile-state"><LoaderCircle className="spin" />Loading your profile…</div>;
  }

  if (!profile || !form) {
    return <div className="patient-profile-state patient-profile-state--error"><AlertCircle/><span>{error ?? "Profile information is unavailable."}</span><button type="button" onClick={() => void load()}><RefreshCw size={16}/>Try again</button></div>;
  }

  return <div className="patient-profile-page">
    <section className="patient-profile-hero">
      <div className="patient-profile-avatar"><UserRound/></div>
      <div><span>PATIENT PROFILE</span><h2>{profile.firstName} {profile.lastName}</h2><p>Review your identity details and keep your contact information current.</p></div>
      <div className="patient-profile-number"><small>Patient number</small><strong>{profile.patientNumber}</strong></div>
    </section>

    {notice && <div className="patient-profile-notice patient-profile-notice--success"><Check size={17}/><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Close notification"><X size={16}/></button></div>}
    {error && <div className="patient-profile-notice patient-profile-notice--error"><AlertCircle size={17}/><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Close error"><X size={16}/></button></div>}

    <form className="patient-profile-grid" onSubmit={save}>
      <section className="patient-profile-panel">
        <header><div><span>VERIFIED INFORMATION</span><h3>Identity details</h3></div><ShieldCheck/></header>
        <p className="patient-profile-help">These fields are protected. Contact an administrator if a correction is required.</p>
        <div className="patient-profile-fields">
          <ReadOnly label="First name" value={profile.firstName}/>
          <ReadOnly label="Last name" value={profile.lastName}/>
          <ReadOnly label="Date of birth" value={profile.dateOfBirth}/>
          <ReadOnly label="Sex" value={readable(profile.sex)}/>
          <ReadOnly label="Blood type" value={profile.bloodType}/>
          <ReadOnly label="Login email" value={profile.email}/>
        </div>
      </section>

      <section className="patient-profile-panel">
        <header><div><span>PERSONAL INFORMATION</span><h3>Contact and profile details</h3></div>{!editing && <button className="patient-profile-edit" type="button" onClick={() => { setEditing(true); setNotice(null); }}><Pencil size={16}/>Edit</button>}</header>
        <div className="patient-profile-fields">
          <Input label="Phone" value={form.phone} disabled={!editing} change={(phone) => setForm({...form, phone})}/>
          <Input label="Occupation" value={form.occupation} disabled={!editing} change={(occupation) => setForm({...form, occupation})}/>
          <Select label="Marital status" value={form.maritalStatus} disabled={!editing} options={["UNKNOWN","SINGLE","MARRIED","DIVORCED","WIDOWED","OTHER"]} change={(maritalStatus) => setForm({...form, maritalStatus: maritalStatus as UpdatePatientProfileInput["maritalStatus"]})}/>
          <Select label="Smoking status" value={form.smokingStatus} disabled={!editing} options={["UNKNOWN","NEVER","FORMER","CURRENT"]} change={(smokingStatus) => setForm({...form, smokingStatus: smokingStatus as UpdatePatientProfileInput["smokingStatus"]})}/>
          <Input label="Address line 1" value={form.addressLine1} disabled={!editing} change={(addressLine1) => setForm({...form, addressLine1})}/>
          <Input label="Address line 2" value={form.addressLine2} disabled={!editing} change={(addressLine2) => setForm({...form, addressLine2})}/>
          <Input label="City" value={form.city} disabled={!editing} change={(city) => setForm({...form, city})}/>
          <Input label="Postal code" value={form.postalCode} disabled={!editing} change={(postalCode) => setForm({...form, postalCode})}/>
          <Input label="Country code" value={form.countryCode} maxLength={2} required disabled={!editing} change={(countryCode) => setForm({...form, countryCode: countryCode.toUpperCase()})}/>
        </div>
        {editing && <footer><button type="button" onClick={cancelEdit} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16}/> : <Save size={16}/>}Save changes</button></footer>}
      </section>
    </form>
  </div>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <label>{label}<input value={value} readOnly aria-readonly="true"/></label>;
}

function Input({ label, value, disabled, change, maxLength, required = false }: { label:string; value:string; disabled:boolean; change:(value:string)=>void; maxLength?:number; required?:boolean }) {
  return <label>{label}<input value={value} disabled={disabled} maxLength={maxLength} required={required} onChange={(event) => change(event.target.value)}/></label>;
}

function Select({ label, value, disabled, options, change }: { label:string; value:string; disabled:boolean; options:string[]; change:(value:string)=>void }) {
  return <label>{label}<select value={value} disabled={disabled} onChange={(event) => change(event.target.value)}>{options.map((option) => <option value={option} key={option}>{readable(option)}</option>)}</select></label>;
}
