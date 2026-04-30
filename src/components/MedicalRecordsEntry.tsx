import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { useMedicalRecords } from '@/hooks/useData';
import type { Patient, MedicalRecord } from '@/types';
import { 
  Search, 
  User, 
  Thermometer, 
  Heart, 
  Activity, 
  Wind,
  Scale,
  Ruler,
  FileText,
  Pill,
  FlaskConical,
  Stethoscope,
  Save,
  CheckCircle2,
  X
} from 'lucide-react';

interface MedicalRecordsEntryProps {
  patients: Patient[];
}

export default function MedicalRecordsEntry({ patients }: MedicalRecordsEntryProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { addRecord } = useMedicalRecords();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState<Partial<MedicalRecord>>({
    visitType: 'routine',
    chiefComplaint: '',
    symptoms: [],
    symptomDuration: '',
    painLevel: 0,
    vitalSigns: {
      temperature: undefined,
      temperatureUnit: 'celsius',
      bloodPressureSystolic: undefined,
      bloodPressureDiastolic: undefined,
      heartRate: undefined,
      respiratoryRate: undefined,
      oxygenSaturation: undefined,
      weight: undefined,
      weightUnit: 'kg',
      height: undefined,
      heightUnit: 'cm',
      recordedAt: new Date(),
    },
    physicalExamination: {
      generalAppearance: '',
      skin: '',
      cardiovascular: '',
      respiratory: '',
    },
    preliminaryDiagnosis: '',
    clinicalNotes: '',
    followUpInstructions: '',
    medications: [],
  });

  const [symptomInput, setSymptomInput] = useState('');
  const [medicationInput, setMedicationInput] = useState({ name: '', dosage: '', frequency: '', duration: '' });

  const filteredPatients = patients.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.patientId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!user || !selectedPatient) return;

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    addRecord({
      ...formData,
      patientId: selectedPatient.id,
      recordedBy: user.id,
    } as Omit<MedicalRecord, 'id' | 'recordedAt'>);

    setIsSubmitting(false);
    setShowSuccess(true);

    setTimeout(() => {
      setShowSuccess(false);
      setSelectedPatient(null);
      setSearchQuery('');
      setFormData({
        visitType: 'routine',
        chiefComplaint: '',
        symptoms: [],
        symptomDuration: '',
        painLevel: 0,
        vitalSigns: {
          temperature: undefined,
          temperatureUnit: 'celsius',
          bloodPressureSystolic: undefined,
          bloodPressureDiastolic: undefined,
          heartRate: undefined,
          respiratoryRate: undefined,
          oxygenSaturation: undefined,
          weight: undefined,
          weightUnit: 'kg',
          height: undefined,
          heightUnit: 'cm',
          recordedAt: new Date(),
        },
        physicalExamination: {
          generalAppearance: '',
          skin: '',
          cardiovascular: '',
          respiratory: '',
        },
        preliminaryDiagnosis: '',
        clinicalNotes: '',
        followUpInstructions: '',
        medications: [],
      });
    }, 2000);
  };

  const addSymptom = () => {
    if (symptomInput.trim()) {
      setFormData({
        ...formData,
        symptoms: [...(formData.symptoms || []), symptomInput.trim()],
      });
      setSymptomInput('');
    }
  };

  const removeSymptom = (index: number) => {
    setFormData({
      ...formData,
      symptoms: formData.symptoms?.filter((_, i) => i !== index),
    });
  };

  const addMedication = () => {
    if (medicationInput.name.trim()) {
      setFormData({
        ...formData,
        medications: [
          ...(formData.medications || []),
          {
            id: Math.random().toString(36).substr(2, 9),
            name: medicationInput.name,
            dosage: medicationInput.dosage,
            frequency: medicationInput.frequency,
            duration: medicationInput.duration,
            route: 'oral',
            prescribedAt: new Date(),
          },
        ],
      });
      setMedicationInput({ name: '', dosage: '', frequency: '', duration: '' });
    }
  };

  const removeMedication = (index: number) => {
    setFormData({
      ...formData,
      medications: formData.medications?.filter((_, i) => i !== index),
    });
  };

  if (!selectedPatient) {
    return (
      <div className="max-w-2xl mx-auto animate-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">{t('medical.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('medical.noPatientSelected')}
          </p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('medical.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-lg"
            autoFocus
          />
        </div>

        {searchQuery && (
          <div className="bg-white rounded-xl shadow-sm border border-border/50 overflow-hidden">
            {filteredPatients.slice(0, 5).map((patient) => (
              <button
                key={patient.id}
                onClick={() => setSelectedPatient(patient)}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">{patient.firstName} {patient.lastName}</p>
                  <p className="text-sm text-muted-foreground">{patient.patientId}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{patient.phone}</p>
                </div>
              </button>
            ))}
            {filteredPatients.length === 0 && (
              <div className="p-8 text-center">
                <User className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No patients found</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('medical.title')}</h1>
          <p className="text-muted-foreground mt-1">
            Recording for: <span className="font-medium text-foreground">{selectedPatient.firstName} {selectedPatient.lastName}</span> ({selectedPatient.patientId})
          </p>
        </div>
        <button
          onClick={() => setSelectedPatient(null)}
          className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>

      <div className="space-y-6">
        {/* Visit Type & {t('medical.chiefComplaint')} */}
        <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t('medical.visitDate')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Visit Type</label>
              <select
                value={formData.visitType}
                onChange={(e) => setFormData({ ...formData, visitType: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
              >
                <option value="routine">Routine Checkup</option>
                <option value="emergency">Emergency</option>
                <option value="follow-up">Follow-up</option>
                <option value="referral">Referral</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Pain Level (0-10)</label>
              <input
                type="range"
                min="0"
                max="10"
                value={formData.painLevel}
                onChange={(e) => setFormData({ ...formData, painLevel: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>No Pain (0)</span>
                <span className="font-medium text-primary">{formData.painLevel}</span>
                <span>Severe (10)</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('medical.chiefComplaint')}</label>
            <textarea
              value={formData.chiefComplaint}
              onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              rows={2}
              placeholder={t('medical.chiefComplaintPlaceholder')}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-foreground mb-2">{t('medical.symptoms')}</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={symptomInput}
                onChange={(e) => setSymptomInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSymptom())}
                className="flex-1 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder={t('medical.symptomPlaceholder')}
              />
              <button
                type="button"
                onClick={addSymptom}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.symptoms?.map((symptom, index) => (
                <span 
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm"
                >
                  {symptom}
                  <button
                    type="button"
                    onClick={() => removeSymptom(index)}
                    className="w-4 h-4 rounded-full hover:bg-amber-200 flex items-center justify-center"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* {t('medical.vitals')} */}
        <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            {t('medical.vitals')}
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.temperature')}</label>
              <div className="relative">
                <Thermometer className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  step="0.1"
                  value={formData.vitalSigns?.temperature || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, temperature: parseFloat(e.target.value) }
                  })}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.tempPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.bloodPressure')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formData.vitalSigns?.bloodPressureSystolic || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, bloodPressureSystolic: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.systolicPlaceholder')}
                />
                <span className="text-muted-foreground">/</span>
                <input
                  type="number"
                  value={formData.vitalSigns?.bloodPressureDiastolic || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, bloodPressureDiastolic: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.diastolicPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.heartRate')}</label>
              <div className="relative">
                <Heart className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  value={formData.vitalSigns?.heartRate || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, heartRate: parseInt(e.target.value) }
                  })}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.heartRatePlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.respiratoryRate')}</label>
              <div className="relative">
                <Wind className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  value={formData.vitalSigns?.respiratoryRate || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, respiratoryRate: parseInt(e.target.value) }
                  })}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.respPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.oxygenSaturation')}</label>
              <input
                type="number"
                value={formData.vitalSigns?.oxygenSaturation || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  vitalSigns: { ...formData.vitalSigns!, oxygenSaturation: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder={t('medical.o2Placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.weight')}</label>
              <div className="relative">
                <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  step="0.1"
                  value={formData.vitalSigns?.weight || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, weight: parseFloat(e.target.value) }
                  })}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.weightPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('medical.height')}</label>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  value={formData.vitalSigns?.height || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    vitalSigns: { ...formData.vitalSigns!, height: parseInt(e.target.value) }
                  })}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder={t('medical.heightPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">BMI</label>
              <input
                type="text"
                readOnly
                value={
                  formData.vitalSigns?.weight && formData.vitalSigns?.height
                    ? (formData.vitalSigns.weight / Math.pow(formData.vitalSigns.height / 100, 2)).toFixed(1)
                    : '-'
                }
                className="w-full px-3 py-2 rounded-lg border border-input bg-muted text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {/* {t('medical.physicalExam')} */}
        <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />
            {t('medical.physicalExam')}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">General Appearance</label>
              <input
                type="text"
                value={formData.physicalExamination?.generalAppearance}
                onChange={(e) => setFormData({
                  ...formData,
                  physicalExamination: { ...formData.physicalExamination!, generalAppearance: e.target.value }
                })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder={t('medical.physicalExamPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Skin</label>
                <input
                  type="text"
                  value={formData.physicalExamination?.skin}
                  onChange={(e) => setFormData({
                    ...formData,
                    physicalExamination: { ...formData.physicalExamination!, skin: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="e.g., Normal, no rashes"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Cardiovascular</label>
                <input
                  type="text"
                  value={formData.physicalExamination?.cardiovascular}
                  onChange={(e) => setFormData({
                    ...formData,
                    physicalExamination: { ...formData.physicalExamination!, cardiovascular: e.target.value }
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="e.g., Regular rhythm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Respiratory</label>
              <input
                type="text"
                value={formData.physicalExamination?.respiratory}
                onChange={(e) => setFormData({
                  ...formData,
                  physicalExamination: { ...formData.physicalExamination!, respiratory: e.target.value }
                })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="e.g., Clear to auscultation"
              />
            </div>
          </div>
        </div>

        {/* Diagnosis & Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            {t('medical.diagnosis')}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('medical.primaryDiagnosis')}</label>
              <input
                type="text"
                value={formData.preliminaryDiagnosis}
                onChange={(e) => setFormData({ ...formData, preliminaryDiagnosis: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="Enter diagnosis"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('medical.notes')}</label>
              <textarea
                value={formData.clinicalNotes}
                onChange={(e) => setFormData({ ...formData, clinicalNotes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                rows={3}
                placeholder="Detailed clinical observations"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('medical.notes')}</label>
              <textarea
                value={formData.followUpInstructions}
                onChange={(e) => setFormData({ ...formData, followUpInstructions: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                rows={2}
                placeholder="Instructions for patient follow-up"
              />
            </div>
          </div>
        </div>

        {/* Medications */}
        <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Pill className="w-5 h-5 text-primary" />
            {t('medical.prescription')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <input
              type="text"
              value={medicationInput.name}
              onChange={(e) => setMedicationInput({ ...medicationInput, name: e.target.value })}
              className="px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Medication name"
            />
            <input
              type="text"
              value={medicationInput.dosage}
              onChange={(e) => setMedicationInput({ ...medicationInput, dosage: e.target.value })}
              className="px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Dosage (e.g., 500mg)"
            />
            <input
              type="text"
              value={medicationInput.frequency}
              onChange={(e) => setMedicationInput({ ...medicationInput, frequency: e.target.value })}
              className="px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Frequency (e.g., Twice daily)"
            />
            <button
              type="button"
              onClick={addMedication}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('common.add')}
            </button>
          </div>

          <div className="space-y-2">
            {formData.medications?.map((med, index) => (
              <div 
                key={med.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <Pill className="w-4 h-4 text-primary" />
                  <div>
                    <span className="font-medium text-sm">{med.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {med.dosage} • {med.frequency}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMedication(index)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('medical.adding')}
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                {t('medical.addRecord')}
              </>
            )}
          </button>
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
              {t('medical.success')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
