import * as Flatted from 'flatted';
import { Observable, ReplaySubject } from 'rxjs';
import { MFCache } from './../mf-cache';
import { MFDao } from './../mf-dao';
import 'reflect-metadata';



function getCacheId(targetClass: MFDao<any>, methodName: string, params: any[]): string {
  return `dao(${targetClass.mustachePath}).${methodName}(${Flatted.stringify({ params })})`;
}

export function NoCache() {
  return (target: Object) => {
    Reflect.defineMetadata('cacheable', false, target);
  };
}


export function Cacheable() {
  return (
    targetClass: MFDao<any>,
    methodName: string,
    propertyDesciptor: PropertyDescriptor): PropertyDescriptor => {
    if (targetClass.isCacheable()) {
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
