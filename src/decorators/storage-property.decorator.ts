import 'reflect-metadata';
import { IMFStorageOptions } from '../interfaces/storage-options.interface';

export function StorageProperty(options: IMFStorageOptions): any {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(
      'storageProperty',
      options,
      target,
      propertyKey
    );
  };
}
