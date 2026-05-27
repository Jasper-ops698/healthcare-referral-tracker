import { useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { usePatients, useChps } from '@/hooks/useData';
import { useI18n } from '@/i18n/useI18n';
import type { Patient } from '@/types';
import { 
  User, 
  MapPin, 
  Heart,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Save,
  Users,
  FileSearch,
  ArrowRight
} from 'lucide-react';

interface PatientRegistrationProps {
  onSuccess?: () => void;
}

export default function PatientRegistration({ onSuccess }: PatientRegistrationProps) {
  const { user } = useAuth();
  const { addPatient, searchPatientByPhone } = usePatients();
  const { chps } = useChps();
  const [duplicatePatient, setDuplicatePatient] = useState<Patient | null>(null);
  const { t } = useI18n();
  const [step, setStep] = useState(1);

  // Get available CHPs — ONLY those assigned to this collector's facility
  const facilityChps = chps.filter(c =>
    c.facilityId === user?.assignedFacility && c.status === 'active'
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState<Partial<Patient>>({
    firstName: '',
    lastName: '',
    dateOfBirth: new Date(),
    gender: 'male',
    phone: '',
    email: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'Kenya',
    },
    emergencyContact: {
      name: '',
      relationship: '',
      phone: '',
    },
    bloodType: '',
    allergies: [],
    chronicConditions: [],
    assignedChpId: '',
    assignedChpName: '',
    referralStages: [],
    status: 'active',
    referralStatus: 'registered',
  });

  const [allergyInput, setAllergyInput] = useState('');
  const [conditionInput, setConditionInput] = useState('');

  const handleSubmit = async () => {
    if (!user) return;
    
    // ── DUPLICATE CHECK ──
    const existing = await searchPatientByPhone(formData.phone.trim());
    if (existing) {
      setDuplicatePatient(existing);
      return;
    }
    
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    addPatient({
      ...formData,
      registeredBy: user.id,
    } as Omit<Patient, 'id' | 'patientId' | 'registrationDate' | 'lastUpdated'>);
    
    setIsSubmitting(false);
    setShowSuccess(true);
    
    setTimeout(() => {
      setShowSuccess(false);
      onSuccess?.();
    }, 2000);
  };

  const addAllergy = () => {
    if (allergyInput.trim()) {
      setFormData({
        ...formData,
        allergies: [...(formData.allergies || []), allergyInput.trim()],
      });
      setAllergyInput('');
    }
  };

  const removeAllergy = (index: number) => {
    setFormData({
      ...formData,
      allergies: formData.allergies?.filter((_, i) => i !== index),
    });
  };

  const addCondition = () => {
    if (conditionInput.trim()) {
      setFormData({
        ...formData,
        chronicConditions: [...(formData.chronicConditions || []), conditionInput.trim()],
      });
      setConditionInput('');
    }
  };

  const removeCondition = (index: number) => {
    setFormData({
      ...formData,
      chronicConditions: formData.chronicConditions?.filter((_, i) => i !== index),
    });
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        {t('reg.personalInfo')}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.firstName')} *</label>
          <input
            type="text"
            required
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.firstNamePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.lastName')} *</label>
          <input
            type="text"
            required
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.lastNamePlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.dateOfBirth')} *</label>
          <input
            type="date"
            required
            value={formData.dateOfBirth ? formData.dateOfBirth.toISOString().split('T')[0] : ''}
            onChange={(e) => setFormData({ ...formData, dateOfBirth: new Date(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.gender')} *</label>
          <select
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' | 'other' })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
          >
            <option value="male">{t('reg.male')}</option>
            <option value="female">{t('reg.female')}</option>
            <option value="other">{t('reg.other')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.phone')} *</label>
          <input
            type="tel"
            required
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.phonePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email (Optional)</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.emailPlaceholder')}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{t('patients.bloodType')} (Optional)</label>
        <select
          value={formData.bloodType}
          onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
        >
          <option value="">{'Select'} {t('patients.bloodType').toLowerCase()}</option>
          <option value="A+">A+</option>
          <option value="A-">A-</option>
          <option value="B+">B+</option>
          <option value="B-">B-</option>
          <option value="AB+">AB+</option>
          <option value="AB-">AB-</option>
          <option value="O+">O+</option>
          <option value="O-">O-</option>
        </select>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" />
        {t('reg.address')}
      </h3>
      
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{t('reg.address')} *</label>
        <input
          type="text"
          required
          value={formData.address?.street}
          onChange={(e) => setFormData({ 
            ...formData, 
            address: { ...formData.address!, street: e.target.value }
          })}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          placeholder={t('reg.streetPlaceholder')}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.cityPlaceholder')} *</label>
          <input
            type="text"
            required
            value={formData.address?.city}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address!, city: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.cityPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.statePlaceholder')} *</label>
          <input
            type="text"
            required
            value={formData.address?.state}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address!, state: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.statePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('reg.zipPlaceholder')} *</label>
          <input
            type="text"
            required
            value={formData.address?.postalCode}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address!, postalCode: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.zipPlaceholder')}
          />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 pt-4 border-t border-border">
        <Heart className="w-5 h-5 text-primary" />
        {t('reg.emergencyContact')}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('patients.fullName')}</label>
          <input
            type="text"
            value={formData.emergencyContact?.name}
            onChange={(e) => setFormData({ 
              ...formData, 
              emergencyContact: { ...formData.emergencyContact!, name: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.emergencyNamePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{t('patients.relationship')}</label>
          <input
            type="text"
            value={formData.emergencyContact?.relationship}
            onChange={(e) => setFormData({ 
              ...formData, 
              emergencyContact: { ...formData.emergencyContact!, relationship: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.emergencyRelationshipPlaceholder')}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{t('patients.emergencyContact')} {t('patients.phone')}</label>
        <input
          type="tel"
          value={formData.emergencyContact?.phone}
          onChange={(e) => setFormData({ 
            ...formData, 
            emergencyContact: { ...formData.emergencyContact!, phone: e.target.value }
          })}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          placeholder={t('reg.emergencyPhonePlaceholder')}
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-primary" />
        {t('reg.medicalInfo')}
      </h3>

      {/* Allergies */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">{t('reg.allergies')}</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergy())}
            className="flex-1 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.allergyPlaceholder')}
          />
          <button
            type="button"
            onClick={addAllergy}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t('common.add')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.allergies?.map((allergy, index) => (
            <span 
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-sm"
            >
              {allergy}
              <button
                type="button"
                onClick={() => removeAllergy(index)}
                className="w-4 h-4 rounded-full hover:bg-rose-200 flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Chronic Conditions */}
      <div className="pt-4 border-t border-border">
        <label className="block text-sm font-medium text-foreground mb-2">{t('reg.chronicConditions')}</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={conditionInput}
            onChange={(e) => setConditionInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCondition())}
            className="flex-1 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={t('reg.conditionPlaceholder')}
          />
          <button
            type="button"
            onClick={addCondition}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t('common.add')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.chronicConditions?.map((condition, index) => (
            <span 
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm"
            >
              {condition}
              <button
                type="button"
                onClick={() => removeCondition(index)}
                className="w-4 h-4 rounded-full hover:bg-amber-200 flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Insurance Info */}
      <div className="pt-4 border-t border-border">
        <h4 className="font-medium text-foreground mb-3">{t('reg.insurance')} (Optional)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reg.provider')}</label>
            <input
              type="text"
              value={formData.insuranceInfo?.provider || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                insuranceInfo: { 
                  ...formData.insuranceInfo,
                  provider: e.target.value,
                  policyNumber: formData.insuranceInfo?.policyNumber || ''
                }
              })}
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder={t('reg.providerPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reg.policyNumber')}</label>
            <input
              type="text"
              value={formData.insuranceInfo?.policyNumber || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                insuranceInfo: { 
                  ...formData.insuranceInfo,
                  provider: formData.insuranceInfo?.provider || '',
                  policyNumber: e.target.value
                }
              })}
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder={t('reg.policyPlaceholder')}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 4: CHP Assignment ──
  const renderStep4 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        {t('patients.assignChp')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t('patients.assignChpDesc')}
      </p>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('patients.chpAssigned')}
        </label>
        <select
          value={formData.assignedChpId || ''}
          onChange={(e) => {
            const chpId = e.target.value;
            const selectedChp = facilityChps.find(c => c.id === chpId);
            setFormData({
              ...formData,
              assignedChpId: chpId,
              assignedChpName: selectedChp?.fullName || '',
            });
          }}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
        >
          <option value="">{t('patients.selectCollector')}</option>
          {facilityChps.map((chp) => (
            <option key={chp.id} value={chp.id}>
              {chp.fullName} — {chp.village}, {chp.ward} ({chp.phone})
            </option>
          ))}
        </select>
        {facilityChps.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">
            {t('patients.noChpsForFacility')}
          </p>
        )}
      </div>

      {/* Referral Stages Preview */}
      {formData.assignedChpId && (
        <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
          <h4 className="text-sm font-medium text-foreground mb-2">
            {t('referral.stages')}
          </h4>
          <p className="text-xs text-muted-foreground">
            Referral stages will be tracked as the patient moves between facilities.
            The assigned CHP ({formData.assignedChpName}) will accompany the patient through each stage.
          </p>
        </div>
      )}
    </div>
  );

  const steps = [
    { number: 1, title: t('reg.personalInfo'), render: renderStep1 },
    { number: 2, title: t('reg.address'), render: renderStep2 },
    { number: 3, title: t('reg.medicalInfo'), render: renderStep3 },
    { number: 4, title: t('patients.assignChp'), render: renderStep4 },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('reg.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('patients.subtitle')}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s.number} className="flex items-center gap-2">
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s.number 
                  ? 'bg-primary text-primary-foreground' 
                  : step > s.number 
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {step > s.number ? <CheckCircle2 className="w-4 h-4" /> : s.number}
            </div>
            <span className={`text-sm ${step === s.number ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              {s.title}
            </span>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6">
        {steps[step - 1].render()}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6 pt-6 border-t border-border">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="px-6 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('common.cancel')}
          </button>
          
          {step < steps.length ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              {t('common.save')}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('reg.registering')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t('reg.registerButton')}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl animate-in text-center border">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">{t('common.success')}</h3>
            <p className="text-muted-foreground">
              {t('reg.success')}
            </p>
          </div>
        </div>
      )}
      {/* Duplicate Patient Dialog */}
      {duplicatePatient && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <FileSearch className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Patient Already Exists</h3>
                <p className="text-sm text-muted-foreground">A patient with this phone number is already registered</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-4 border border-slate-100">
              <p className="font-semibold text-foreground">{duplicatePatient.firstName} {duplicatePatient.lastName}</p>
              <p className="text-sm text-muted-foreground">{duplicatePatient.phone}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Registered: {format(new Date(duplicatePatient.registrationDate), 'MMM d, yyyy')}
                {duplicatePatient.currentFacilityName && ` • Currently at: ${duplicatePatient.currentFacilityName}`}
              </p>
              <p className="text-sm text-muted-foreground">
                Status: <span className="capitalize font-medium">{duplicatePatient.referralStatus}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDuplicatePatient(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDuplicatePatient(null);
                  onSuccess?.();
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                View Patient
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
