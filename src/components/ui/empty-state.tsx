import { FolderOpen, Plus, UserPlus, FileText } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: 'folder' | 'users' | 'records';
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  icon = 'folder',
  actionLabel,
  onAction
}: EmptyStateProps) {
  const Icon = {
    folder: FolderOpen,
    users: UserPlus,
    records: FileText,
  }[icon];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-muted-foreground/50" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyPatientsState({ onAdd }: { onAdd?: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t('empty.noPatients')}
      description={t('patients.collectorsWillRegister')}
      icon="users"
      actionLabel={t('patients.addPatient')}
      onAction={onAdd}
    />
  );
}

export function EmptyRecordsState({ onAdd }: { onAdd?: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t('empty.noMedicalRecords')}
      description="Medical records you create will appear here. Select a patient to add their first record."
      icon="records"
      actionLabel={t('medical.addRecord')}
      onAction={onAdd}
    />
  );
}

export function EmptyReferralsState() {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t('empty.noReferrals')}
      description="Patient referrals will appear here once they are created in the system."
      icon="folder"
    />
  );
}
