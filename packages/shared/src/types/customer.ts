export interface Customer {
  id: string;
  code1C: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  city: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
