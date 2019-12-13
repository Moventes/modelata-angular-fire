import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFirestore } from '@angular/fire/firestore';
import { IMFLocation } from '@modelata/fire';
import { User as FirebaseUser } from 'firebase/app';
import { MFDao } from 'mf-dao';
import { MFFlattableDao } from 'mf-flattable-dao';
import { MFModel } from 'mf-model';
import 'reflect-metadata';
import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { Cacheable } from './decorators/cacheable.decorator';
import { MFCache } from './mf-cache';

export enum loggin_error {
  INVALID_EMAIL = 'auth/invalid-email',
  INVALID_PASSWORD = 'auth/wrong-password',
  USER_DISABLED = 'auth/user-disabled',
  USER_NOT_FOUND = 'auth/user-not-found'
}

export abstract class MFAuthUser<M extends MFModel<M>> extends MFCache {

  private firebaseUser$: Observable<FirebaseUser> = this.auth.authState;

  public readonly mustachePath: string = this.userDao.mustachePath;
  public readonly cacheable: boolean = true;
  public readonly verificationMustacheLink: string = Reflect.getMetadata('verificationMustacheLink', this.constructor);


  constructor(
    protected db: AngularFirestore,
    protected auth: AngularFireAuth,
    protected userDao: MFDao<M> | MFFlattableDao<M>
  ) {
    super();

    // clear all cache when auth user change
    MFCache.setClearAllCacheObservable(this.firebaseUser$.pipe(
      distinctUntilChanged((previousUser, newUser) => {
        const connect = !previousUser && !!newUser;
        const disconnect = !!previousUser && !newUser;
        const change = !!previousUser && !!newUser && previousUser.uid !== newUser.uid;
        return !(connect || disconnect || change);
      })
    ));
  }


  @Cacheable
  protected getAuthUser(): Observable<FirebaseUser> {
    return this.firebaseUser$;
  }


  @Cacheable
  public get(subLocation?: Partial<IMFLocation>): Observable<M> {
    return this.firebaseUser$
      .pipe(
        switchMap((firebaseUser) => {
          if (firebaseUser) {
            return this.userDao.get(
              subLocation ?
                ({ ...subLocation, id: firebaseUser.uid }) :
                firebaseUser.uid
            );
          }
          return of(null);
        })
      );
  }

  public login(email: string, password: string): Promise<firebase.auth.UserCredential> {
    return this.auth.auth.signInWithEmailAndPassword(email, password)
      .catch(error => Promise.reject(error.code as loggin_error));
  }

  private sendVerificationEmail(cred: firebase.auth.UserCredential): Promise<void> {
    if (this.verificationMustacheLink && this.verificationMustacheLink.length) {
      const url = this.verificationMustacheLink.replace('{userId}', cred.user.uid);
      return cred.user.sendEmailVerification({ url });
    }
    return Promise.resolve();
  }

  public register(user: M, password: string): Promise<M> {
    return this.auth.auth.createUserWithEmailAndPassword(user.email, password)
      .then(credential => Promise.all([
        this.userDao.create(user, credential.user.uid),
        this.sendVerificationEmail(credential)
      ]).then(([user]) => user));
  }

  public setSessionPersistence(persistence: 'local' | 'session' | 'none'): Promise<void> {
    return this.auth.auth.setPersistence(persistence);
  }

  public isConnected(): Observable<boolean> {
    return this.firebaseUser$
      .pipe(
        map(user => !!user)
      );
  }

  public logout(): Promise<void> {
    return this.auth.auth.signOut();
  }

}
