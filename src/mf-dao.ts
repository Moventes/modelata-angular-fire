import { AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument, CollectionReference, DocumentReference, DocumentSnapshot } from '@angular/fire/firestore';
import { IMFDao, IMFFile, IMFGetListOptions, IMFGetOneOptions, IMFLocation, IMFOffset, IMFSaveOptions } from '@modelata/types-fire/lib/angular';
import { firestore } from 'firebase/app';
import { allDataExistInModel, getLocation, getPath, getSavableData, isCompatiblePath } from 'helpers/model.helper';
import 'reflect-metadata';
import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Cacheable } from './decorators/cacheable.decorator';
import { MFCache } from './mf-cache';
import { MFModel } from './mf-model';

/**
 * Abstract DAO class
 */
export abstract class MFDao<M extends MFModel<M>> extends MFCache implements IMFDao<M>{

  public readonly mustachePath: string = Reflect.getMetadata('mustachePath', this.constructor);

  constructor(private db: AngularFirestore, cacheable = true) {
    super(cacheable);
  }

  //    ///////////////////////////////////
  //   ///////////////////////////////////
  //  ///////PUBLIC API//////////////////
  // ///////////////////////////////////
  /////////////////////////////////////

  abstract getNewModel(data?: Partial<M>, location?: Partial<IMFLocation>): M;

  public get(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<M> {
    if (location) {
      const reference = this.getAFReference(location) as AngularFirestoreDocument<M>;
      return this.getByAFReference(reference, options);
    }
    throw new Error('getById missing parameter : location');

  }

  public getByReference(reference: DocumentReference, options?: IMFGetOneOptions): Observable<M> {
    return this.getByAFReference(this.db.doc(reference), options);
  }

  public getByPath(path: string, options?: IMFGetOneOptions): Observable<M> {
    return this.getByAFReference(this.db.doc(path), options);
  }

  public getReference(location: string | Partial<IMFLocation>): DocumentReference | CollectionReference {
    return this.getAFReference(location).ref;
  }

  public getList(location?: Omit<IMFLocation, 'id'>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    const realLocation = getLocation(location);

    return this.getOffsetSnapshots(options.offset).pipe(
      switchMap((offset) => {
        const collection = this.db.collection<M>(getPath(this.mustachePath, realLocation), (ref) => {

          let query: firebase.firestore.CollectionReference | firebase.firestore.Query = ref;

          if (options.where && options.where.length > 0) {
            options.where.forEach((where) => {
              if (where) {
                query = query.where(where.field, where.operator, where.value);
              }
            });
          }

          if (options.orderBy) {
            query = query.orderBy(options.orderBy.field, options.orderBy.operator);
          }

          if (offset) {
            if (offset.startAt) {
              query = query.startAt(offset.startAt);
            } else if (offset.startAfter) {
              query = query.startAfter(offset.startAfter);
            } else if (offset.endAt) {
              query = query.endAt(offset.endAt);
            } else if (offset.endBefore) {
              query = query.endBefore(offset.endBefore);
            }
          }

          if (options.limit !== null && options.limit !== undefined && options.limit > -1) {
            query = query.limit(options.limit);
          }

          return query;

        });

        return this.getListByAFReference(collection, options);
      })
    );

  }

  public async create(data: M, location?: string | IMFLocation, options: IMFSaveOptions = {}): Promise<M> {

    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject('try to update/add an attribute that is not defined in the model');
    }

    (data as any).updateDate = firestore.FieldValue.serverTimestamp();
    (data as any).creationDate = firestore.FieldValue.serverTimestamp();

    const getDataToSave = this.beforeSave(data).then(data2 => getSavableData(data2));
    const realLocation = getLocation(location);
    const reference = this.getAFReference<Partial<M>>(realLocation);

    let setOrAddPromise: Promise<any>;
    if (realLocation.id) {
      setOrAddPromise = getDataToSave
        .then(dataToSave => (reference as AngularFirestoreDocument<Partial<M>>).set(dataToSave, { merge: !options.overwrite }));
    } else {
      setOrAddPromise = getDataToSave
        .then(dataToSave => (reference as AngularFirestoreCollection<Partial<M>>).add(dataToSave));
    }

    return setOrAddPromise
      .then(ref =>
        this.getNewModel(data, ref ? ({ ...realLocation, id: ref.id }) : realLocation)
      ).catch((error) => {
        console.error(error);
        console.log('error for ', data);
        return Promise.reject(error);
      });
  }

  public async update(data: Partial<M>, location?: string | IMFLocation, options?: IMFSaveOptions): Promise<Partial<M>> {
    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject('try to update/add an attribute that is not defined in the model');
    }

    const realLocation = getLocation(location);

    (data as any)['updateDate'] = firestore.FieldValue.serverTimestamp();

    return (this.getAFReference(realLocation) as AngularFirestoreDocument<M>).update(data)
      .then(() => data);
  }

  public async delete(location: string | IMFLocation): Promise<void> {
    return (this.getAFReference(location) as AngularFirestoreDocument<M>).delete();
  }

  public getModelFromSnapshot(snapshot: firestore.DocumentSnapshot): M {
    if (snapshot.exists) {
      return this.getNewModel(
        {
          ...snapshot.data() as Partial<M>,
          _id: snapshot.id,
          _collectionPath: snapshot.ref.path,
          _snapshot: snapshot,
        }
      );
    }
    console.error(
      '[firestoreDao] - getNewModelFromDb return null because dbObj.exists is null or false. dbObj :',
      snapshot
    );
    return null;
  }

  public getSnapshot(location: string | IMFLocation, options: IMFGetOneOptions): Observable<DocumentSnapshot<M>> {
    const ref = (this.getAFReference(location) as AngularFirestoreDocument<M>);
    return options && options.completeOnFirst ?
      ref.get().pipe(map(snap => snap as DocumentSnapshot<M>)) :
      ref.snapshotChanges().pipe(map(action => action.payload));
  }

  public beforeSave(model: M): Promise<M> {
    return Promise.resolve(model);
  }

  public saveFile(fileObject: IMFFile, location: string | IMFLocation): IMFFile {
    throw new Error('Method not implemented.');
  }

  public isCompatible(doc: M | DocumentReference | CollectionReference): boolean {
    return isCompatiblePath(
      this.mustachePath,
      (doc as M)._collectionPath ||
      (doc as DocumentReference).path ||
      (doc as CollectionReference).path
    );
  }






  //    ///////////////////////////////////
  //   ///////////////////////////////////
  //  ///////PRIVATE/////////////////////
  // ///////////////////////////////////
  /////////////////////////////////////


  private getAFReference<M>(location: string | Partial<IMFLocation>): AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
    const realLocation = getLocation(location);

    return realLocation.id
      ? this.db.doc<M>(getPath(this.mustachePath, realLocation))
      : this.db.collection<M>(getPath(this.mustachePath, realLocation));
  }




  @Cacheable()
  private getByAFReference(reference: AngularFirestoreDocument<M>, options: IMFGetOneOptions = {}): Observable<M> {
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

  @Cacheable()
  private getListByAFReference(reference: AngularFirestoreCollection<M>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
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

  private getSnapshotFromIMFOffsetPart(elem: string | DocumentSnapshot<M>): Observable<DocumentSnapshot<M>> {
    if (elem) {
      if (typeof elem === 'string') {
        return this.getSnapshot(elem, {});
      }
      return of(elem);
    }
    return of(null);
  }

  private getOffsetSnapshots(iMFOffset: IMFOffset<M>): Observable<IMFOffset<M>> {
    if (iMFOffset && (iMFOffset.endBefore || iMFOffset.startAfter || iMFOffset.endAt || iMFOffset.startAt)) {
      return combineLatest(
        this.getSnapshotFromIMFOffsetPart(iMFOffset.endBefore),
        this.getSnapshotFromIMFOffsetPart(iMFOffset.startAfter),
        this.getSnapshotFromIMFOffsetPart(iMFOffset.endAt),
        this.getSnapshotFromIMFOffsetPart(iMFOffset.startAt)
      ).pipe(
        map(([endBefore, startAfter, endAt, startAt]) => ({
          endBefore, startAfter, endAt, startAt
        }))
      );
    }
    return of(null);
  }




}
