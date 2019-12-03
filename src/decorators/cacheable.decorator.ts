import * as Flatted from 'flatted';
import 'reflect-metadata';
import { Observable, ReplaySubject } from 'rxjs';
import { MFCache } from './../mf-cache';
import { MFDao } from './../mf-dao';



function jsonify(obj: Object) {
  const seen: any[] = [];
  try {
    return JSON.stringify(obj, (key, val) => {
      if (val !== null && typeof val === 'object') {
        if (val.ref && val.ref.path && val.ref.id) {
          return `firestore reference on /${val.ref.path}`;
        }

        if (seen.indexOf(val) >= 0) {
          if (val.path && val.id) {
            return `${val.path}/${val.id}`;
          }
          return 'cycle';
        }
        seen.push(val);
      }
      return val;
    });
  } catch (e) {
    return Flatted.stringify(obj);
  }
}

function getCacheId(service: MFDao<any>, methodName: string, params: any[]): string {
  return `dao(${service.mustachePath}).${methodName}(${jsonify({ params })})`;
}

export function DisableCache(target: Object) {
  Reflect.defineMetadata('cacheable', false, target);
}

export function Cacheable(
  targetClass: MFDao<any>,
  methodName: string,
  propertyDesciptor: PropertyDescriptor
): PropertyDescriptor {

  const originalMethod: (...args: any[]) => Observable<any> = propertyDesciptor.value;

  propertyDesciptor.value = function (...args: any[]) {

    if (typeof (this as any).cacheable === 'boolean' ? (this as any).cacheable : true) {

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
        const cacheId = getCacheId(this as any, methodName, args);
        if (!MFCache.cache[cacheId]) {
          const subject = new ReplaySubject(1);
          MFCache.cache[cacheId] = {
            subject,
            subscription: originalMethod.apply(this, args).subscribe(doc => subject.next(doc))
          };
        }
        return MFCache.cache[cacheId].subject;
      }
    }
    return originalMethod.apply(this, args);
  };
  return propertyDesciptor;
}
