import { useState, useRef, type ChangeEvent } from 'react';
import { useI18n } from '@/i18n/useI18n';
import type { User } from '@/types';
import { isPrimaryAdmin } from '@/lib/config';
import {
  Camera,
  X,
  Save,
  Calendar,
  Droplets,
  MapPin,
  Contact,
  HeartPulse,
  Globe,
  FileText,
  UserCircle,
  Crown,
  Shield,
  UserCheck,
  UserX,
  Phone,
  Loader2,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

/* ──────────────────────────── Kenya Counties ──────────────────────────── */
const KENYA_COUNTIES = [
  'Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay',
  'Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii',
  'Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera',
  'Marsabit','Meru','Migori','Mombasa','Murang\'a','Nairobi','Nakuru','Nandi',
  'Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta',
  'Tana River','Tharaka-Nithi','Trans Nzoia','Turkana','Uasin Gishu','Vihiga',
  'Wajir','West Pokot'
];

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const LANGUAGES = ['English','Swahili','Kikuyu','Luo','Kalenjin','Kamba','Luhya','Meru','Embu','Maa','Somali','Turkana','Kisii','Taita','Kuria','Suba','Pokot','Marakwet','Taveta','Orma','Borana','Rendille','Samburu'];
const RELATIONSHIPS = ['Spouse','Parent','Sibling','Child','Grandparent','Aunt/Uncle','Nephew/Niece','Cousin','Friend','Colleague','Neighbor','Other'];

/* ═══════════════════════════ Profile Modal Props ═══════════════════════════ */

export interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onSave: (data: Partial<User>) => void;
  /** If false, all fields are shown read-only */
  canEdit?: boolean;
}

/* ═══════════════════════════ Profile Modal ═══════════════════════════ */

export default function ProfileModal({ user, onClose, onSave, canEdit = true }: ProfileModalProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<User>>({
    phone: user.phone || '',
    avatar: user.avatar || '',
    dateOfBirth: user.dateOfBirth || '',
    gender: user.gender || undefined,
    nationalId: user.nationalId || '',
    bloodGroup: user.bloodGroup || '',
    languages: user.languages?.length ? [...user.languages] : [],
    homeCounty: user.homeCounty || '',
    physicalAddress: user.physicalAddress || '',
    emergencyContact: user.emergencyContact || { name: '', relationship: '', phone: '' },
    nextOfKin: user.nextOfKin || { name: '', relationship: '', phone: '' },
    bio: user.bio || '',
  });

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (group: 'emergencyContact' | 'nextOfKin', field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [group]: { ...(prev[group] || { name: '', relationship: '', phone: '' }), [field]: value },
    }));
  };

  const toggleLanguage = (lang: string) => {
    if (!canEdit) return;
    setForm((prev) => {
      const current = prev.languages || [];
      const updated = current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang];
      return { ...prev, languages: updated };
    });
  };

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      handleChange('avatar', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(form);
    setSaving(false);
  };

  const fullName = `${user.firstName} ${user.lastName}`;

  /* ── Shared field styles ── */
  const inputBase = "w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm";
  const selectBase = "w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm bg-white";
  const textareaBase = "w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm resize-none";
  const readOnlyBase = "w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700 flex items-center min-h-[38px]";

  /* ── Read-only display helpers ── */
  const ReadOnlyValue = ({ value, placeholder = '—', icon }: { value?: string | null; placeholder?: string; icon?: React.ReactNode }) => (
    <div className={readOnlyBase}>
      {icon && <span className="mr-2 text-gray-400">{icon}</span>}
      <span>{value || placeholder}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
              {canEdit ? <UserCircle className="w-5 h-5 text-sky-600" /> : <Eye className="w-5 h-5 text-sky-600" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {canEdit ? 'User Profile' : 'View Profile'}
              </h2>
              <p className="text-xs text-gray-500">
                {canEdit ? 'View and edit profile details' : 'Read-only profile view'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-8">
          {/* Avatar & Name Section */}
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative group">
              <img
                src={form.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.firstName}${user.lastName}`}
                alt={fullName}
                className="w-24 h-24 rounded-2xl bg-gray-100 object-cover ring-4 ring-white shadow-lg"
              />
              {canEdit && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-sky-500 text-white shadow-lg hover:bg-sky-600 transition-all hover:scale-110 active:scale-95"
                    title={t('profile.uploadPhoto')}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </>
              )}
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 justify-center sm:justify-start">
                {fullName}
                {isPrimaryAdmin(user.email) && <Crown className="w-4 h-4 text-amber-500" />}
              </h3>
              <p className="text-sm text-gray-500">{user.email}</p>
              <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                  {user.role === 'admin' ? 'Administrator' : 'Collector'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {user.status === 'active' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                  {user.status === 'active' ? 'Active' : 'Inactive'}
                </span>
                {!canEdit && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-100">
                    <Eye className="w-3 h-3" />
                    Read Only
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Personal Information ── */}
          <Section title={t('profile.personalInfo')} icon={<UserCircle className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Phone Number">
                {canEdit ? (
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={form.phone || ''}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="+254 7XX XXX XXX"
                      className={inputBase}
                    />
                  </div>
                ) : (
                  <ReadOnlyValue value={form.phone} icon={<Phone className="w-4 h-4" />} />
                )}
              </Field>

              <Field label="Date of Birth">
                {canEdit ? (
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={form.dateOfBirth || ''}
                      onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                      className={inputBase}
                    />
                  </div>
                ) : (
                  <ReadOnlyValue value={form.dateOfBirth ? format(new Date(form.dateOfBirth), 'MMMM d, yyyy') : undefined} icon={<Calendar className="w-4 h-4" />} />
                )}
              </Field>

              <Field label="Gender">
                {canEdit ? (
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={form.gender || ''}
                      onChange={(e) => handleChange('gender', e.target.value)}
                      className={selectBase}
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  </div>
                ) : (
                  <ReadOnlyValue value={form.gender ? form.gender.charAt(0).toUpperCase() + form.gender.slice(1) : undefined} icon={<UserCircle className="w-4 h-4" />} />
                )}
              </Field>

              <Field label="Blood Group">
                {canEdit ? (
                  <div className="relative">
                    <Droplets className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={form.bloodGroup || ''}
                      onChange={(e) => handleChange('bloodGroup', e.target.value)}
                      className={selectBase}
                    >
                      <option value="">Select blood group</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <ReadOnlyValue value={form.bloodGroup} icon={<Droplets className="w-4 h-4" />} />
                )}
              </Field>

              <Field label="National ID / Passport">
                {canEdit ? (
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={form.nationalId || ''}
                      onChange={(e) => handleChange('nationalId', e.target.value)}
                      placeholder="e.g., 12345678"
                      className={inputBase}
                    />
                  </div>
                ) : (
                  <ReadOnlyValue value={form.nationalId} icon={<FileText className="w-4 h-4" />} />
                )}
              </Field>

              <Field label="Home County">
                {canEdit ? (
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={form.homeCounty || ''}
                      onChange={(e) => handleChange('homeCounty', e.target.value)}
                      className={selectBase}
                    >
                      <option value="">Select county</option>
                      {KENYA_COUNTIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <ReadOnlyValue value={form.homeCounty} icon={<MapPin className="w-4 h-4" />} />
                )}
              </Field>
            </div>
          </Section>

          {/* ── Languages Spoken ── */}
          <Section title={t('profile.languages')} icon={<Globe className="w-4 h-4" />}>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const selected = (form.languages || []).includes(lang);
                return (
                  <button
                    key={lang}
                    onClick={() => toggleLanguage(lang)}
                    disabled={!canEdit}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selected
                        ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                        : canEdit
                        ? 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                        : 'bg-gray-50 text-gray-400 border-gray-100 cursor-default'
                    }`}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── Physical Address ── */}
          <Section title={t('profile.physicalAddress')} icon={<MapPin className="w-4 h-4" />}>
            {canEdit ? (
              <textarea
                value={form.physicalAddress || ''}
                onChange={(e) => handleChange('physicalAddress', e.target.value)}
                placeholder="e.g., Plot 123, Mombasa Road, Nairobi"
                rows={3}
                className={textareaBase}
              />
            ) : (
              <ReadOnlyValue value={form.physicalAddress || undefined} />
            )}
          </Section>

          {/* ── Emergency Contact ── */}
          <Section title={t('profile.emergencyContact')} icon={<HeartPulse className="w-4 h-4 text-rose-500" />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Full Name">
                {canEdit ? (
                  <input
                    type="text"
                    value={form.emergencyContact?.name || ''}
                    onChange={(e) => handleNestedChange('emergencyContact', 'name', e.target.value)}
                    placeholder="Contact name"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm"
                  />
                ) : (
                  <ReadOnlyValue value={form.emergencyContact?.name || undefined} />
                )}
              </Field>
              <Field label="Relationship">
                {canEdit ? (
                  <select
                    value={form.emergencyContact?.relationship || ''}
                    onChange={(e) => handleNestedChange('emergencyContact', 'relationship', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm bg-white"
                  >
                    <option value="">Select</option>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <ReadOnlyValue value={form.emergencyContact?.relationship || undefined} />
                )}
              </Field>
              <Field label="Phone">
                {canEdit ? (
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={form.emergencyContact?.phone || ''}
                      onChange={(e) => handleNestedChange('emergencyContact', 'phone', e.target.value)}
                      placeholder="+254..."
                      className={inputBase}
                    />
                  </div>
                ) : (
                  <ReadOnlyValue value={form.emergencyContact?.phone || undefined} icon={<Phone className="w-4 h-4" />} />
                )}
              </Field>
            </div>
          </Section>

          {/* ── Next of Kin ── */}
          <Section title={t('profile.nextOfKin')} icon={<Contact className="w-4 h-4 text-teal-500" />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Full Name">
                {canEdit ? (
                  <input
                    type="text"
                    value={form.nextOfKin?.name || ''}
                    onChange={(e) => handleNestedChange('nextOfKin', 'name', e.target.value)}
                    placeholder="Next of kin name"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm"
                  />
                ) : (
                  <ReadOnlyValue value={form.nextOfKin?.name || undefined} />
                )}
              </Field>
              <Field label="Relationship">
                {canEdit ? (
                  <select
                    value={form.nextOfKin?.relationship || ''}
                    onChange={(e) => handleNestedChange('nextOfKin', 'relationship', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm bg-white"
                  >
                    <option value="">Select</option>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <ReadOnlyValue value={form.nextOfKin?.relationship || undefined} />
                )}
              </Field>
              <Field label="Phone">
                {canEdit ? (
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={form.nextOfKin?.phone || ''}
                      onChange={(e) => handleNestedChange('nextOfKin', 'phone', e.target.value)}
                      placeholder="+254..."
                      className={inputBase}
                    />
                  </div>
                ) : (
                  <ReadOnlyValue value={form.nextOfKin?.phone || undefined} icon={<Phone className="w-4 h-4" />} />
                )}
              </Field>
            </div>
          </Section>

          {/* ── Bio / Notes ── */}
          <Section title={t('profile.bio')} icon={<FileText className="w-4 h-4" />}>
            {canEdit ? (
              <textarea
                value={form.bio || ''}
                onChange={(e) => handleChange('bio', e.target.value)}
                placeholder="Brief professional background, qualifications, or notes..."
                rows={4}
                className={textareaBase}
              />
            ) : (
              <ReadOnlyValue value={form.bio || undefined} />
            )}
          </Section>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <div className="text-xs text-gray-400">
            Member since {user.createdAt ? format(new Date(user.createdAt), 'MMMM yyyy') : 'N/A'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 transition-all shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Local Helpers ═══════════════════════════ */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-gray-700">
        <span className="text-gray-400">{icon}</span>
        <h4 className="text-sm font-bold uppercase tracking-wide">{title}</h4>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
