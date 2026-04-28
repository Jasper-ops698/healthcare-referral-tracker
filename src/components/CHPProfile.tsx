import { useAuth } from '@/hooks/useAuth';
import {
  Mail,
  Phone,
  Building2,
  Calendar,
  Shield,
  User,
  MapPin,
  Droplets,
  FileText,
  Globe,
  HeartPulse,
  Contact,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';

/** Collector Profile — READ-ONLY VIEW
 *  Collectors can only view their own profile. Only admins can edit.
 */
export default function CollectorProfile() {
  const { user } = useAuth();

  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown';

  const sections = [
    {
      title: 'Personal Information',
      icon: <User className="w-4 h-4" />,
      fields: [
        { label: 'First Name', value: user?.firstName, icon: <User className="w-4 h-4 text-gray-400" /> },
        { label: 'Last Name', value: user?.lastName, icon: <User className="w-4 h-4 text-gray-400" /> },
        { label: 'Email', value: user?.email, icon: <Mail className="w-4 h-4 text-gray-400" /> },
        { label: 'Phone', value: user?.phone || 'Not provided', icon: <Phone className="w-4 h-4 text-gray-400" /> },
        { label: 'Date of Birth', value: user?.dateOfBirth ? format(new Date(user.dateOfBirth), 'MMMM d, yyyy') : 'Not provided', icon: <Calendar className="w-4 h-4 text-gray-400" /> },
        { label: 'Gender', value: user?.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'Not provided', icon: <User className="w-4 h-4 text-gray-400" /> },
        { label: 'Blood Group', value: user?.bloodGroup || 'Not provided', icon: <Droplets className="w-4 h-4 text-gray-400" /> },
        { label: 'National ID', value: user?.nationalId || 'Not provided', icon: <FileText className="w-4 h-4 text-gray-400" /> },
        { label: 'Home County', value: user?.homeCounty || 'Not provided', icon: <MapPin className="w-4 h-4 text-gray-400" /> },
      ],
    },
    {
      title: 'Work Information',
      icon: <Shield className="w-4 h-4" />,
      fields: [
        { label: 'Assigned Facility', value: user?.assignedFacility || 'Not assigned', icon: <Building2 className="w-4 h-4 text-gray-400" /> },
        { label: 'Role', value: user?.role === 'admin' ? 'Administrator' : 'Collector', icon: <Shield className="w-4 h-4 text-gray-400" /> },
        { label: 'Last Login', value: user?.lastLogin ? format(new Date(user.lastLogin), 'MMM d, yyyy h:mm a') : 'Never', icon: <Calendar className="w-4 h-4 text-gray-400" /> },
        { label: 'Account Status', value: user?.isActive ? 'Active' : 'Inactive', icon: <Shield className="w-4 h-4 text-gray-400" /> },
      ],
    },
    {
      title: 'Languages Spoken',
      icon: <Globe className="w-4 h-4" />,
      isChips: true,
      chips: user?.languages || [],
    },
    {
      title: 'Physical Address',
      icon: <MapPin className="w-4 h-4" />,
      isTextBlock: true,
      textBlock: user?.physicalAddress || 'Not provided',
    },
    {
      title: 'Emergency Contact',
      icon: <HeartPulse className="w-4 h-4 text-rose-500" />,
      fields: [
        { label: 'Full Name', value: user?.emergencyContact?.name || 'Not provided' },
        { label: 'Relationship', value: user?.emergencyContact?.relationship || 'Not provided' },
        { label: 'Phone', value: user?.emergencyContact?.phone || 'Not provided', icon: <Phone className="w-4 h-4 text-gray-400" /> },
      ],
    },
    {
      title: 'Next of Kin',
      icon: <Contact className="w-4 h-4 text-teal-500" />,
      fields: [
        { label: 'Full Name', value: user?.nextOfKin?.name || 'Not provided' },
        { label: 'Relationship', value: user?.nextOfKin?.relationship || 'Not provided' },
        { label: 'Phone', value: user?.nextOfKin?.phone || 'Not provided', icon: <Phone className="w-4 h-4 text-gray-400" /> },
      ],
    },
    {
      title: 'Bio / Professional Notes',
      icon: <FileText className="w-4 h-4" />,
      isTextBlock: true,
      textBlock: user?.bio || 'No bio provided.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">
          View your profile information. Contact an admin to make changes.
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Cover & Avatar */}
        <div className="relative h-32 bg-teal-600">
          <div className="absolute -bottom-12 left-6">
            <div className="relative">
              <img
                src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.firstName}`}
                alt={user?.firstName}
                className="w-24 h-24 rounded-full border-4 border-white bg-white"
              />
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="pt-16 pb-6 px-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
              <p className="text-gray-500">{user?.role === 'admin' ? 'Administrator' : 'Collector'}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                  <Shield className="w-3 h-3" />
                  Active
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-100">
                  <Eye className="w-3 h-3" />
                  Read Only
                </span>
                <span className="text-xs text-gray-400">
                  Member since {user?.createdAt ? format(new Date(user.createdAt), 'MMMM yyyy') : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, idx) => (
          <div key={section.title} className={`border-t border-gray-100 px-6 py-6 ${idx === sections.length - 1 ? '' : ''}`}>
            <div className="flex items-center gap-2 text-gray-700 mb-4">
              <span className="text-gray-400">{section.icon}</span>
              <h3 className="text-sm font-bold uppercase tracking-wide">{section.title}</h3>
            </div>

            {section.isChips && (
              <div className="flex flex-wrap gap-2">
                {section.chips && section.chips.length > 0 ? (
                  section.chips.map((lang) => (
                    <span key={lang} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-100 text-sky-700 border border-sky-200">
                      {lang}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">No languages specified</span>
                )}
              </div>
            )}

            {section.isTextBlock && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{section.textBlock}</p>
            )}

            {section.fields && (
              <div className={`grid grid-cols-1 ${section.fields.length > 4 ? 'md:grid-cols-2' : section.fields.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                {section.fields.map((field) => (
                  <div key={field.label}>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{field.label}</label>
                    <div className="flex items-center gap-2 text-sm text-gray-700 min-h-[24px]">
                      {field.icon && <span>{field.icon}</span>}
                      <span>{field.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
