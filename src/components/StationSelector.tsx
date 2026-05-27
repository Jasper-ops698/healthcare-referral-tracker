/**
 * StationSelector — Allows collectors to select their working station
 *
 * Stations: Household, HIP (Health Information Point), Referral Center
 * (Bomani Dispensary, Kilifi General Hospital, etc.)
 */

import { useState, useEffect } from 'react';
import { Building2, Home, MapPin, Check, Loader2 } from 'lucide-react';
import type { Station } from '@/types';

interface StationSelectorProps {
  value?: string;
  onChange: (stationId: string, stationName: string, stationType: 'household' | 'hip' | 'referral-center') => void;
  filterType?: 'household' | 'hip' | 'referral-center';
  label?: string;
}

const typeIcons = {
  household: Home,
  hip: MapPin,
  'referral-center': Building2,
};

const typeLabels = {
  household: 'Household',
  hip: 'HIP (Health Information Point)',
  'referral-center': 'Referral Center',
};

const typeColors = {
  household: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  hip: 'bg-blue-50 border-blue-200 text-blue-800',
  'referral-center': 'bg-amber-50 border-amber-200 text-amber-800',
};

export default function StationSelector({ value, onChange, filterType, label = 'Select Station' }: StationSelectorProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    setLoading(true);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const res = await fetch('/api/v1/stations', {
        headers: jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        const allStations = result.data?.stations || [];
        setStations(filterType ? allStations.filter((s: Station) => s.type === filterType) : allStations);
      } else {
        // Fallback: use default stations if API fails
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading stations...
      </div>
    );
  }

  // Group by type
  const grouped = stations.reduce<Record<string, Station[]>>((acc, s) => {
    if (!acc[s.type]) acc[s.type] = [];
    acc[s.type].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>

      <div className="space-y-3">
        {Object.entries(grouped).map(([type, typeStations]) => {
          const Icon = typeIcons[type as keyof typeof typeIcons];
          return (
            <div key={type}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {typeLabels[type as keyof typeof typeLabels]}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {typeStations.map((station) => (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => onChange(station.id, station.name, station.type as 'household' | 'hip' | 'referral-center')}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      value === station.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${typeColors[station.type as keyof typeof typeColors]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{station.name}</p>
                      <p className="text-xs text-muted-foreground">{station.county}{station.ward ? ` • ${station.ward}` : ''}</p>
                    </div>
                    {value === station.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
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
