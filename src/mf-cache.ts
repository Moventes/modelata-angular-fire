import { Observable, ReplaySubject, Subscription } from 'rxjs';

export class MFCache {
  private clearAllCacheSub: Subscription;
  public readonly cache: {
    [methodId: string]: {
      subscription: Subscription,
      subject: ReplaySubject<any>
    }
  } = {};

  constructor(public readonly cacheable = true) { }

  private clearCache() {
    Object.entries(this.cache).forEach(([cacheId, sub]) => {
      if (sub.subscription) { sub.subscription.unsubscribe(); }
      delete this.cache[cacheId];
    });
  }

  protected setClearCacheObservable(clearAllCacheAndSubscription$: Observable<any>) {
    if (this.clearAllCacheSub) {
      this.clearAllCacheSub.unsubscribe();
    }
    this.clearAllCacheSub = clearAllCacheAndSubscription$.subscribe(() => this.clearCache());
  }
}
