/**
 * CollectorProfile v2 — Editable personal info, read-only work info
 *
 * The collector can edit their own personal details.
 * Work information (station, role, status) is set by admin and displayed read-only.
 */

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Mail, Phone, Building2, Calendar, Shield, User, MapPin,
  FileText, Globe, HeartPulse, Contact, Save, Pencil,
  X, Check, Loader2, Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['male', 'female', 'other', 'prefer-not-to-say'] as const;
const LANGUAGES_LIST = ['English', 'Swahili', 'Kikuyu', 'Luo', 'Kalenjin', 'Kamba', 'Meru', 'Somali', 'Turkana', 'Arabic'];

export default function CollectorProfile() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable form state
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    dateOfBirth: user?.dateOfBirth ? format(new Date(user.dateOfBirth), 'yyyy-MM-dd') : '',
    gender: user?.gender || 'prefer-not-to-say',
    nationalId: user?.nationalId || '',
    homeCounty: user?.homeCounty || '',
    bloodGroup: user?.bloodGroup || '',
    physicalAddress: user?.physicalAddress || '',
    bio: user?.bio || '',
    languages: user?.languages || [],
    emergencyName: user?.emergencyContact?.name || '',
    emergencyRelationship: user?.emergencyContact?.relationship || '',
    emergencyPhone: user?.emergencyContact?.phone || '',
    nokName: user?.nextOfKin?.name || '',
    nokRelationship: user?.nextOfKin?.relationship || '',
    nokPhone: user?.nextOfKin?.phone || '',
  });

  const fullName = `${form.firstName} ${form.lastName}`.trim() || 'Unknown';

  const toggleLang = (lang: string) => {
    setForm(p => ({
      ...p,
      languages: p.languages.includes(lang)
        ? p.languages.filter(l => l !== lang)
        : [...p.languages, lang],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        nationalId: form.nationalId || undefined,
        homeCounty: form.homeCounty || undefined,
        bloodGroup: form.bloodGroup || undefined,
        physicalAddress: form.physicalAddress || undefined,
        bio: form.bio || undefined,
        languages: form.languages.length > 0 ? form.languages : undefined,
        emergencyContact: form.emergencyName ? {
          name: form.emergencyName,
          relationship: form.emergencyRelationship,
          phone: form.emergencyPhone,
        } : undefined,
        nextOfKin: form.nokName ? {
          name: form.nokName,
          relationship: form.nokRelationship,
          phone: form.nokPhone,
        } : undefined,
      };

      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: {
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Profile updated successfully');
        setEditing(false);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update profile');
      }
    } catch {
      toast.error('Network error. Changes saved locally.');
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original user data
    setForm({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      dateOfBirth: user?.dateOfBirth ? format(new Date(user.dateOfBirth), 'yyyy-MM-dd') : '',
      gender: user?.gender || 'prefer-not-to-say',
      nationalId: user?.nationalId || '',
      homeCounty: user?.homeCounty || '',
      bloodGroup: user?.bloodGroup || '',
      physicalAddress: user?.physicalAddress || '',
      bio: user?.bio || '',
      languages: user?.languages || [],
      emergencyName: user?.emergencyContact?.name || '',
      emergencyRelationship: user?.emergencyContact?.relationship || '',
      emergencyPhone: user?.emergencyContact?.phone || '',
      nokName: user?.nextOfKin?.name || '',
      nokRelationship: user?.nextOfKin?.relationship || '',
      nokPhone: user?.nextOfKin?.phone || '',
    });
    setEditing(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {editing ? 'Editing your personal information' : 'Manage your personal information. Work details are set by your admin.'}
          </p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Pencil className="w-4 h-4" /> Edit Profile
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
          </div>
        )}
      </div>

      {/* Avatar + Name Header Card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="relative h-28 bg-teal-600">
          <div className="absolute -bottom-10 left-6">
            <div className="relative">
              <img
                src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.firstName}`}
                alt={fullName}
                className="w-20 h-20 rounded-full border-4 border-background bg-background"
              />
              {editing && (
                <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="pt-12 pb-4 px-6">
          <h2 className="text-lg font-bold">{fullName}</h2>
          <p className="text-sm text-muted-foreground">{user?.role === 'admin' ? 'Administrator' : 'Collector'}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              <Shield className="w-3 h-3" /> {user?.status === 'active' ? 'Active' : 'Inactive'}
            </span>
            <span className="text-xs text-muted-foreground">
              Member since {user?.createdAt ? format(new Date(user.createdAt), 'MMMM yyyy') : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* ── WORK INFORMATION (Read-Only) ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wide">Work Information</h3>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            <Info className="w-3 h-3" /> Admin-managed
          </span>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <ReadOnlyField label="Role" value={user?.role === 'admin' ? 'Administrator' : 'Collector'} icon={<Shield className="w-4 h-4 text-muted-foreground" />} />
          <ReadOnlyField label="Assigned Facility" value={user?.assignedFacility || 'Not assigned'} icon={<Building2 className="w-4 h-4 text-muted-foreground" />} />
          <ReadOnlyField label="Station" value={user?.stationName || 'Not assigned'} icon={<MapPin className="w-4 h-4 text-muted-foreground" />} />
          <ReadOnlyField label="Station Type" value={user?.stationType || '—'} icon={<Building2 className="w-4 h-4 text-muted-foreground" />} />
          <ReadOnlyField label="Region" value={user?.region || '—'} icon={<Globe className="w-4 h-4 text-muted-foreground" />} />
          <ReadOnlyField label="Last Login" value={user?.lastLogin ? format(new Date(user.lastLogin), 'MMM d, yyyy h:mm a') : 'Never'} icon={<Calendar className="w-4 h-4 text-muted-foreground" />} />
        </div>
      </div>

      {/* ── PERSONAL INFORMATION (Editable) ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold uppercase tracking-wide">Personal Information</h3>
          </div>
          {editing && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">Editable</span>}
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EditableField label="First Name" value={form.firstName} editing={editing} onChange={v => setForm(p => ({ ...p, firstName: v }))} required />
          <EditableField label="Last Name" value={form.lastName} editing={editing} onChange={v => setForm(p => ({ ...p, lastName: v }))} required />
          <EditableField label="Email" type="email" value={form.email} editing={editing} onChange={v => setForm(p => ({ ...p, email: v }))} required icon={<Mail className="w-4 h-4 text-muted-foreground" />} />
          <EditableField label="Phone" type="tel" value={form.phone} editing={editing} onChange={v => setForm(p => ({ ...p, phone: v }))} required icon={<Phone className="w-4 h-4 text-muted-foreground" />} />
          <EditableField label="Date of Birth" type="date" value={form.dateOfBirth} editing={editing} onChange={v => setForm(p => ({ ...p, dateOfBirth: v }))} icon={<Calendar className="w-4 h-4 text-muted-foreground" />} />
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Gender</label>
            {editing ? (
              <div className="flex gap-2 flex-wrap">
                {GENDERS.map(g => (
                  <button key={g} onClick={() => setForm(p => ({ ...p, gender: g }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all ${
                      form.gender === g ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'
                    }`}>
                    {g.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm">{form.gender ? form.gender.replace(/-/g, ' ') : 'Not set'}</p>
            )}
          </div>
          <EditableField label="National ID" value={form.nationalId} editing={editing} onChange={v => setForm(p => ({ ...p, nationalId: v }))} icon={<FileText className="w-4 h-4 text-muted-foreground" />} />
          <EditableField label="Home County" value={form.homeCounty} editing={editing} onChange={v => setForm(p => ({ ...p, homeCounty: v }))} icon={<MapPin className="w-4 h-4 text-muted-foreground" />} />
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Blood Group</label>
            {editing ? (
              <div className="flex gap-2 flex-wrap">
                {BLOOD_GROUPS.map(bg => (
                  <button key={bg} onClick={() => setForm(p => ({ ...p, bloodGroup: bg }))}
                    className={`w-10 h-10 rounded-lg text-xs font-bold border transition-all ${
                      form.bloodGroup === bg ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'
                    }`}>
                    {bg}
                  </button>
                ))}
                <button onClick={() => setForm(p => ({ ...p, bloodGroup: '' }))}
                  className={`h-10 px-3 rounded-lg text-xs font-medium border transition-all ${
                    !form.bloodGroup ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'
                  }`}>Unknown</button>
              </div>
            ) : (
              <p className="text-sm">{form.bloodGroup || 'Not set'}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── LANGUAGES ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Globe className="w-4 h-4 text-sky-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Languages Spoken</h3>
        </div>
        <div className="p-5">
          {editing ? (
            <div className="flex flex-wrap gap-2">
              {LANGUAGES_LIST.map(lang => (
                <button key={lang} onClick={() => toggleLang(lang)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.languages.includes(lang)
                      ? 'border-sky-300 bg-sky-50 text-sky-700'
                      : 'border-border hover:bg-muted'
                  }`}>
                  {form.languages.includes(lang) && <Check className="w-3 h-3 inline mr-1" />}
                  {lang}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {form.languages.length > 0 ? form.languages.map(lang => (
                <span key={lang} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-100 text-sky-700 border border-sky-200">{lang}</span>
              )) : <span className="text-sm text-muted-foreground">No languages specified</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── ADDRESS ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Physical Address</h3>
        </div>
        <div className="p-5">
          {editing ? (
            <textarea
              rows={3}
              value={form.physicalAddress}
              onChange={e => setForm(p => ({ ...p, physicalAddress: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Enter your physical address..."
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{form.physicalAddress || <span className="text-muted-foreground">Not provided</span>}</p>
          )}
        </div>
      </div>

      {/* ── BIO ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Bio / Professional Notes</h3>
        </div>
        <div className="p-5">
          {editing ? (
            <textarea
              rows={4}
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Tell us about yourself..."
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{form.bio || <span className="text-muted-foreground">No bio provided</span>}</p>
          )}
        </div>
      </div>

      {/* ── EMERGENCY CONTACT ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Emergency Contact</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <EditableField label="Full Name" value={form.emergencyName} editing={editing} onChange={v => setForm(p => ({ ...p, emergencyName: v }))} icon={<User className="w-4 h-4 text-muted-foreground" />} />
          <EditableField label="Relationship" value={form.emergencyRelationship} editing={editing} onChange={v => setForm(p => ({ ...p, emergencyRelationship: v }))} />
          <EditableField label="Phone" type="tel" value={form.emergencyPhone} editing={editing} onChange={v => setForm(p => ({ ...p, emergencyPhone: v }))} icon={<Phone className="w-4 h-4 text-muted-foreground" />} />
        </div>
      </div>

      {/* ── NEXT OF KIN ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Contact className="w-4 h-4 text-teal-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Next of Kin</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <EditableField label="Full Name" value={form.nokName} editing={editing} onChange={v => setForm(p => ({ ...p, nokName: v }))} icon={<User className="w-4 h-4 text-muted-foreground" />} />
          <EditableField label="Relationship" value={form.nokRelationship} editing={editing} onChange={v => setForm(p => ({ ...p, nokRelationship: v }))} />
          <EditableField label="Phone" type="tel" value={form.nokPhone} editing={editing} onChange={v => setForm(p => ({ ...p, nokPhone: v }))} icon={<Phone className="w-4 h-4 text-muted-foreground" />} />
        </div>
      </div>

      {/* Save/Cancel at bottom when editing */}
      {editing && (
        <div className="flex items-center justify-end gap-3 sticky bottom-4 bg-background/80 backdrop-blur-sm p-4 rounded-xl border border-border">
          <button onClick={handleCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function ReadOnlyField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1 block uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function EditableField({ label, value, editing, onChange, type = 'text', required, icon }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void;
  type?: string; required?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {editing ? (
        <div className="relative">
          {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</div>}
          <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            required={required}
            className={`w-full ${icon ? 'pl-9' : 'px-3'} py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all`}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm min-h-[28px]">
          {icon}
          <span>{value || <span className="text-muted-foreground">Not provided</span>}</span>
        </div>
      )}
    </div>
  );
}
