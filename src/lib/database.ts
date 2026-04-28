// Database layer using localStorage for persistence
// All data changes are saved to localStorage and survive page refreshes

const DB_KEYS = {
  USERS: 'healthtrack_users',
  PATIENTS: 'healthtrack_patients',
  MEDICAL_RECORDS: 'healthtrack_medical_records',
  FACILITIES: 'healthtrack_facilities',
  ACTIVITY_LOGS: 'healthtrack_activity_logs',
  INITIALIZED: 'healthtrack_initialized',
} as const;

// Generic CRUD operations
class Database<T extends { id: string }> {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  // Get all items
  getAll(): T[] {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Get item by ID
  getById(id: string): T | undefined {
    const items = this.getAll();
    return items.find(item => item.id === id);
  }

  // Create item
  create(item: T): T {
    const items = this.getAll();
    // Add timestamps if not present
    const newItem = {
      ...item,
      createdAt: (item as any).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.push(newItem as T);
    this.save(items);
    return newItem as T;
  }

  // Update item
  update(id: string, updates: Partial<T>): T | null {
    const items = this.getAll();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    items[index] = {
      ...items[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save(items);
    return items[index];
  }

  // Delete item
  delete(id: string): boolean {
    const items = this.getAll();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) return false;
    this.save(filtered);
    return true;
  }

  // Save all items
  save(items: T[]): void {
    localStorage.setItem(this.key, JSON.stringify(items));
  }

  // Reset/clear all data
  clear(): void {
    localStorage.removeItem(this.key);
  }
}

// Initialize database with default data if not already initialized
export function initializeDatabase(defaultData: {
  users: any[];
  facilities: any[];
}) {
  const initialized = localStorage.getItem(DB_KEYS.INITIALIZED);
  
  if (!initialized) {
    // First time - save default data
    usersDB.save(defaultData.users);
    facilitiesDB.save(defaultData.facilities);
    localStorage.setItem(DB_KEYS.INITIALIZED, 'true');
  }
}

// Database instances
export const usersDB = new Database<any>(DB_KEYS.USERS);
export const patientsDB = new Database<any>(DB_KEYS.PATIENTS);
export const medicalRecordsDB = new Database<any>(DB_KEYS.MEDICAL_RECORDS);
export const facilitiesDB = new Database<any>(DB_KEYS.FACILITIES);
export const activityLogsDB = new Database<any>(DB_KEYS.ACTIVITY_LOGS);

// Reset entire database (for testing)
export function resetDatabase() {
  Object.values(DB_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  window.location.reload();
}

// Export DB keys for reference
export { DB_KEYS };
