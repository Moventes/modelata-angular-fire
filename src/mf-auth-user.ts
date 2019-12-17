import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFirestore } from '@angular/fire/firestore';
import { IMFLocation, IMFUpdateOptions } from '@modelata/fire';
import { User as FirebaseUser } from 'firebase/app';
import 'reflect-metadata';
import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, switchMap } from 'rxjs/operators';
import { MFRegisterOptions } from './interfaces/register-options.interface';
import { MFCache } from './mf-cache';
import { MFDao } from './mf-dao';
import { MFFlattableDao } from './mf-flattable-dao';
import { MFModel } from './mf-model';

export enum loggin_error {
  INVALID_EMAIL = 'auth/invalid-email',
  INVALID_PASSWORD = 'auth/wrong-password',
  USER_DISABLED = 'auth/user-disabled',
  USER_NOT_FOUND = 'auth/user-not-found'
}

export interface IMFAuthUser {
  email: string;
}


export abstract class MFAuthUser<M extends MFModel<M> & IMFAuthUser> {

  public readonly verificationMustacheLink: string = Reflect.getMetadata('verificationMustacheLink', this.constructor);

  private authUser$ = this.auth.authState.pipe(
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  constructor(
    protected db: AngularFirestore,
    protected auth: AngularFireAuth,
    protected userDao: MFDao<M> | MFFlattableDao<M>
  ) {

    // clear all cache when auth user change
    MFCache.setClearAllCacheObservable(this.authUser$.pipe(
      distinctUntilChanged((previousUser, newUser) => {
        const connect = !previousUser && !!newUser;
        const disconnect = !!previousUser && !newUser;
        const change = !!previousUser && !!newUser && previousUser.uid !== newUser.uid;
        return !(connect || disconnect || change);
      })
    ));
  }


  public getAuthUser(): Observable<FirebaseUser> {
    return this.authUser$;
  }


  public get(subLocation?: Partial<IMFLocation>): Observable<M> {
    return this.authUser$
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

  private sendVerificationEmail(cred: firebase.auth.UserCredential, continueUrl?: string): Promise<void> {
    const mustacheUrl = continueUrl || this.verificationMustacheLink;
    if (mustacheUrl && mustacheUrl.length) {
      const url = mustacheUrl.replace('{userId}', cred.user.uid);
      return cred.user.sendEmailVerification({ url });
    }
    return Promise.resolve();
  }

  public register(user: M, password: string, options?: MFRegisterOptions): Promise<M> {
    return this.auth.auth.createUserWithEmailAndPassword(user.email, password)
      .then(credential => Promise.all([
        this.userDao.create(user, credential.user.uid),
        options && typeof options.sendVerificationEmail === 'boolean' && !options.sendVerificationEmail ?
          Promise.resolve() :
          this.sendVerificationEmail(credential)
      ])
        .then(([user]) => user));
  }

  public setSessionPersistence(persistence: 'local' | 'session' | 'none'): Promise<void> {
    return this.auth.auth.setPersistence(persistence);
  }

  public isConnected(): Observable<boolean> {
    return this.authUser$
      .pipe(
        map(user => !!user)
      );
  }

  public logout(): Promise<void> {
    return this.auth.auth.signOut();
  }

  public update(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
    return this.userDao.update(data, location, options);
  }


}
