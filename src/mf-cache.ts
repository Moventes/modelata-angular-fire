import { Observable, ReplaySubject, Subscription } from 'rxjs';
import 'reflect-metadata';

export class MFCache {

  static readonly cache: {
    [methodId: string]: {
      subscription: Subscription,
      subject: ReplaySubject<any>
    }
  } = {};

  static clearAllCacheSub: Subscription;
  private clearCacheSub: Subscription;

  protected mustachePath: string;

  constructor() {
  }


  static clearAllMFCache() {
    Object.entries(MFCache.cache).forEach(([cacheId, sub]) => {
      if (sub.subscription) { sub.subscription.unsubscribe(); }
      delete MFCache.cache[cacheId];
    });
  }

  static setClearAllCacheObservable(clearAllCacheAndSubscription$: Observable<any>) {
    if (MFCache.clearAllCacheSub) {
      MFCache.clearAllCacheSub.unsubscribe();
    }
    MFCache.clearAllCacheSub = clearAllCacheAndSubscription$.subscribe(() => MFCache.clearAllMFCache());
  }

  public isCacheable() {
    return Reflect.hasMetadata('cacheable', this) ? Reflect.getMetadata('cacheable', this) : true;
  }

  private clearCache() {
    Object.entries(MFCache.cache).forEach(([cacheId, sub]) => {
      if (cacheId.startsWith(`dao(${this.mustachePath})`)) {
        if (sub.subscription) { sub.subscription.unsubscribe(); }
        delete MFCache.cache[cacheId];
      }
    });
  }

  protected setClearCacheObservable(clearCacheAndSubscription$: Observable<any>) {
    if (this.clearCacheSub) {
      this.clearCacheSub.unsubscribe();
    }
    this.clearCacheSub = clearCacheAndSubscription$.subscribe(() => this.clearCache());
  }


}
