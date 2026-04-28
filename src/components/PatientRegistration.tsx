import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/useData';
import type { Patient } from '@/types';
import { 
  User, 
  MapPin, 
  Heart,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Save
} from 'lucide-react';

interface PatientRegistrationProps {
  onSuccess?: () => void;
}

export default function PatientRegistration({ onSuccess }: PatientRegistrationProps) {
  const { user } = useAuth();
  const { addPatient } = usePatients();
  const [step, setStep] = useState(1);
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
      country: 'USA',
    },
    emergencyContact: {
      name: '',
      relationship: '',
      phone: '',
    },
    bloodType: '',
    allergies: [],
    chronicConditions: [],
    status: 'active',
    referralStatus: 'registered',
  });

  const [allergyInput, setAllergyInput] = useState('');
  const [conditionInput, setConditionInput] = useState('');

  const handleSubmit = async () => {
    if (!user) return;
    
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
        Personal Information
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">First Name *</label>
          <input
            type="text"
            required
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Enter first name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Last Name *</label>
          <input
            type="text"
            required
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Enter last name"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Date of Birth *</label>
          <input
            type="date"
            required
            value={formData.dateOfBirth ? formData.dateOfBirth.toISOString().split('T')[0] : ''}
            onChange={(e) => setFormData({ ...formData, dateOfBirth: new Date(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Gender *</label>
          <select
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' | 'other' })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Phone Number *</label>
          <input
            type="tel"
            required
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="+1 (555) 000-0000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email (Optional)</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="patient@email.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Blood Type (Optional)</label>
        <select
          value={formData.bloodType}
          onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
        >
          <option value="">Select blood type</option>
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
        Address Information
      </h3>
      
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Street Address *</label>
        <input
          type="text"
          required
          value={formData.address?.street}
          onChange={(e) => setFormData({ 
            ...formData, 
            address: { ...formData.address!, street: e.target.value }
          })}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          placeholder="Enter street address"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">City *</label>
          <input
            type="text"
            required
            value={formData.address?.city}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address!, city: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="City"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">State *</label>
          <input
            type="text"
            required
            value={formData.address?.state}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address!, state: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="State"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">ZIP *</label>
          <input
            type="text"
            required
            value={formData.address?.postalCode}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address!, postalCode: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="ZIP"
          />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 pt-4 border-t border-border">
        <Heart className="w-5 h-5 text-primary" />
        Emergency Contact
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Contact Name</label>
          <input
            type="text"
            value={formData.emergencyContact?.name}
            onChange={(e) => setFormData({ 
              ...formData, 
              emergencyContact: { ...formData.emergencyContact!, name: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Full name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Relationship</label>
          <input
            type="text"
            value={formData.emergencyContact?.relationship}
            onChange={(e) => setFormData({ 
              ...formData, 
              emergencyContact: { ...formData.emergencyContact!, relationship: e.target.value }
            })}
            className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="e.g., Spouse, Parent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Emergency Phone</label>
        <input
          type="tel"
          value={formData.emergencyContact?.phone}
          onChange={(e) => setFormData({ 
            ...formData, 
            emergencyContact: { ...formData.emergencyContact!, phone: e.target.value }
          })}
          className="w-full px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          placeholder="+1 (555) 000-0000"
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-primary" />
        Medical Information
      </h3>

      {/* Allergies */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Allergies</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergy())}
            className="flex-1 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Add allergy (e.g., Penicillin)"
          />
          <button
            type="button"
            onClick={addAllergy}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add
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
        <label className="block text-sm font-medium text-foreground mb-2">Chronic Conditions</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={conditionInput}
            onChange={(e) => setConditionInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCondition())}
            className="flex-1 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Add condition (e.g., Diabetes)"
          />
          <button
            type="button"
            onClick={addCondition}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add
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
        <h4 className="font-medium text-foreground mb-3">Insurance Information (Optional)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Provider</label>
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
              placeholder="Insurance provider"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Policy Number</label>
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
              placeholder="Policy number"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const steps = [
    { number: 1, title: 'Personal Info', render: renderStep1 },
    { number: 2, title: 'Address', render: renderStep2 },
    { number: 3, title: 'Medical Info', render: renderStep3 },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Register New Patient</h1>
        <p className="text-muted-foreground mt-1">
          Enter patient information to create a new record in the system.
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
            Previous
          </button>
          
          {step < steps.length ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              Next
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
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Register Patient
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl animate-in text-center border">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Success!</h3>
            <p className="text-muted-foreground">
              Patient has been registered successfully.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
