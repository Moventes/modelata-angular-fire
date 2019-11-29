import { IMFGetListOptions } from '@modelata/types-fire/lib/angular';

export interface MetaRef {
  attributeName: string;
  daoName: string;
}

export interface MetaSubCollection<M = any> {
  daoName: string;
  collectionName: string;
  options?: IMFGetListOptions<M>;
}
