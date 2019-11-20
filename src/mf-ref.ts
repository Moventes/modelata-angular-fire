import { AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument, DocumentReference, CollectionReference } from '@angular/fire/firestore';
import { IMFGetOneOptions, IMFLocation, IMFGetListOptions } from '@modelata/types-fire/lib/angular';
import { firestore } from 'firebase/app';
import { getLocation, getPath } from 'helpers/model.helper';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MFModel } from './mf-model';

/**
 * Abstract DAO class
 */
export abstract class MFRef<M extends MFModel<M>>{

  abstract mustachePath: string;

  constructor(private db: AngularFirestore) {
  }


  protected getAFReference<M>(location: string | Partial<IMFLocation>): AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
    const realLocation = getLocation(location);

    return realLocation.id
      ? this.db.doc<M>(getPath(this.mustachePath, realLocation))
      : this.db.collection<M>(getPath(this.mustachePath, realLocation));
  }

  protected getByAFReference(reference: AngularFirestoreDocument<M>, options: IMFGetOneOptions = {}): Observable<M> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        if (options.completeOnFirst) {
          return reference.get().pipe(
            map(snapshot => this.getModelFromSnapshot(snapshot))
          );
        }
        if (options.withSnapshot) {
          return reference.snapshotChanges().pipe(
            map(action => this.getModelFromSnapshot(action.payload))
          );
        }
        return reference.valueChanges().pipe(
          map((data) => {
            if (data) {
              return this.getNewModel(data);
            }
            console.error('[firestoreDao] - get return null because dbObj is null or false. dbObj :', data);
            return null;
          })
        );
      }
      throw new Error('location is not compatible with this dao!');
    }
    throw new Error('getByReference missing parameter : reference');
  }

  protected getListByAFReference(reference: AngularFirestoreCollection<M>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        if (options.completeOnFirst) {
          return reference.get().pipe(
            map(querySnapshot => querySnapshot.docs.map(snapshot => this.getModelFromSnapshot(snapshot)))
          );
        }
        if (options.withSnapshot) {
          return reference.snapshotChanges().pipe(
            map(actions => actions.map(action => this.getModelFromSnapshot(action.payload.doc)))
          );
        }
        return reference.valueChanges().pipe(
          map(dataList =>
            dataList.map(data => this.getNewModel(data))
          )
        );
      }
      throw new Error('location is not compatible with this dao!');
    }
    throw new Error('getListByReference missing parameter : reference');
  }

  abstract getNewModel(data?: Partial<M>, location?: Partial<IMFLocation>): M;

  abstract isCompatible(doc: M | DocumentReference | CollectionReference): boolean;

  abstract getModelFromSnapshot(snapshot: firestore.DocumentSnapshot): M;



}
