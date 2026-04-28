import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useData';
import { useI18n } from '@/i18n/useI18n';
import type { User, UserRole } from '@/types';
import { isPrimaryAdmin, API_BASE_URL } from '@/lib/config';
import ProfileModal from '@/components/ProfileModal';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit2,
  UserCheck,
  UserX,
  Phone,
  Building2,
  Shield,
  Users,
  Crown,
  UserCircle,
  ChevronDown,
  Mail,
  Copy,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

/* ──────────────────────────── Main Component ──────────────────────────── */
export default function UserManagement() {
  const { t } = useI18n();
  const { user: currentUser, isPrimaryAdmin: isViewerPrimaryAdmin } = useAuth();
  const { users, addUser, updateUser, toggleUserStatus, clearUsers } = useUsers();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [createdUserResult, setCreatedUserResult] = useState<{
    tempPassword?: string;
    emailSent: boolean;
    emailError?: string;
    userName: string;
    userEmail: string;
  } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [changingRoleUser, setChangingRoleUser] = useState<User | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.phone || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const canEditProfile = (targetUser: User): boolean => {
    if (!currentUser) return false;
    if (currentUser.role !== 'admin') return false;
    if (isPrimaryAdmin(targetUser.email) && !isViewerPrimaryAdmin) return false;
    return true;
  };

  const handleToggleStatus = (user: User) => {
    if (isPrimaryAdmin(user.email)) {
      toast.error(t('users.primaryAdminDeactivateError') || 'The primary administrator cannot be deactivated');
      return;
    }
    toggleUserStatus(user.id);
    toast.success(user.isActive
      ? (t('users.deactivatedSuccess') || 'User deactivated successfully')
      : (t('users.activatedSuccess') || 'User activated successfully')
    );
  };

  const handleRoleChange = (user: User, newRole: UserRole) => {
    if (isPrimaryAdmin(user.email)) {
      toast.error(t('users.primaryAdminRoleError') || 'The primary administrator role cannot be changed');
      setChangingRoleUser(null);
      return;
    }
    updateUser(user.id, { role: newRole });
    toast.success(t('users.roleChangedSuccess', { role: newRole === 'admin' ? t('users.adminFull') : t('users.collectorFull') }));
    setChangingRoleUser(null);
  };

  const handleResendEmail = async (user: User) => {
    if (resendingUserId) return;
    setResendingUserId(user.id);
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': jwtToken ? `Bearer ${jwtToken}` : '',
        },
        body: JSON.stringify({ email: user.email }),
      });
      // Guard against HTML responses
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.error('[Resend] Non-JSON response:', text.substring(0, 200));
        toast.error('Server returned invalid response. Backend may be restarting, try again in 30 seconds.');
        return;
      }
      const result = await res.json();
      if (result.success) {
        if (!result.data.emailSent && result.data.tempPassword) {
          setCreatedUserResult({
            tempPassword: result.data.tempPassword,
            emailSent: false,
            emailError: result.data.emailError,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
          });
        } else {
          toast.success('Welcome email resent successfully');
        }
      } else {
        const errorMsg = result.error?.message || result.error || 'Failed to resend email';
        toast.error(`Email failed: ${errorMsg}`);
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      toast.error(`Network error: ${errorMsg}. Backend may be restarting, try again in 30 seconds.`);
    }
    setResendingUserId(null);
  };

  return (
    <div className="space-y-6 animate-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('users.title')}</h1>
          <p className="text-gray-500 mt-1">{t('users.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (confirm('Clear all locally stored users? Only the primary admin will remain. This cannot be undone.')) {
                await clearUsers();
                toast.success('Local users cleared');
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            {t('users.clearLocal') || 'Clear Local'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 text-white font-semibold text-sm shadow-lg shadow-sky-500/30 hover:bg-sky-600 hover:shadow-sky-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            {t('users.addUser')}
          </button>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              <p className="text-sm text-gray-500">{t('users.totalUsers')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.filter((u) => u.role === 'admin').length}</p>
              <p className="text-sm text-gray-500">{t('users.administrators')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter((u) => u.role === 'collector' || u.role === 'chp').length}
              </p>
              <p className="text-sm text-gray-500">{t('users.collectors')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('users.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          className="px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm text-gray-700"
        >
          <option value="all">{t('users.allRoles')}</option>
          <option value="admin">{t('users.administrators')}</option>
          <option value="collector">{t('users.collectors')}</option>
        </select>
      </div>

      {/* ── Users Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[26%]">
                  {t('users.user')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[11%]">
                  {t('users.role')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[15%]">
                  {t('users.contact')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[16%]">
                  {t('users.facility')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[11%]">
                  {t('common.status')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[14%]">
                  {t('users.lastLogin')}
                </th>
                <th className="w-[7%] px-4 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="group hover:bg-gray-50/60 transition-colors">
                  {/* User Column */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setProfileUser(user)}
                      className="flex items-center gap-3 text-left group/user cursor-pointer"
                    >
                      <div className="relative">
                        <img
                          src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.firstName}${user.lastName}`}
                          alt={`${user.firstName} ${user.lastName}`}
                          className="w-10 h-10 rounded-full bg-gray-100 object-cover ring-2 ring-white group-hover/user:ring-sky-100 transition-all"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white p-0.5">
                          <div className={`w-full h-full rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-900 group-hover/user:text-sky-600 transition-colors truncate">
                            {user.firstName} {user.lastName}
                          </span>
                          {isPrimaryAdmin(user.email) && (
                            <span title={t('users.primaryAdmin')}>
                              <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                    </button>
                  </td>

                  {/* Role Column */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => !isPrimaryAdmin(user.email) && setChangingRoleUser(user)}
                      disabled={isPrimaryAdmin(user.email)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                      } ${isPrimaryAdmin(user.email) ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                    >
                      {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                      {user.role === 'admin' ? t('users.admin') : t('users.collector')}
                      {!isPrimaryAdmin(user.email) && <ChevronDown className="w-2.5 h-2.5" />}
                    </button>
                  </td>

                  {/* Contact Column */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{user.phone || '—'}</span>
                    </div>
                  </td>

                  {/* Facility Column */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{user.assignedFacility || '—'}</span>
                    </div>
                  </td>

                  {/* Status Column */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => handleToggleStatus(user)}
                      disabled={isPrimaryAdmin(user.email)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        user.isActive
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } ${isPrimaryAdmin(user.email) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      {user.isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      {user.isActive ? t('common.active') : t('common.inactive')}
                    </button>
                  </td>

                  {/* Last Login Column */}
                  <td className="px-4 py-3.5 text-gray-500 text-xs">
                    {user.lastLogin ? format(new Date(user.lastLogin), 'MMM d, yyyy') : t('users.never')}
                  </td>

                  {/* Actions Column */}
                  <td className="px-4 py-3.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingUser(user)}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setProfileUser(user)}>
                          <UserCircle className="w-4 h-4 mr-2" />
                          {t('users.viewProfile')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResendEmail(user)}>
                          <Mail className="w-4 h-4 mr-2" />
                          {resendingUserId === user.id ? 'Sending...' : 'Resend Welcome Email'}
                        </DropdownMenuItem>
                        {!isPrimaryAdmin(user.email) && (
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(user)}
                            className={user.isActive ? 'text-rose-600' : 'text-emerald-600'}
                          >
                            {user.isActive ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                            {user.isActive ? t('users.deactivate') : t('users.activate')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">{t('users.noUsers')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('users.adjustSearch')}</p>
          </div>
        )}
      </div>

      {/* ── Profile Modal ── */}
      {profileUser && (
        <ProfileModal
          user={profileUser}
          onClose={() => setProfileUser(null)}
          canEdit={canEditProfile(profileUser)}
          onSave={(data) => {
            updateUser(profileUser.id, data);
            setProfileUser({ ...profileUser, ...data });
            toast.success(t('users.profileUpdated') || 'Profile updated successfully');
          }}
        />
      )}

      {/* ── Add User Modal ── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('users.addNewUser')}</DialogTitle>
            <DialogDescription>{t('users.registerDesc')}</DialogDescription>
          </DialogHeader>
          <AddUserForm
            onSubmit={async (data) => {
              // Call backend API to create user with email delivery
              const jwtToken = localStorage.getItem('healthtrack_jwt_token');
              try {
                const res = await fetch(`${API_BASE_URL}/api/v1/users`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': jwtToken ? `Bearer ${jwtToken}` : '',
                  },
                  body: JSON.stringify({
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    phone: data.phone,
                    role: data.role,
                    assignedFacility: data.assignedFacility,
                  }),
                });
                // Guard against HTML responses (wrong domain, 404 pages, etc.)
                const contentType = res.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                  const text = await res.text();
                  console.error('[AddUser] Non-JSON response:', text.substring(0, 200));
                  toast.error('Server returned invalid response. Check API connection.');
                  return;
                }
                const result = await res.json();
                if (result.success) {
                  // Store MongoDB _id as local id so resend works correctly
                  addUser({
                    id: result.data.user._id || result.data.user.id,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    phone: data.phone,
                    role: data.role,
                    isActive: true,
                    assignedFacility: data.assignedFacility,
                  } as any);
                  setShowAddModal(false);
                  if (!result.data.emailSent && result.data.tempPassword) {
                    setCreatedUserResult({
                      tempPassword: result.data.tempPassword,
                      emailSent: false,
                      emailError: result.data.emailError,
                      userName: `${data.firstName} ${data.lastName}`,
                      userEmail: data.email,
                    });
                  } else if (result.data.emailSent) {
                    toast.success(t('users.userCreatedEmailSent') || 'User created and welcome email sent');
                  } else {
                    toast.success(t('users.userCreated') || 'User created successfully');
                  }
                } else {
                  toast.error(result.error?.message || 'Failed to create user');
                }
              } catch (err: any) {
                const errorMsg = err?.message || String(err);
                console.error('[AddUser] API error:', errorMsg);
                toast.error(`Server connection failed: ${errorMsg}. Backend may be restarting, try again in 30 seconds.`);
              }
            }}
            onCancel={() => setShowAddModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit User Modal ── */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('users.editUser')}</DialogTitle>
            <DialogDescription>{t('users.updateDesc')}</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <EditUserForm
              user={editingUser}
              onSubmit={(data) => {
                updateUser(editingUser.id, data);
                setEditingUser(null);
                toast.success(t('users.userUpdated') || 'User updated successfully');
              }}
              onCancel={() => setEditingUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Change Role Modal ── */}
      <Dialog open={!!changingRoleUser} onOpenChange={() => setChangingRoleUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('users.changeRole')}</DialogTitle>
            <DialogDescription>
              {t('users.selectRoleFor')} {changingRoleUser?.firstName} {changingRoleUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <button
              onClick={() => changingRoleUser && handleRoleChange(changingRoleUser, 'admin')}
              className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                changingRoleUser?.role === 'admin'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">{t('users.adminFull')}</p>
                <p className="text-xs text-gray-500">{t('users.adminDesc')}</p>
              </div>
            </button>
            <button
              onClick={() => changingRoleUser && handleRoleChange(changingRoleUser, 'collector')}
              className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                changingRoleUser?.role === 'collector' || changingRoleUser?.role === 'chp'
                  ? 'border-sky-500 bg-sky-50'
                  : 'border-gray-200 hover:border-sky-300'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-sky-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">{t('users.collectorFull')}</p>
                <p className="text-xs text-gray-500">{t('users.collectorDesc')}</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Created User Confirmation Modal (shows temp password if email failed) ── */}
      <Dialog open={!!createdUserResult} onOpenChange={() => setCreatedUserResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                <Mail className="w-4 h-4 text-amber-600" />
              </div>
              {createdUserResult?.emailSent ? 'User Created' : 'Email Delivery Issue'}
            </DialogTitle>
            <DialogDescription>
              {createdUserResult?.emailSent
                ? `${createdUserResult.userName} has been created and the welcome email was sent to ${createdUserResult.userEmail}.`
                : `The welcome email could not be sent to ${createdUserResult?.userEmail}. Please share the temporary password below securely with the user.`}
            </DialogDescription>
          </DialogHeader>
          {createdUserResult && !createdUserResult.emailSent && (
            <div className="mt-4 space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400 mb-2">Temporary Password</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-xl font-mono font-bold text-white tracking-widest">
                    {createdUserResult.tempPassword}
                  </code>
                  <CopyTempPasswordButton password={createdUserResult.tempPassword || ''} />
                </div>
              </div>
              {createdUserResult.emailError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-600">{createdUserResult.emailError}</p>
                </div>
              )}
              <p className="text-xs text-gray-500 text-center">
                The system will retry sending this email automatically. You can also resend from the user dropdown menu.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Copy Temp Password Button ─── */
function CopyTempPasswordButton({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

/* ═══════════════════════════ Add User Form ═══════════════════════════ */

interface AddUserFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

function AddUserForm({ onSubmit, onCancel }: AddUserFormProps) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'collector' as UserRole,
    assignedFacility: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.firstName')} *</label>
          <input
            type="text"
            required
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
            placeholder="John"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.lastName')} *</label>
          <input
            type="text"
            required
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
            placeholder="Doe"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.email')} *</label>
        <input
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
          placeholder="john.doe@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.phoneNumber')}</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
          placeholder="+254 7XX XXX XXX"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.roleLabel')}</label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm bg-white"
        >
          <option value="collector">{t('users.collectorFull')}</option>
          <option value="admin">{t('users.adminFull')}</option>
        </select>
      </div>

      {(formData.role === 'collector' || formData.role === 'chp') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.assignedFacility')}</label>
          <input
            type="text"
            value={formData.assignedFacility}
            onChange={(e) => setFormData({ ...formData, assignedFacility: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
            placeholder={t('users.facilityPlaceholder')}
          />
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
        >
          {t('users.addUser')}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════ Edit User Form ═══════════════════════════ */

interface EditUserFormProps {
  user: User;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

function EditUserForm({ user, onSubmit, onCancel }: EditUserFormProps) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone || '',
    assignedFacility: user.assignedFacility || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.firstName')}</label>
          <input
            type="text"
            required
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.lastName')}</label>
          <input
            type="text"
            required
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.email')}</label>
        <input
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.phoneNumber')}</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
        />
      </div>

      {(user.role === 'collector' || user.role === 'chp') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.assignedFacility')}</label>
          <input
            type="text"
            value={formData.assignedFacility}
            onChange={(e) => setFormData({ ...formData, assignedFacility: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
          />
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
        >
          {t('users.saveChanges')}
        </button>
      </div>
    </form>
  );
}
