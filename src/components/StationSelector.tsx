/**
 * StationSelector v2 — Redesigned with radio-card pattern and strong visual hierarchy
 *
 * UX improvements:
 *   - Radio-card selection (clear selected vs unselected state)
 *   - Color-coded type badges with icons
 *   - Better spacing and visual separation between groups
 *   - Hover lift effect for interactivity
 *   - Services tag chips for extra context
 *   - Skeleton loader during fetch
 */

import { useState, useEffect } from 'react';
import {
  Building2, Home, MapPin, Check,
} from 'lucide-react';
import type { Station } from '@/types';

interface StationSelectorProps {
  value?: string;
  onChange: (stationId: string, stationName: string, stationType: 'household' | 'hip' | 'referral-center') => void;
  filterType?: 'household' | 'hip' | 'referral-center';
  label?: string;
}

const TYPE_META: Record<string, {
  icon: typeof MapPin;
  accent: string;
  bg: string;
  border: string;
  text: string;
  ring: string;
  label: string;
}> = {
  household: {
    icon: Home,
    accent: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    ring: 'ring-emerald-400',
    label: 'Household',
  },
  hip: {
    icon: MapPin,
    accent: 'bg-sky-500',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    ring: 'ring-sky-400',
    label: 'HIP (Health Information Point)',
  },
  'referral-center': {
    icon: Building2,
    accent: 'bg-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    ring: 'ring-amber-400',
    label: 'Referral Center',
  },
};

export default function StationSelector({
  value,
  onChange,
  filterType,
  label = 'Destination Station',
}: StationSelectorProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    setLoading(true);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const headers: Record<string, string> = {};
      if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
      const res = await fetch('/api/v1/stations', { headers });
      if (res.ok) {
        const result = await res.json();
        const all = result.data?.stations || [];
        setStations(filterType ? all.filter((s: Station) => s.type === filterType) : all);
      } else {
        setStations(getDefaultStations());
      }
    } catch {
      setStations(getDefaultStations());
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  const grouped = stations.reduce<Record<string, Station[]>>((acc, s) => {
    if (!acc[s.type]) acc[s.type] = [];
    acc[s.type].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {label && (
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-xs text-destructive">*</span>
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(grouped).map(([type, typeStations]) => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          return (
            <div key={type} className="space-y-2">
              {/* Group header with accent bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-1 h-5 rounded-full ${meta.accent}`} />
                <Icon className={`w-3.5 h-3.5 ${meta.text}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {meta.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {typeStations.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {typeStations.map((station) => {
                  const isSelected = value === station.id;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() =>
                        onChange(station.id, station.name, station.type as 'household' | 'hip' | 'referral-center')
                      }
                      className={`
                        group relative flex items-start gap-3 p-3.5 rounded-xl border-2 text-left
                        transition-all duration-200 ease-out
                        ${isSelected
                          ? `${meta.border} ${meta.bg} shadow-sm`
                          : 'border-border/60 bg-card hover:border-border hover:shadow-sm hover:-translate-y-0.5'
                        }
                      `}
                    >
                      {/* Selection indicator dot */}
                      <div className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all
                        ${isSelected
                          ? `${meta.accent} border-transparent`
                          : 'border-muted-foreground/30 group-hover:border-muted-foreground/50'
                        }
                      `}>
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? meta.text : 'text-foreground'}`}>
                          {station.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {station.county}
                          {station.ward && station.ward !== station.county ? ` · ${station.ward}` : ''}
                        </p>
                        {/* Services chips */}
                        {station.services && station.services.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {station.services.slice(0, 3).map((svc) => (
                              <span
                                key={svc}
                                className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground capitalize"
                              >
                                {svc.replace('-', ' ')}
                              </span>
                            ))}
                            {station.services.length > 3 && (
                              <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                                +{station.services.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Selected glow ring */}
                      {isSelected && (
                        <div className={`absolute inset-0 rounded-xl ring-2 ${meta.ring} ring-offset-1 pointer-events-none`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDefaultStations(): Station[] {
  return [
    { id: 'hh-gen', name: 'Household (General)', type: 'household', code: 'HH-GEN', county: 'Kilifi', isActive: true, services: ['screening', 'referral'], createdAt: new Date(), updatedAt: new Date() },
    { id: 'hip-bom', name: 'HIP - Bomani', type: 'hip', code: 'HIP-BOM', county: 'Kilifi', subCounty: 'Magarini', ward: 'Bomani', isActive: true, services: ['screening', 'basic-treatment', 'referral'], createdAt: new Date(), updatedAt: new Date() },
    { id: 'hip-mar', name: 'HIP - Marereni', type: 'hip', code: 'HIP-MAR', county: 'Kilifi', subCounty: 'Magarini', ward: 'Marereni', isActive: true, services: ['screening', 'basic-treatment', 'referral'], createdAt: new Date(), updatedAt: new Date() },
    { id: 'rc-bom', name: 'Bomani Dispensary', type: 'referral-center', code: 'RC-BOM', county: 'Kilifi', subCounty: 'Magarini', ward: 'Bomani', isActive: true, services: ['outpatient', 'maternity', 'lab', 'pharmacy', 'referral'], createdAt: new Date(), updatedAt: new Date() },
    { id: 'rc-kgh', name: 'Kilifi General Hospital', type: 'referral-center', code: 'RC-KGH', county: 'Kilifi', subCounty: 'Kilifi Central', ward: 'Kilifi', isActive: true, services: ['emergency', 'surgery', 'maternity', 'pediatrics', 'lab', 'radiology', 'pharmacy', 'referral'], createdAt: new Date(), updatedAt: new Date() },
    { id: 'rc-msk', name: 'Mariakani Sub-County Hospital', type: 'referral-center', code: 'RC-MSK', county: 'Kilifi', subCounty: 'Mariakani', ward: 'Mariakani', isActive: true, services: ['outpatient', 'maternity', 'lab', 'pharmacy', 'referral'], createdAt: new Date(), updatedAt: new Date() },
  ];
}
