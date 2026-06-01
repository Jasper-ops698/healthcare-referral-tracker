/**
 * CollectorProfile v3 — Editable personal info, read-only work info
 */

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  Shield, User, MapPin, FileText, Globe, HeartPulse,
  Contact, Save, Pencil, X, Loader2, Info,
} from 'lucide-react';
import { format } from 'date-fns';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['male', 'female', 'other', 'prefer-not-to-say'] as const;
const LANGUAGES_LIST = ['English', 'Swahili', 'Kikuyu', 'Luo', 'Kalenjin', 'Kamba', 'Meru', 'Somali', 'Turkana', 'Arabic'];

export default function CollectorProfile() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    dateOfBirth: user?.dateOfBirth ? format(new Date(user.dateOfBirth), 'yyyy-MM-dd') : '',
    gender: (user?.gender || 'prefer-not-to-say') as 'male' | 'female' | 'other' | 'prefer-not-to-say',
    nationalId: user?.nationalId || '',
    homeCounty: user?.homeCounty || '',
    bloodGroup: user?.bloodGroup || '',
    physicalAddress: user?.physicalAddress || '',
    bio: user?.bio || '',
    languages: user?.languages || [] as string[],
    emergencyName: user?.emergencyContact?.name || '',
    emergencyRelationship: user?.emergencyContact?.relationship || '',
    emergencyPhone: user?.emergencyContact?.phone || '',
    nokName: user?.nextOfKin?.name || '',
    nokRelationship: user?.nextOfKin?.relationship || '',
    nokPhone: user?.nextOfKin?.phone || '',
  }));

  const fullName = `${form.firstName} ${form.lastName}`.trim() || 'Unknown';

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleLang = (lang: string) => {
    setForm(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;

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
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // eslint-disable-next-line no-console
        console.log('Profile updated successfully');
        await refreshUser();
        setEditing(false);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to update' }));
        // eslint-disable-next-line no-console
        console.error('Update failed:', err.error);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Network error saving profile:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      dateOfBirth: user?.dateOfBirth ? format(new Date(user.dateOfBirth), 'yyyy-MM-dd') : '',
      gender: (user?.gender || 'prefer-not-to-say') as 'male' | 'female' | 'other' | 'prefer-not-to-say',
      nationalId: user?.nationalId || '',
      homeCounty: user?.homeCounty || '',
      bloodGroup: user?.bloodGroup || '',
      physicalAddress: user?.physicalAddress || '',
      bio: user?.bio || '',
      languages: user?.languages || [] as string[],
      emergencyName: user?.emergencyContact?.name || '',
      emergencyRelationship: user?.emergencyContact?.relationship || '',
      emergencyPhone: user?.emergencyContact?.phone || '',
      nokName: user?.nextOfKin?.name || '',
      nokRelationship: user?.nextOfKin?.relationship || '',
      nokPhone: user?.nextOfKin?.phone || '',
    });
    setEditing(false);
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Please log in to view your profile</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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
            <Pencil className="w-4 h-4" /> {t('profile.edit')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" /> {t('profile.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4" /> {t('profile.save')}</>}
            </button>
          </div>
        )}
      </div>

      {/* Avatar + Name Header Card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="relative h-28 bg-teal-600">
          <div className="absolute -bottom-10 left-6">
            <div className="w-20 h-20 rounded-full border-4 border-background bg-background overflow-hidden">
              <img
                src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.firstName}`}
                alt={fullName}
                className="w-full h-full"
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%23ccc%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2218%22>' + (user.firstName?.[0] || '?') + '</text></svg>'; }}
              />
            </div>
          </div>
        </div>
        <div className="pt-12 pb-4 px-6">
          <h2 className="text-lg font-bold">{fullName}</h2>
          <p className="text-sm text-muted-foreground">{user.role === 'admin' ? 'Administrator' : 'Collector'}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              <Shield className="w-3 h-3" /> {user.status === 'active' ? 'Active' : 'Inactive'}
            </span>
            <span className="text-xs text-muted-foreground">
              Member since {user.createdAt ? format(new Date(user.createdAt), 'MMMM yyyy') : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* ── WORK INFORMATION (Read-Only) ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wide">{t('profile.workInfo')}</h3>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            <Info className="w-3 h-3" /> {t('profile.adminManaged')}
          </span>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <ReadOnly label={t('profile.role')} value={user.role === 'admin' ? t('profile.administrator') : t('profile.collector')} />
          <ReadOnly label={t('profile.assignedFacility')} value={user.assignedFacility || t('profile.notAssigned')} />
          <ReadOnly label={t('profile.station')} value={user.stationName || t('profile.notAssigned')} />
          <ReadOnly label={t('profile.stationType')} value={user.stationType || '—'} />
          <ReadOnly label={t('profile.region')} value={user.region || '—'} />
          <ReadOnly label={t('profile.lastLogin')} value={user.lastLogin ? format(new Date(user.lastLogin), 'MMM d, yyyy h:mm a') : t('profile.never')} />
        </div>
      </div>

      {/* ── PERSONAL INFORMATION ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold uppercase tracking-wide">{t('profile.personalInfo')}</h3>
          </div>
          {editing && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">Editable</span>}
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('profile.firstName')} value={form.firstName} editing={editing} onChange={v => updateField('firstName', v)} required />
          <Field label={t('profile.lastName')} value={form.lastName} editing={editing} onChange={v => updateField('lastName', v)} required />
          <Field label="Email" type="email" value={form.email} editing={editing} onChange={v => updateField('email', v)} required />
          <Field label="Phone" type="tel" value={form.phone} editing={editing} onChange={v => updateField('phone', v)} required />
          <Field label="Date of Birth" type="date" value={form.dateOfBirth} editing={editing} onChange={v => updateField('dateOfBirth', v)} />

          {/* Gender */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Gender</label>
            {editing ? (
              <div className="flex gap-2 flex-wrap">
                {GENDERS.map(g => (
                  <button key={g} type="button" onClick={() => updateField('gender', g)}
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

          <Field label={t('profile.nationalId')} value={form.nationalId} editing={editing} onChange={v => updateField('nationalId', v)} />
          <Field label={t('profile.homeCounty')} value={form.homeCounty} editing={editing} onChange={v => updateField('homeCounty', v)} />

          {/* Blood Group */}
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Blood Group</label>
            {editing ? (
              <div className="flex gap-2 flex-wrap">
                {BLOOD_GROUPS.map(bg => (
                  <button key={bg} type="button" onClick={() => updateField('bloodGroup', bg)}
                    className={`w-10 h-10 rounded-lg text-xs font-bold border transition-all ${
                      form.bloodGroup === bg ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'
                    }`}>
                    {bg}
                  </button>
                ))}
                <button type="button" onClick={() => updateField('bloodGroup', '')}
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
                <button key={lang} type="button" onClick={() => toggleLang(lang)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.languages.includes(lang)
                      ? 'border-sky-300 bg-sky-50 text-sky-700'
                      : 'border-border hover:bg-muted'
                  }`}>
                  {form.languages.includes(lang) ? '✓ ' : ''}{lang}
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
              onChange={e => updateField('physicalAddress', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder={t('profile.addressPlaceholder')}
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
              onChange={e => updateField('bio', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder={t('profile.bioPlaceholder')}
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
          <Field label={t('profile.fullName')} value={form.emergencyName} editing={editing} onChange={v => updateField('emergencyName', v)} />
          <Field label={t('profile.relationship')} value={form.emergencyRelationship} editing={editing} onChange={v => updateField('emergencyRelationship', v)} />
          <Field label="Phone" type="tel" value={form.emergencyPhone} editing={editing} onChange={v => updateField('emergencyPhone', v)} />
        </div>
      </div>

      {/* ── NEXT OF KIN ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Contact className="w-4 h-4 text-teal-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Next of Kin</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('profile.fullName')} value={form.nokName} editing={editing} onChange={v => updateField('nokName', v)} />
          <Field label={t('profile.relationship')} value={form.nokRelationship} editing={editing} onChange={v => updateField('nokRelationship', v)} />
          <Field label="Phone" type="tel" value={form.nokPhone} editing={editing} onChange={v => updateField('nokPhone', v)} />
        </div>
      </div>

      {/* Sticky save/cancel when editing */}
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1 block uppercase tracking-wide">{label}</label>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function Field({ label, value, editing, onChange, type = 'text', required }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          required={required}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      ) : (
        <p className="text-sm min-h-[28px]">{value || <span className="text-muted-foreground">Not provided</span>}</p>
      )}
    </div>
  );
}
