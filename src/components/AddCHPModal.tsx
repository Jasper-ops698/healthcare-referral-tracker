/**
 * AddCHPModal — Community Health Promoter Registration
 *
 * Uses shadcn/ui Dialog for consistent modal behavior with Add User modal.
 * CHPs are NOT system users — they have no login account.
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAuth } from '@/hooks/useAuth';
import type { Chp } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  UserPlus, MapPin, Phone, Award,
  Users, Languages, CalendarDays, Hash, Mail
} from 'lucide-react';

interface AddCHPModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (chp: Omit<Chp, 'id' | 'chpId' | 'createdAt'>) => void;
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

export default function AddCHPModal({ open, onOpenChange, onSubmit }: AddCHPModalProps) {
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
    // Reset form
    setForm({
      fullName: '', email: '', nationalId: '', phone: '', alternatePhone: '',
      gender: 'male', dateOfBirth: '', village: '', subLocation: '',
      ward: '', county: '', languages: [], yearsOfExperience: 0,
      chpRegNumber: '', supervisorName: '', supervisorPhone: '',
      facilityId: user?.assignedFacility || '', facilityName: '', status: 'active',
    });
    setErrors({});
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            {t('chp.addTitle')}
          </DialogTitle>
          <DialogDescription>{t('chp.addSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <Users className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
              {t('chp.fullName')} <span className="text-destructive">*</span>
            </label>
            {errors.fullName && <p className="text-xs text-destructive mb-1">{errors.fullName}</p>}
            <input
              type="text" value={form.fullName}
              onChange={e => update('fullName', e.target.value)}
              placeholder={t('chp.fullNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* National ID & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                <Hash className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
                {t('chp.nationalId')} <span className="text-destructive">*</span>
              </label>
              {errors.nationalId && <p className="text-xs text-destructive mb-1">{errors.nationalId}</p>}
              <input
                type="text" value={form.nationalId}
                onChange={e => update('nationalId', e.target.value)}
                placeholder={t('chp.nationalIdPlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                <Phone className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
                {t('chp.phone')} <span className="text-destructive">*</span>
              </label>
              {errors.phone && <p className="text-xs text-destructive mb-1">{errors.phone}</p>}
              <input
                type="tel" value={form.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="+254 7XX XXX XXX"
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Gender & Date of Birth */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Gender <span className="text-destructive">*</span></label>
              <select
                value={form.gender}
                onChange={e => update('gender', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-background"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                <CalendarDays className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
                {t('chp.dateOfBirth')}
              </label>
              <input
                type="date" value={form.dateOfBirth}
                onChange={e => update('dateOfBirth', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <Mail className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
              {t('chp.email')}
            </label>
            <input
              type="email" value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="chp@email.com"
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Alternate Phone */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <Phone className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
              {t('chp.alternatePhone')}
            </label>
            <input
              type="tel" value={form.alternatePhone}
              onChange={e => update('alternatePhone', e.target.value)}
              placeholder="+254 7XX XXX XXX"
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Location Section */}
          <div className="pt-2 border-t border-border">
            <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-1">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              {t('chp.locationInfo')}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.village')} <span className="text-destructive">*</span></label>
                  {errors.village && <p className="text-xs text-destructive mb-1">{errors.village}</p>}
                  <input
                    type="text" value={form.village}
                    onChange={e => update('village', e.target.value)}
                    placeholder={t('chp.villagePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.subLocation')} <span className="text-destructive">*</span></label>
                  {errors.subLocation && <p className="text-xs text-destructive mb-1">{errors.subLocation}</p>}
                  <input
                    type="text" value={form.subLocation}
                    onChange={e => update('subLocation', e.target.value)}
                    placeholder={t('chp.subLocationPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.ward')} <span className="text-destructive">*</span></label>
                  {errors.ward && <p className="text-xs text-destructive mb-1">{errors.ward}</p>}
                  <input
                    type="text" value={form.ward}
                    onChange={e => update('ward', e.target.value)}
                    placeholder={t('chp.wardPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.county')} <span className="text-destructive">*</span></label>
                  {errors.county && <p className="text-xs text-destructive mb-1">{errors.county}</p>}
                  <select
                    value={form.county}
                    onChange={e => update('county', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-background"
                  >
                    <option value="">{t('chp.selectCounty')}</option>
                    {KENYAN_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Work Details */}
          <div className="pt-2 border-t border-border">
            <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-1">
              <Award className="w-4 h-4 text-muted-foreground" />
              {t('chp.professionalInfo')}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.chpRegNumber')}</label>
                  <input
                    type="text" value={form.chpRegNumber}
                    onChange={e => update('chpRegNumber', e.target.value)}
                    placeholder={t('chp.chpRegNumberPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.yearsOfExperience')}</label>
                  <input
                    type="number" min={0} max={50}
                    value={form.yearsOfExperience}
                    onChange={e => update('yearsOfExperience', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.supervisorName')}</label>
                  <input
                    type="text" value={form.supervisorName}
                    onChange={e => update('supervisorName', e.target.value)}
                    placeholder={t('chp.supervisorNamePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('chp.supervisorPhone')}</label>
                  <input
                    type="tel" value={form.supervisorPhone}
                    onChange={e => update('supervisorPhone', e.target.value)}
                    placeholder="+254 7XX XXX XXX"
                    className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Languages */}
          <div className="pt-2 border-t border-border">
            <label className="block text-sm font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
              <Languages className="w-4 h-4 text-muted-foreground" />
              {t('chp.languages')}
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_LANGUAGES.map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    form.languages.includes(lang)
                      ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Facility */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('chp.facilityName')}</label>
            <input
              type="text" value={form.facilityName}
              onChange={e => update('facilityName', e.target.value)}
              placeholder={t('chp.facilityNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-input bg-background text-foreground hover:bg-muted transition-colors font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {t('chp.registerButton')}
            </button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
