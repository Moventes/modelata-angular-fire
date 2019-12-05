import 'reflect-metadata';

export function getByRef(attributeName: string, daoName: string): any {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(
      'observableFromRef',
      {
        attributeName,
        daoName,
      },
      target,
      propertyKey
    );
  };
}
