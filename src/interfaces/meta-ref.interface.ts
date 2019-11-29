import { IMFLocation } from '@modelata/types-fire/lib/angular';

export interface MetaRef {
  attribute: string;
  dao: string;
}

export interface MetaSubCollection {
  dao: string;
  location: Partial<IMFLocation>;
}
