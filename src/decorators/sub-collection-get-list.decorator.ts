import { IMFGetListOptions } from '@modelata/types-fire/lib/angular';
import 'reflect-metadata';

export function SubCollectionGetList<M = any>(collectionName: string, daoName: string, options?: IMFGetListOptions<M>): any {
    return (target: any, propertyKey: string) => {
        Reflect.defineMetadata(
            'observableFromSubCollection',
            {
                collectionName,
                daoName,
                options,
            },
            target,
            propertyKey
        );
    };
}
