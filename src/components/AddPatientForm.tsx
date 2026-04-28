import { useState } from 'react';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';

interface AddPatientFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  registeredBy: string;
}

export default function AddPatientForm({ onSubmit, onCancel, registeredBy }: AddPatientFormProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'male' as 'male' | 'female' | 'other',
    phone: '',
    email: '',
    bloodType: '',
    city: '',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.dateOfBirth || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    onSubmit({
      firstName: formData.firstName,
      lastName: formData.lastName,
      dateOfBirth: new Date(formData.dateOfBirth),
      gender: formData.gender,
      phone: formData.phone,
      email: formData.email || undefined,
      bloodType: formData.bloodType || undefined,
      address: formData.city ? { city: formData.city } : undefined,
      emergencyContact: formData.emergencyName
        ? {
            name: formData.emergencyName,
            relationship: formData.emergencyRelationship || 'Other',
            phone: formData.emergencyPhone,
          }
        : undefined,
      registeredBy,
      referralStatus: 'registered',
      status: 'active',
      registrationDate: new Date(),
      lastUpdated: new Date(),
    });
    setSaving(false);
  };

  const update = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2" autoComplete="off">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            First Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.firstName}
            onChange={(e) => update('firstName', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
            placeholder="John"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Last Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.lastName}
            onChange={(e) => update('lastName', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
            placeholder="Doe"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Date of Birth <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            required
            value={formData.dateOfBirth}
            onChange={(e) => update('dateOfBirth', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Gender <span className="text-rose-500">*</span>
          </label>
          <select
            value={formData.gender}
            onChange={(e) => update('gender', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm bg-white outline-none"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Phone <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            required
            value={formData.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
            placeholder="+254 7XX XXX XXX"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => update('email', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
            placeholder="john@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Blood Type</label>
          <select
            value={formData.bloodType}
            onChange={(e) => update('bloodType', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm bg-white outline-none"
          >
            <option value="">Select</option>
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
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">City / Location</label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => update('city', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
            placeholder="Nairobi"
          />
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="pt-3 border-t border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500">Name</label>
            <input
              type="text"
              value={formData.emergencyName}
              onChange={(e) => update('emergencyName', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
              placeholder="Contact name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500">Relationship</label>
            <select
              value={formData.emergencyRelationship}
              onChange={(e) => update('emergencyRelationship', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm bg-white outline-none"
            >
              <option value="">Select</option>
              <option value="Spouse">Spouse</option>
              <option value="Parent">Parent</option>
              <option value="Sibling">Sibling</option>
              <option value="Child">Child</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500">Phone</label>
            <input
              type="tel"
              value={formData.emergencyPhone}
              onChange={(e) => update('emergencyPhone', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm outline-none"
              placeholder="+254..."
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Register Patient'}
        </button>
      </div>
    </form>
  );
}
