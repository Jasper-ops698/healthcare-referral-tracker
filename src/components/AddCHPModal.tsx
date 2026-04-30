/**
 * AddCHPModal — Community Health Promoter Registration
 *
 * Tailored for African community health contexts.
 * CHPs are NOT system users — they have no login account.
 * They are managed by admin and assigned to patients by collectors.
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAuth } from '@/hooks/useAuth';
import type { Chp } from '@/types';
import {
  X, UserPlus, MapPin, Phone, Shield, Award,
  Users, Languages, CalendarDays, Hash, Mail
} from 'lucide-react';

interface AddCHPModalProps {
  onSubmit: (chp: Omit<Chp, 'id' | 'chpId' | 'createdAt'>) => void;
  onCancel: () => void;
}

const KENYAN_COUNTIES = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu',
  'Garissa', 'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho',
  'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui',
  'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera',
  'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a", 'Nairobi',
  'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri',
  'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir',
  'West Pokot',
];

const COMMON_LANGUAGES = ['Swahili', 'English', 'Kikuyu', 'Luo', 'Kalenjin', 'Kamba', 'Kisii', 'Meru', 'Mijikenda', 'Somali'];

export default function AddCHPModal({ onSubmit, onCancel }: AddCHPModalProps) {
  const { t } = useI18n();
  const { user } = useAuth();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    nationalId: '',
    phone: '',
    alternatePhone: '',
    gender: 'male' as 'male' | 'female' | 'other',
    dateOfBirth: '',
    village: '',
    subLocation: '',
    ward: '',
    county: '',
    languages: [] as string[],
    yearsOfExperience: 0,
    chpRegNumber: '',
    supervisorName: '',
    supervisorPhone: '',
    facilityId: user?.assignedFacility || '',
    facilityName: '',
    status: 'active' as const,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = t('chp.fieldRequired');
    if (!form.nationalId.trim()) e.nationalId = t('chp.fieldRequired');
    if (!form.phone.trim()) e.phone = t('chp.fieldRequired');
    if (!form.village.trim()) e.village = t('chp.fieldRequired');
    if (!form.subLocation.trim()) e.subLocation = t('chp.fieldRequired');
    if (!form.ward.trim()) e.ward = t('chp.fieldRequired');
    if (!form.county.trim()) e.county = t('chp.fieldRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  const update = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const toggleLanguage = (lang: string) => {
    setForm(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  const field = (label: string, fieldName: string, icon: React.ReactNode, required = false) => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground">
        {icon && <span className="inline-flex items-center justify-center w-4 h-4 mr-1.5 text-muted-foreground align-text-bottom">{icon}</span>}
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {errors[fieldName] && (
        <p className="text-xs text-destructive">{errors[fieldName]}</p>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-transparent p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('chp.addTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('chp.addSubtitle')}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* ── Personal Information ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide border-b border-border pb-2">
              {t('chp.personalInfo')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {field(t('chp.fullName'), 'fullName', <Users className="w-4 h-4" />, true)}
                <input
                  type="text" value={form.fullName}
                  onChange={e => update('fullName', e.target.value)}
                  placeholder={t('chp.fullNamePlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.nationalId'), 'nationalId', <Hash className="w-4 h-4" />, true)}
                <input
                  type="text" value={form.nationalId}
                  onChange={e => update('nationalId', e.target.value)}
                  placeholder={t('chp.nationalIdPlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                {field(t('reg.gender'), 'gender', null, true)}
                <select
                  value={form.gender}
                  onChange={e => update('gender', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                >
                  <option value="male">{t('reg.male')}</option>
                  <option value="female">{t('reg.female')}</option>
                  <option value="other">{t('reg.other')}</option>
                </select>
              </div>
              <div>
                {field(t('chp.email'), 'email', <Mail className="w-4 h-4" />)}
                <input
                  type="email" value={form.email}
                  onChange={e => update('email', e.target.value)}
                  placeholder="chp@email.com"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.phone'), 'phone', <Phone className="w-4 h-4" />, true)}
                <input
                  type="tel" value={form.phone}
                  onChange={e => update('phone', e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.alternatePhone'), 'alternatePhone', <Phone className="w-4 h-4" />)}
                <input
                  type="tel" value={form.alternatePhone}
                  onChange={e => update('alternatePhone', e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div>
              {field(t('chp.dateOfBirth'), 'dateOfBirth', <CalendarDays className="w-4 h-4" />)}
              <input
                type="date" value={form.dateOfBirth}
                onChange={e => update('dateOfBirth', e.target.value)}
                className="mt-1 w-full md:w-1/3 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* ── Location ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {t('chp.locationInfo')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {field(t('chp.village'), 'village', null, true)}
                <input
                  type="text" value={form.village}
                  onChange={e => update('village', e.target.value)}
                  placeholder={t('chp.villagePlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.subLocation'), 'subLocation', null, true)}
                <input
                  type="text" value={form.subLocation}
                  onChange={e => update('subLocation', e.target.value)}
                  placeholder={t('chp.subLocationPlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.ward'), 'ward', null, true)}
                <input
                  type="text" value={form.ward}
                  onChange={e => update('ward', e.target.value)}
                  placeholder={t('chp.wardPlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.county'), 'county', null, true)}
                <select
                  value={form.county}
                  onChange={e => update('county', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                >
                  <option value="">{t('chp.selectCounty')}</option>
                  {KENYAN_COUNTIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Professional ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
              <Award className="w-4 h-4" /> {t('chp.professionalInfo')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {field(t('chp.yearsOfExperience'), 'yearsOfExperience', null)}
                <input
                  type="number" min={0} max={50}
                  value={form.yearsOfExperience}
                  onChange={e => update('yearsOfExperience', parseInt(e.target.value) || 0)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.chpRegNumber'), 'chpRegNumber', <Award className="w-4 h-4" />)}
                <input
                  type="text" value={form.chpRegNumber}
                  onChange={e => update('chpRegNumber', e.target.value)}
                  placeholder={t('chp.chpRegNumberPlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div>
              {field(t('chp.languages'), 'languages', <Languages className="w-4 h-4" />)}
              <div className="mt-2 flex flex-wrap gap-2">
                {COMMON_LANGUAGES.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      form.languages.includes(lang)
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Supervisor ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" /> {t('chp.supervisorInfo')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {field(t('chp.supervisorName'), 'supervisorName', null)}
                <input
                  type="text" value={form.supervisorName}
                  onChange={e => update('supervisorName', e.target.value)}
                  placeholder={t('chp.supervisorNamePlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                {field(t('chp.supervisorPhone'), 'supervisorPhone', <Phone className="w-4 h-4" />)}
                <input
                  type="tel" value={form.supervisorPhone}
                  onChange={e => update('supervisorPhone', e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>

          {/* ── Facility Assignment ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide border-b border-border pb-2">
              {t('chp.facilityAssignment')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {field(t('chp.facilityName'), 'facilityName', null)}
                <input
                  type="text" value={form.facilityName}
                  onChange={e => update('facilityName', e.target.value)}
                  placeholder={t('chp.facilityNamePlaceholder')}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="sticky bottom-0 bg-white dark:bg-card border-t border-border pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {t('chp.registerButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
