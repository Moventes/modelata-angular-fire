import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFirestore } from '@angular/fire/firestore';
import { IMFLocation, IMFUpdateOptions } from '@modelata/fire/lib/angular';
import { User as FirebaseUser } from 'firebase/app';
import 'reflect-metadata';
import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, switchMap } from 'rxjs/operators';
import { MFRegisterOptions } from './interfaces/register-options.interface';
import { MFCache } from './mf-cache';
import { MFDao } from './mf-dao';
import { MFFlattableDao } from './mf-flattable-dao';
import { MFModel } from './mf-model';

/**
 * Errors that can occur during logging-in
 */
export enum loggin_error {
  INVALID_EMAIL = 'auth/invalid-email',
  INVALID_PASSWORD = 'auth/wrong-password',
  USER_DISABLED = 'auth/user-disabled',
  USER_NOT_FOUND = 'auth/user-not-found'
}

/**
 * Duplicate of IMFUser ?
 */
export interface IMFAuthUser {
  email: string;
}


export abstract class MFBasicAuthUser<M extends MFModel<M>> {
  /**
     * Observable on auth user
     */
  protected authUser$ = this.auth.authState.pipe(
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  /**
   * Must be called with super
   *
   * @param db AngularFirestore instance
   * @param auth AngularFireAuth instance
   * @param userDao The user Dao to use
   */
  constructor(
    protected db: AngularFirestore,
    protected auth: AngularFireAuth,
    protected userDao: MFDao<M> | MFFlattableDao<M>
  ) {

    // clear all cache when auth user change
    MFCache.setClearAllCacheObservable(this.authUser$.pipe(
      distinctUntilChanged((previousUser: FirebaseUser, newUser: FirebaseUser) => {
        const connecting = !previousUser && !!newUser;
        const disconnecting = !!previousUser && !newUser;
        const switching = !!previousUser && !!newUser && previousUser.uid !== newUser.uid;
        //return "true" if there is no change (to handle) between previous and new value
        return !disconnecting && !switching;
      }) // Only emit when the current value is different than the last.
    ));
  }

  /**
   * Get an observable of auth user
   */
  public getAuthUser(): Observable<FirebaseUser> {
    return this.authUser$;
  }

  /**
   * Get the user document from connected user
   *
   * @param subLocation partial location of the doncument (without id)
   */
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



  /**
   * Observable of the connection status (true = is connected)
   */
  public isConnected(): Observable<boolean> {
    return this.authUser$
      .pipe(
        map(user => !!user)
      );
  }

  /**
   * Log out the current user
   */
  public logout(): Promise<void> {
    return this.auth.signOut();
  }

  /**
   * Update the user
   *
   * @param data data to update with
   * @param location location of the user document
   * @param options update options
   */
  public update(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
    return this.userDao.update(data, location, options);
  }
}

/**
 * Interface allowing to link a user document to an authUser
 */
export abstract class MFAuthUser<M extends MFModel<M> & IMFAuthUser> extends MFBasicAuthUser<M>{
  /**
   * redirect link in user verification email
   */
  public readonly verificationMustacheLink: string = Reflect.getMetadata('verificationMustacheLink', this.constructor);



  /**
   * Must be called with super
   *
   * @param db AngularFirestore instance
   * @param auth AngularFireAuth instance
   * @param userDao The user Dao to use
   */
  constructor(
    protected db: AngularFirestore,
    protected auth: AngularFireAuth,
    protected userDao: MFDao<M> | MFFlattableDao<M>
  ) {
    super(db, auth, userDao);

  }





  /**
   * Log in
   *
   * @param email email to connect with
   * @param password password to connect with
   */
  public login(email: string, password: string): Promise<firebase.auth.UserCredential> {
    return this.auth.signInWithEmailAndPassword(email, password)
      .catch(error => Promise.reject(error.code as loggin_error));
  }

  /**
   * Send an email verification in order to validate mail address ownership
   *
   * @param cred Credential
   * @param continueUrl Redirect uri
   */
  private sendVerificationEmail(cred: firebase.auth.UserCredential, continueUrl?: string): Promise<void> {
    const mustacheUrl = continueUrl || this.verificationMustacheLink;
    if (mustacheUrl && mustacheUrl.length) {
      const url = mustacheUrl.replace('{userId}', cred.user.uid);
      return cred.user.sendEmailVerification({ url });
    }
    return Promise.resolve();
  }

  /**
   * Register a new user
   *
   * @param user user data
   * @param password password to register with
   * @param options register options
   */
  public register(user: M, password: string, options?: MFRegisterOptions): Promise<M> {
    return this.auth.createUserWithEmailAndPassword(user.email, password)
      .then(credential => Promise.all([
        this.userDao.create(user, credential.user.uid),
        options && typeof options.sendVerificationEmail === 'boolean' && !options.sendVerificationEmail ?
          Promise.resolve() :
          this.sendVerificationEmail(credential)
      ])
        .then(([user]) => user));
  }

  /**
   * Set persistence of the authentication
   *
   * @param persistence 'local' | 'session' | 'none'
   */
  public setSessionPersistence(persistence: 'local' | 'session' | 'none'): Promise<void> {
    return this.auth.setPersistence(persistence);
  }


}
