import 'reflect-metadata';

export function getByRef(refAttributeName: string, daoName: string): any {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(
      'observableFromRef',
      {
        attribute: refAttributeName,
        dao: daoName,
      },
      target,
      propertyKey
    );
  };
}
