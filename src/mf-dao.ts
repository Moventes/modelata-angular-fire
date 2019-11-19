import { AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument, cDocumentReference, CollectionReference, DocumentSnapshot } from '@angular/fire/firestore';
import { IMFDao, IMFFile, IMFGetOneOptions, IMFLocation, IMFSaveOptions } from '@modelata/types-fire/lib/angular';
import { firestore } from 'firebase/app';
import { allDataExistInModel, getLocation, getPath, getSavableData, isCompatiblePath } from 'helpers/model.helper';
import 'reflect-metadata';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MFCache } from './mf-cache';
import { MFModel } from './mf-model';





/**
 * Abstract DAO class
 */
export abstract class MFDao<M extends MFModel<M>> extends MFCache implements IMFDao<M>{

  public readonly mustachePath: string = Reflect.getMetadata('collectionPath', this.constructor);

  constructor(private db: AngularFirestore, cacheable = true) {
    super(cacheable);
  }

  abstract getNewModel(data?: Partial<M>, location?: Partial<IMFLocation>): M;

  private getAFReference<M>(location: string | Partial<IMFLocation>): AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
    const realLocation = getLocation(location);

    return realLocation.id
      ? this.db.doc<M>(getPath(this.mustachePath, realLocation))
      : this.db.collection<M>(getPath(this.mustachePath, realLocation));
  }

  public getReference(location: string | Partial<IMFLocation>): cDocumentReference | CollectionReference {
    return this.getAFReference(location).ref;
  }

  public get(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<M> {
    if (location) {
      const reference = this.getAFReference(location) as AngularFirestoreDocument<M>;
      if (this.isCompatible(reference.ref)) {
        if (options.completeOnFirst) {
          return reference.get().pipe(
            map(snapshot => this.getModelFromSnapshot(snapshot))
          );
        }


      }
      throw new Error('location is not compatible with this dao!');
    } else {
      throw new Error('getById missing parameter : location');
    }
  }

  async getByReference(reference: DocumentReference, options?: IMFGetOneOptions): Promise<M> {
    if (reference) {
      if (this.isCompatible(reference)) {
        return reference.get()
          .then(snapshot => this.getModelFromSnapshot(snapshot));
      }
      throw new Error('reference is not compatible with this dao!');
    } else {
      throw new Error('getByReference missing parameter : reference');
    }
  }

  async getByPath(path: string, options?: IMFGetOneOptions): Promise<M> {
    if (path) {
      const reference = this.db.doc(path);
      if (this.isCompatible(reference)) {
        return reference.get()
          .then(snapshot => this.getModelFromSnapshot(snapshot));
      }
      throw new Error('path is not compatible with this dao!');
    } else {
      throw new Error('getByPath missing parameter : path');
    }
  }
  async getList(location?: Omit<IMFLocation, 'id'>, options?: IMFGetListOptions): Promise<M[]> {

    if (location) {
      const reference = this.getReference(location) as CollectionReference;
      let query: FirebaseFirestore.Query = reference;

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

      if (options.offset && (options.offset.endBefore || options.offset.startAfter || options.offset.endAt || options.offset.startAt)) {
        const offsetSnapshot = await this.getSnapshot(
          options.offset.endBefore || options.offset.startAfter || options.offset.endAt || options.offset.startAt
        );
        if (options.offset.startAt) {
          query = query.startAt(offsetSnapshot);
        } else if (options.offset.startAfter) {
          query = query.startAfter(offsetSnapshot);
        } else if (options.offset.endAt) {
          query = query.endAt(offsetSnapshot);
        } else if (options.offset.endBefore) {
          query = query.endBefore(offsetSnapshot);
        }
      }

      if (options.limit !== null && options.limit !== undefined && options.limit > -1) {
        query = query.limit(options.limit);
      }

      return query.get()
        .then(querySnapshot => querySnapshot.docs.map(documentSnapshot => this.getModelFromSnapshot(documentSnapshot)));
    }

    throw new Error('getList missing parameter : location');
  }

  async create(data: M, location?: string | IMFLocation, options: IMFSaveOptions = {}): Promise<M> {

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

  async update(data: Partial<M>, location?: string | IMFLocation, options?: IMFSaveOptions): Promise<Partial<M>> {
    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject('try to update/add an attribute that is not defined in the model');
    }

    const realLocation = getLocation(location);

    (data as any)['updateDate'] = firestore.FieldValue.serverTimestamp();

    return (this.getAFReference(realLocation) as AngularFirestoreDocument<M>).update(data)
      .then(() => data);
  }

  async delete(location: string | IMFLocation): Promise<void> {
    return (this.getAFReference(location) as AngularFirestoreDocument<M>).delete();
  }

  getModelFromSnapshot(snapshot: firestore.DocumentSnapshot): M {
    if (snapshot.exists) {
      return this.getNewModel(
        {
          ...snapshot.data() as Partial<M>,
          _id: snapshot.id,
          _collectionPath: snapshot.ref.path
        }
      );
    }
    console.error(
      '[firestoreDao] - getNewModelFromDb return null because dbObj.exists is null or false. dbObj :',
      snapshot
    );
    return null;
  }

  getSnapshot(location: string | IMFLocation, options: IMFGetOneOptions): Observable<DocumentSnapshot<M>> {
    const ref = (this.getAFReference(location) as AngularFirestoreDocument<M>);
    return options && options.completeOnFirst ?
      ref.get().pipe(map(snap => snap as DocumentSnapshot<M>)) :
      ref.snapshotChanges().pipe(map(action => action.payload));
  }

  async beforeSave(model: M): Promise<M> {
    return Promise.resolve(model);
  }

  saveFile(fileObject: IMFFile, location: string | IMFLocation): IMFFile {
    throw new Error('Method not implemented.');
  }

  private isCompatible(doc: M | cDocumentReference): boolean {
    return isCompatiblePath(this.mustachePath, (doc as M)._collectionPath || (doc as cDocumentReference).path);
  }




  //   /////////////////////////////////////////////////
  //   /////////////////////////////////////////////////
  //   ////////////////// Constructor //////////////////
  //   /////////////////////////////////////////////////
  //   /////////////////////////////////////////////////


  //   constructor(private db: AngularFirestore, cacheable = true) {
  //     super(cacheable);
  //   }



  //   ////////////////////////////////////////////////
  //   ////////////////////////////////////////////////
  //   ////////////////// Attributes //////////////////
  //   ////////////////////////////////////////////////
  //   ////////////////////////////////////////////////

  //   public readonly mustachePath: string = Reflect.getMetadata('mustachePath', this.constructor);
  //   public cacheable: boolean;





  //   /////////////////////////////////////////////
  //   /////////////////////////////////////////////
  //   ////////////////// Helpers //////////////////
  //   /////////////////////////////////////////////
  //   /////////////////////////////////////////////




  //   public isCompatible(doc: M | DocumentReference): boolean {
  //     return ModelHelper.isCompatiblePath(this.collectionPath, doc['path'] || doc['_collectionPath']);
  //   }

  //   getByPathToStringForCacheable(docPath: string) { return docPath; }

  //   getIdFromPath(path: string): string {
  //     const splittedPath = path.split('/');
  //     if (splittedPath.length % 2 === (path.startsWith('/') ? 1 : 0)) {
  //       return splittedPath[splittedPath.length - 1];
  //     }
  //     return null;

  //   }

  //   getListToStringForCacheable(
  //     pathIds?: Array<string>,
  //     whereArray?: Array<Where>,
  //     orderBy?: OrderBy,
  //     limit?: number
  //   ) {
  //     const whereArrayStr = whereArray && whereArray.length ? '[' + whereArray.map(function (wherep: Where) {
  //       const where = wherep || { field: 'null', operator: '', value: '' };
  //       return `${where.field}${where.operator}${where.value && where.value.path ? where.value.path : where.value}`;
  //     }).join(',') + ']' : 'undefined';
  //     const orderByStr = orderBy ? `${orderBy.field}${orderBy.operator}` : '';
  //     return `${pathIds && pathIds.length ? pathIds.join('/X/') : 'undefined'},${whereArrayStr},${orderByStr},${limit}`;
  //   }

  //   voidFn(...args) { return args; }





  //   //////////////////////////////////////////////////////
  //   //////////////////////////////////////////////////////
  //   ////////////////// Model conversion //////////////////
  //   //////////////////////////////////////////////////////
  //   //////////////////////////////////////////////////////


  //   /**
  //    * @inheritDoc
  //    */
  //   protected getModelFromSnapshot(documentSnapshot: DocumentSnapshot<M>): M {
  //     if (documentSnapshot.exists) {
  //       const pathIds = [];
  //       const pathSplitted = documentSnapshot.ref.path.split('/');
  //       if (pathSplitted.length > 2) {
  //         for (let i = 1; i < pathSplitted.length; i += 2) {
  //           // take every second element
  //           pathIds.push(pathSplitted[i]);
  //         }
  //       }
  //       const model = this.getModel(
  //         { ...documentSnapshot.data(), _fromCache: documentSnapshot.metadata.fromCache },
  //         documentSnapshot.id,
  //         pathIds
  //       );
  //       return model;
  //     }
  //     console.error(
  //       '[firestoreDao] - getNewModelFromDb return null because dbObj.exists is null or false. dbObj :',
  //       documentSnapshot
  //     );
  //     return null;

  //   }

  //   protected getModelFromDbDoc(doc: M, path: string, docId?: string): M {
  //     if (!doc) {
  //       console.log('dbDoc', doc, 'path', path, 'docId', docId);
  //       return null;
  //     } {
  //       if (!doc._id) {
  //         doc._id = docId ? docId : this.getIdFromPath(path);
  //       }
  //       const pathIds = [];
  //       const pathSplitted = path.split('/');
  //       if (pathSplitted.length > 2) {
  //         for (let i = 1; i < pathSplitted.length; i += 2) {
  //           // take every evenIndexed element(second, fourth...)
  //           pathIds.push(pathSplitted[i]);
  //         }
  //       }
  //       const model = this.getModel(
  //         doc,
  //         doc._id,
  //         pathIds
  //       );
  //       // console.log('model from dbDoc = ', model);
  //       return model;
  //     }
  //   }

  //   /**
  //    * method used to prepare the data for save
  //    * @param modelObj the data to save
  //    */
  //   protected getDbObjFromModelObj(modelObj: M): Object {
  //     // // create a model instance with the given data to gain access to the reference path getter methods
  //     const dbObj: Object = {};

  //     Object.keys(modelObj).forEach(key => {
  //       if (!key.startsWith('$') && !key.startsWith('_') && typeof modelObj[key] !== 'undefined') {
  //         if (modelObj[key] && modelObj[key].constructor.name === 'Object') {
  //           dbObj[key] = this.getDbObjFromModelObj(modelObj[key]);
  //         } else {
  //           dbObj[key] = modelObj[key];
  //         }
  //       } else {
  //         console.log('getDbObjFromModelObj ignore ', key);
  //       }
  //     });

  //     return dbObj;
  //   }

  //   /**
  //  * Returns the reference of the document located in the collectionPath with the id.
  //  *
  //  * @param modelObj - model M
  //  */
  //   public getReferenceFromModel(modelObj: M): DocumentReference {
  //     return this.db.collection(modelObj._collectionPath).doc(modelObj._id).ref;
  //   }





  //   //////////////////////////////////////////////////////
  //   //////////////////////////////////////////////////////
  //   ////////////////// Database methods //////////////////
  //   //////////////////////////////////////////////////////
  //   //////////////////////////////////////////////////////



  //   /**
  //  * saves the given data in database
  //  * @param modelObj the data to save
  //  * @param overwrite true to overwrite data
  //  * @param id the identifier to use for insert (optionnal)
  //  * @param collectionPath the path of the collection hosting the document
  //  * @param force force save even when the given data is a pristine FormGroup
  //  */
  //   public save(
  //     modelObjP: M | FormGroup,
  //     docId?: string,
  //     pathIds?: Array<string>,
  //     overwrite = false,
  //     force: boolean = false
  //   ): Promise<M> {
  //     let objToSave;
  //     if (modelObjP instanceof FormGroup || modelObjP.constructor.name === 'FormGroup') {
  //       if ((<FormGroup>modelObjP).pristine && !force) {
  //         // no change, dont need to save
  //         return Promise.resolve(this.getModel((<FormGroup>modelObjP).value, docId, pathIds));
  //       } if ((<FormGroup>modelObjP).invalid) {
  //         // form is invalid, reject with errors
  //         return Promise.reject((<FormGroup>modelObjP).errors || 'invalid form');
  //       }
  //       // ok, lets save
  //       objToSave = this.getModel((<FormGroup>modelObjP).value, docId, pathIds);

  //     } else {
  //       objToSave = modelObjP;
  //     }

  //     if (this.collectionPath && !objToSave._collectionPath) {
  //       ObjectHelper.createHiddenProperty(objToSave, 'collectionPath', ModelHelper.getPath(this.collectionPath, pathIds));
  //     }

  //     const objReadyToSave = this.beforeSave(objToSave);

  //     console.log(
  //       `super-dao ========== will save document document "${docId || objReadyToSave._id || 'new'}" at ${
  //       objReadyToSave._collectionPath
  //       }`
  //     );
  //     return this.push(objReadyToSave, docId, pathIds, overwrite);
  //   }


  //   /**
  //    * @inheritDoc
  //    */
  //   protected push(modelObj: M, docId?: string, pathIds?: Array<string>, overwrite = false): Promise<M> {
  //     // if an optionnal identifier is given, we use it to save the document
  //     // otherwise we will use the model identifier if it exists
  //     // if none are set, we let firestore create an identifier and set it on the model
  //     const documentId = docId || modelObj._id;
  //     const data = this.getDbObjFromModelObj(modelObj);
  //     return this.pushData(data, documentId, pathIds, overwrite).then(doc =>
  //       this.getModel(doc, doc['_id'] || docId, pathIds)
  //     );
  //   }
  //   /**
  //    * WILL UPDATE PARTIAL DATA
  //    * @inheritDoc
  //    */
  //   protected pushData(dbObj: Object, docId?: string, pathIds?: Array<string>, overwrite = false): Promise<Object> {
  //     const emptyModel = this.getModel({}, '?', pathIds);
  //     for (const key in dbObj) {
  //       if (!emptyModel.hasOwnProperty(key)) {
  //         return Promise.reject(`try to update/add an attribute that is not defined in the model = ${key}`);
  //       }
  //     }

  //     dbObj['_updateDate'] = firestore.FieldValue.serverTimestamp();

  //     if (docId) {
  //       const collectionName = ModelHelper.getPath(this.collectionPath, pathIds, docId);
  //       return this.db
  //         .doc(collectionName)
  //         .set(dbObj, { merge: !overwrite })
  //         .then(() => {
  //           if (!dbObj['_id']) {
  //             ObjectHelper.createHiddenProperty(dbObj, 'id', docId);
  //           }
  //           return dbObj;
  //         }).catch(error => {
  //           console.error(error);
  //           console.log('error for ', dbObj);
  //           return Promise.reject(error);
  //         });
  //     }
  //     return this.db
  //       .collection(ModelHelper.getPath(this.collectionPath, pathIds))
  //       .add(dbObj)
  //       .then(ref => {
  //         ObjectHelper.createHiddenProperty(dbObj, 'id', ref.id);
  //         return dbObj;
  //       });

  //   }

  //   public getByReference(docRef: DocumentReference, cacheable = this.cacheable): Observable<M> {
  //     // console.log('getByReference of ', docRef.path, docRef.id);

  //     if (this.isCompatible(docRef)) {
  //       if (docRef && docRef.parent) {
  //         return this.getByPath(docRef.path, false, cacheable);
  //       }
  //       throw new Error('getByReference missing parameter : dbRef.');

  //     } else {
  //       throw new Error('docRef is not compatible with this dao!');
  //     }
  //   }

  //   /**
  //    * @inheritDoc
  //    */
  //   public getById(docId: string, pathIds?: Array<string>, cacheable = this.cacheable, completeOnFirst = false): Observable<M> {
  //     // console.log('getById of ', docId, pathIds);
  //     // const path = ModelHelper.getPath(this.collectionPath, pathIds, docId);
  //     // console.log(`getById ModelHelper.getPath return ${path} for ${this.collectionPath},${pathIds},${docId}`);
  //     return this.getByPath(ModelHelper.getPath(this.collectionPath, pathIds, docId), completeOnFirst, cacheable);
  //   }

  //   @Cacheable('getByPathToStringForCacheable')
  //   protected getByPath(docPath: string, completeOnFirst = false, cacheable = this.cacheable): Observable<M> {
  //     this.voidFn(cacheable);
  //     // console.log('getByPath of ', docPath);
  //     const docId = this.getIdFromPath(docPath);
  //     return completeOnFirst ?
  //       this.db
  //         .doc<M>(docPath)
  //         .get()
  //         .pipe(
  //           catchError((err) => {
  //             console.error(`an error occurred in getByPath with params: ${docPath}`);
  //             throw new Error(err);
  //           }),
  //           map((docSnap: DocumentSnapshot<M>) => {
  //             if (!docSnap.exists) {
  //               return null;
  //             }
  //             return this.getModelFromSnapshot(docSnap);

  //           })
  //         ) :
  //       this.db
  //         .doc<M>(docPath)
  //         .valueChanges()
  //         .pipe(
  //           catchError((err) => {
  //             console.error(`an error occurred in getByPath with params: ${docPath}`);
  //             throw new Error(err);
  //           }),
  //           map((doc: M) => {
  //             if (!doc) {
  //               return null;
  //             }
  //             return this.getModelFromDbDoc(doc, docPath, docId);

  //           })
  //         );
  //   }

  //   /**
  //     * @inheritDoc
  //     */
  //   public getList(
  //     pathIds?: Array<string>,
  //     whereArray?: Array<Where>,
  //     orderBy?: OrderBy,
  //     limit?: number,
  //     cacheable = this.cacheable,
  //     offset?: Offset,
  //     completeOnFirst = false,
  //   ): Observable<Array<M>> {
  //     return this.getListCacheable(pathIds,
  //       whereArray,
  //       orderBy,
  //       limit,
  //       offset,
  //       completeOnFirst,
  //       cacheable);
  //   }
  //   /**
  //    * @inheritDoc
  //    */
  //   @Cacheable('getListToStringForCacheable')
  //   protected getListCacheable(
  //     pathIds?: Array<string>,
  //     whereArray?: Array<Where>,
  //     orderBy?: OrderBy,
  //     limit?: number,
  //     offset?: Offset,
  //     completeOnFirst?: boolean,
  //     cacheable = this.cacheable,
  //   ): Observable<Array<M>> {
  //     // console.log(whereArray, orderBy, limit, offset);
  //     this.voidFn(cacheable);

  //     const queryObs = offset && (offset.endBefore || offset.startAfter || offset.endAt || offset.startAt) ?
  //       this.getSnapshot(offset.endBefore || offset.startAfter || offset.endAt || offset.startAt) :
  //       of(null);

  //     return queryObs.pipe(
  //       map((offsetSnap) => {
  //         let queryResult: AngularFirestoreCollection<M>;
  //         if (
  //           (whereArray && whereArray.length > 0) ||
  //           orderBy ||
  //           (limit !== null && limit !== undefined) ||
  //           (offset && (offset.endBefore || offset.startAfter || offset.endAt || offset.startAt))
  //         ) {
  //           const specialQuery = (ref) => {
  //             let query: Query = ref;
  //             if (whereArray && whereArray.length > 0) {
  //               whereArray.forEach((where) => {
  //                 if (where) {
  //                   query = query.where(where.field, where.operator, where.value);
  //                 }
  //               });
  //             }
  //             if (orderBy) {
  //               query = query.orderBy(orderBy.field, orderBy.operator);
  //             }
  //             if (offset && offset.startAt) {
  //               query = query.startAt(offsetSnap);
  //             } else if (offset && offset.startAfter) {
  //               query = query.startAfter(offsetSnap);
  //             } else if (offset && offset.endAt) {
  //               query = query.endAt(offsetSnap);
  //             } else if (offset && offset.endBefore) {
  //               query = query.endBefore(offsetSnap);
  //             }
  //             if (limit !== null && limit !== undefined && limit > -1) {
  //               query = query.limit(limit);
  //             }
  //             return query;
  //           };
  //           queryResult = this.db.collection<M>(ModelHelper.getPath(this.collectionPath, pathIds), specialQuery);
  //         } else {
  //           queryResult = this.db.collection<M>(ModelHelper.getPath(this.collectionPath, pathIds));
  //         }
  //         return queryResult;
  //       }),
  //       switchMap((queryResult) => {
  //         return completeOnFirst ?
  //           queryResult
  //             .get()
  //             .pipe(
  //               catchError((err) => {
  //                 // tslint:disable-next-line:max-line-length
  //                 console.error(`an error occurred in getListCacheable with params: ${this.collectionPath} ${pathIds ? pathIds : ''} ${whereArray ? whereArray : ''} ${orderBy ? orderBy : ''} ${limit ? limit : ''}`);
  //                 return throwError(err);
  //               }),
  //               map((snap) => {
  //                 if (snap.size === 0) {
  //                   return [];
  //                 }
  //                 return snap.docs.filter(doc => doc.exists).map((docSnap: DocumentSnapshot<M>) => {
  //                   return this.getModelFromSnapshot(docSnap);
  //                 });

  //               })
  //             ) :
  //           queryResult
  //             .valueChanges({ idField: '_id' })
  //             .pipe(
  //               catchError((err) => {
  //                 // tslint:disable-next-line:max-line-length
  //                 console.error(`an error occurred in getListCacheable with params: ${this.collectionPath} ${pathIds ? pathIds : ''} ${whereArray ? whereArray : ''} ${orderBy ? orderBy : ''} ${limit ? limit : ''}`);
  //                 return throwError(err);
  //               }),
  //               map((snap) => {
  //                 if (snap.length === 0) {
  //                   return [];
  //                 }
  //                 return snap.filter(doc => !!doc).map((doc: M) => {
  //                   return this.getModelFromDbDoc(doc, ModelHelper.getPath(this.collectionPath, pathIds));
  //                 });

  //               })
  //             );
  //       })
  //     );
  //   }

  //   /**
  //    * @inheritDoc
  //    */
  //   public delete(modelObj: M): Promise<void> {
  //     return this.db.doc<M>(`${modelObj._collectionPath}/${modelObj._id}`).delete();
  //   }

  //   /**
  //    * @inheritDoc
  //    */
  //   public deleteById(docId: string, pathIds?: Array<string>): Promise<void> {
  //     return this.db.doc<M>(ModelHelper.getPath(this.collectionPath, pathIds, docId)).delete();
  //   }
  //   /**
  //    * Returns the reference of the document located in the collectionPath with the id.
  //    *
  //    * @param id - doc id
  //    * @param collectionPath - coll path
  //    */
  //   public getReference(docId: string, pathIds?: Array<string>): DocumentReference {
  //     return this.db.doc(ModelHelper.getPath(this.collectionPath, pathIds, docId)).ref;
  //   }

  //   public getSnapshot(id: string): Observable<DocumentSnapshot<M>> {
  //     return this.db.collection(this.collectionPath).doc<M>(id).get().pipe(map((doc: DocumentSnapshot<M>) => doc));
  //   }
}
