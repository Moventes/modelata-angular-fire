import { MFDao } from 'mf-dao';
import { Observable, ReplaySubject } from 'rxjs';
import { MFCache } from 'mf-cache';

function addDecycleOnJSON() {
  if (typeof (<any>JSON).decycle !== 'function') {
    (<any>JSON).decycle = function decycle(object: any, replacer: any) {
      const objects = new WeakMap();
      return (function derez(value, path) {
        // tslint:disable-next-line: variable-name
        let old_path;
        let nu: any;
        if (replacer !== undefined) {
          // tslint:disable-next-line: no-parameter-reassignment
          value = replacer(value);
        }
        if (
          typeof value === 'object' &&
          value !== null &&
          !(value instanceof Boolean) &&
          !(value instanceof Date) &&
          !(value instanceof Number) &&
          !(value instanceof RegExp) &&
          !(value instanceof String)
        ) {
          old_path = objects.get(value);
          if (old_path !== undefined) {
            return { $ref: old_path };
          }
          objects.set(value, path);
          if (Array.isArray(value)) {
            nu = [];
            value.forEach((element, i) => {
              nu[i] = derez(element, `${path}[${i}]`);
            });
          } else {
            nu = {};
            Object.keys(value).forEach((name) => {
              if (value.hasOwnProperty(name)) {
                nu[name] = derez(value[name], `${path}[${JSON.stringify(name)}]`);
              }
            });
          }
          return nu;
        } if (typeof value !== 'function') {
          return value;
        }
        return null;

      })(object, '$');
    };
  }
}

function getCacheId(targetClass: MFDao<any>, methodName: string, params: any[]): string {
  addDecycleOnJSON();
  return `dao(${targetClass.mustachePath}).${methodName}(${JSON.stringify((<any>JSON).decycle({ params }))})`;
}


export function Cacheable() {
  return (
    targetClass: MFDao<any>,
    methodName: string,
    propertyDesciptor: PropertyDescriptor): PropertyDescriptor => {
    if (targetClass.cacheable) {
      const originalMethod: (...args: any[]) => Observable<any> = propertyDesciptor.value;

      propertyDesciptor.value = function (...args: any[]) {

        const lastArgument = args.length ? args[args.length - 1] : null;

        const cachableIsDisabled = lastArgument &&
          typeof lastArgument === 'object' &&
          (
            (
              typeof (lastArgument as any).cacheable === 'boolean' &&
              (lastArgument as any).cacheable === false
            ) ||
            (lastArgument as any).completeOnFirst === true
          );

        if (!cachableIsDisabled) {
          const cacheId = getCacheId(targetClass, methodName, args);
          if (!MFCache.cache[cacheId]) {
            const subject = new ReplaySubject(1);
            MFCache.cache[cacheId] = {
              subject,
              subscription: originalMethod.apply(this, args).subscribe(doc => subject.next(doc))
            };
          }
          return MFCache.cache[cacheId].subject;
        }
        return originalMethod.apply(this, args);
      };
      return propertyDesciptor;
    }
  };
}
