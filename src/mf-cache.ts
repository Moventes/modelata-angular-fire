import { Observable, ReplaySubject, Subscription } from 'rxjs';

/**
 * Abstract class providing logic to handle cache
 */
export abstract class MFCache {
  /**
   * local cache store
   */
  static readonly cache: {
    [methodId: string]: {
      subscription: Subscription,
      subject: ReplaySubject<any>
    }
  } = {};

  /**
   *
   */
  static clearAllCacheSub: Subscription;

  /**
   *
   */
  private clearCacheSub: Subscription;

  /**
   * Mustache collection path
   */
  protected mustachePath: string;

  /**
   *
   */
  constructor() {
  }

  /**
   * Clear local cache
   */
  static clearAllMFCache(): void {
    Object.entries(MFCache.cache).forEach(([cacheId, sub]) => {
      if (sub.subscription) {
        sub.subscription.unsubscribe();
      }
      delete MFCache.cache[cacheId];
    });
  }

  /**
   *
   * @param clearAllCacheAndSubscription$
   */
  static setClearAllCacheObservable(clearAllCacheAndSubscription$: Observable<any>): void {
    if (MFCache.clearAllCacheSub) {
      MFCache.clearAllCacheSub.unsubscribe();
    }
    MFCache.clearAllCacheSub = clearAllCacheAndSubscription$.subscribe(() => MFCache.clearAllMFCache());
  }

  /**
   *
   */
  private clearCache(): void {
    Object.entries(MFCache.cache).forEach(([cacheId, sub]) => {
      if (cacheId.startsWith(`dao(${this.mustachePath})`)) {
        if (sub.subscription) { sub.subscription.unsubscribe(); }
        delete MFCache.cache[cacheId];
      }
    });
  }

  /**
   *
   * @param clearCacheAndSubscription$
   */
  protected setClearCacheObservable(clearCacheAndSubscription$: Observable<any>): void {
    if (this.clearCacheSub) {
      this.clearCacheSub.unsubscribe();
    }
    this.clearCacheSub = clearCacheAndSubscription$.subscribe(() => this.clearCache());
  }


}
