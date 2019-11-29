import { IMFLocation } from '@modelata/types-fire';
import 'reflect-metadata';

export function SubCollectionGetList(daoName: string, location: Partial<IMFLocation>): any {
    return (target: any, propertyKey: string) => {
        Reflect.defineMetadata(
            'observableFromSubCollection',
            {
                location,
                dao: daoName,
            },
            target,
            propertyKey
        );
    };
}
