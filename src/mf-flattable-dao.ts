import { AngularFirestore, DocumentReference } from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/storage';
import { IMFGetListOptions, IMFGetOneOptions, IMFLocation, IMFUpdateOptions, MFOmit } from '@modelata/types-fire';
import { getLocation, getLocationFromPath, getSubPaths, mergeModels } from 'helpers/model.helper';
import { concatMustachePaths } from 'helpers/string.helper';
import 'reflect-metadata';
import { combineLatest, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { MFDao } from './mf-dao';
import { MFModel } from './mf-model';


class SubMFDao extends MFDao<any>{

  public mustachePath: string;

  constructor(
    mustachePath: string,
    db: AngularFirestore,
    private referentGetNewModel: (data?: Partial<any>, location?: Partial<IMFLocation>) => any,
    public beforeSave: (model: Partial<any>, location?: string | Partial<IMFLocation>) => Promise<Partial<any>>,
    storage?: AngularFireStorage,
  ) {
    super(db, storage);
    this.mustachePath = mustachePath;
  }

  containsSomeValuesForMe(data: Object): boolean {
    const refModel = this.referentGetNewModel(data);
    return !!Object.keys(refModel).find(key =>
      Reflect.hasMetadata('subDocPath', refModel, key) &&
      this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key)) &&
      data.hasOwnProperty(key)
    );
  }

  extractMyData(data: Object): Object {
    const refModel = this.referentGetNewModel(data);
    return Object.keys(refModel).reduce(
      (myData, key) => {
        if (
          Reflect.hasMetadata('subDocPath', refModel, key) &&
          this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key)) &&
          data.hasOwnProperty(key)
        ) {
          (myData as any)[key] = (data as any)[key];
        }
        return myData;
      },
      {}
    );
  }

  getNewModel(data?: Partial<any>, location?: Partial<IMFLocation>): any {
    const refModel = this.referentGetNewModel(data, location);
    Object.keys(refModel).forEach((key) => {
      if (
        !Reflect.hasMetadata('subDocPath', refModel, key) ||
        !this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key))
      ) {
        delete refModel[key];
      }
    });
    return refModel;
  }

}

/**
 * Abstract Flattable DAO class
 */
export abstract class MFFlattableDao<M extends MFModel<M>> extends MFDao<M>{


  private subDAOs: {
    [daoPath: string]: {
      dao: SubMFDao;
      ids: string[];
    }
  } = {};

  constructor(
    db: AngularFirestore,
    storage?: AngularFireStorage,
  ) {
    super(db, storage);
    this.initAllSubDao(db, storage);
    if (!this.subDAOs || Object.keys(this.subDAOs).length < 1) {
      console.error(`${this.mustachePath} DAO EXTENDS MFFlattableDao But the model dont use any data stored in other document !! `);
      console.error(`${this.mustachePath} DAO MUST EXTENDS MFDao instead`);
    }
  }

  private initAllSubDao(
    db: AngularFirestore,
    storage?: AngularFireStorage
  ) {
    const refModel = this.getNewModel();
    const subPaths = getSubPaths(refModel);
    this.subDAOs = subPaths.reduce(
      (daos, subPath: string) => {
        const [daoPath, docId] = subPath.split('/');
        if (!(daos as any)[daoPath]) {
          (daos as any)[daoPath] = {
            dao: this.instantiateSubDao(daoPath, db, storage),
            ids: [docId]
          };
        } else if (!((daos as any)[daoPath].ids as string[]).includes(docId)) {
          ((daos as any)[daoPath].ids as string[]).push(docId);
        }
        return daos;
      },
      {}
    );
  }


  private instantiateSubDao(
    subDaoPath: string,
    db: AngularFirestore,
    storage?: AngularFireStorage,
  ): SubMFDao {
    const subMustachePath = concatMustachePaths(this.mustachePath, subDaoPath);
    return new SubMFDao(subMustachePath, db, this.getNewModel, this.beforeSave, storage);
  }



  private get_subDocs(parentLocation: IMFLocation, options: IMFGetOneOptions = {}) {
    return combineLatest(
      Object.keys(this.subDAOs)
        .map(subDaoPath =>
          this.subDAOs[subDaoPath].ids.map(docId =>
            this.subDAOs[subDaoPath].dao.get(
              {
                ...parentLocation,
                parentId: parentLocation.id,
                id: docId
              },
              options
            )
              .pipe(map(model => ({ model, subDocPath: `${subDaoPath}/${docId}` })))
          )
        )
        .reduce(
          (obsArray, subObsArray) => obsArray.concat(subObsArray),
          []
        )
    )
      .pipe(
        map((subDocWithPath: { subDocPath: string, model: object }[]) =>
          subDocWithPath.reduce(
            (subDocsByPath, docWithPath) => {
              (subDocsByPath as any)[docWithPath.subDocPath] = docWithPath.model;
              return subDocsByPath;
            }
            ,
            {}
          )
        )
      );
  }

  public get(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<M> {
    const realLocation = getLocation(location, this.mustachePath) as IMFLocation;

    return combineLatest([
      super.get(location, options),
      this.get_subDocs(realLocation, options)
    ])
      .pipe(
        map(([mainModel, subDocsByPath]) =>
          mergeModels(mainModel, subDocsByPath)
        )
      );

  }

  public getByReference(reference: DocumentReference, options?: IMFGetOneOptions): Observable<M> {
    const realLocation = getLocationFromPath(reference.parent.path, this.mustachePath, reference.id) as IMFLocation;
    return this.get(realLocation, options);
  }

  public getByPath(path: string, options?: IMFGetOneOptions): Observable<M> {
    return this.getByReference(this.db.doc(path).ref, options);
  }

  private getModelWithSubDocsFromMainModel(mainModel: M, options: IMFGetOneOptions = {}): Observable<M> {
    const location = getLocation(mainModel, this.mustachePath) as IMFLocation;
    return this.get_subDocs(location, options)
      .pipe(
        map(subDocsByPath =>
          mergeModels(mainModel, subDocsByPath)
        )
      );
  }
  public getList(location?: MFOmit<IMFLocation, 'id'>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    return super.getList(location, options)
      .pipe(switchMap(models =>
        combineLatest(
          models.map(mainModel => this.getModelWithSubDocsFromMainModel(mainModel, options))
        )
      ));
  }

  extractMyData(data: Partial<M>): Partial<M> {
    const refModel = this.getNewModel(data);
    return Object.keys(refModel).reduce(
      (myData, key) => {
        if (
          !Reflect.hasMetadata('subDocPath', refModel, key) &&
          data.hasOwnProperty(key)
        ) {
          (myData as any)[key] = (data as any)[key];
        }
        return myData;
      },
      {}
    );
  }



  // public async create(data: M, location?: string | Partial<IMFLocation>, options: IMFSaveOptions = {}): Promise<M> {

  //   if (!allDataExistInModel(data, this.getNewModel())) {
  //     return Promise.reject('try to update/add an attribute that is not defined in the model');
  //   }

  //   (data as any).updateDate = firestore.FieldValue.serverTimestamp();
  //   (data as any).creationDate = firestore.FieldValue.serverTimestamp();
  //   const realLocation: Partial<IMFLocation> = getLocation(location || data, this.mustachePath);


  //   return this.beforeSave(data, realLocation)
  //     .then((model) => {

  //       let testIfdocAlreadyExist: Promise<void>;

  //       if (realLocation && realLocation.id && !options.overwrite) {
  //         testIfdocAlreadyExist = (this.getAFReference<Partial<M>>(realLocation).get() as Observable<firestore.DocumentSnapshot>)
  //           .pipe(take(1)).toPromise()
  //           .then((snap: firestore.DocumentSnapshot) => {
  //             if (snap.exists) {
  //               return Promise.reject({
  //                 message: `conflict ! document ${snap.id} already exists`,
  //                 code: 409
  //               });
  //             }
  //             return Promise.resolve();
  //           });
  //       } else {
  //         testIfdocAlreadyExist = Promise.resolve();
  //       }

  //       return testIfdocAlreadyExist
  //         .then(() => this.saveFiles(model, realLocation as IMFLocation))
  //         .then(({ newModel: dataToSave, newLocation }) => {
  //           const ref = this.getAFReference<Partial<M>>(newLocation);
  //           const savableData = getSavableData(dataToSave);
  //           if (newLocation && newLocation.id) {
  //             return (ref as AngularFirestoreDocument<Partial<M>>).set(savableData, { merge: !options.overwrite }).then(() => ref.ref);
  //           }
  //           return (ref as AngularFirestoreCollection<Partial<M>>).add(savableData);
  //         })
  //         .then(ref =>
  //           this.getNewModel(data, { ...realLocation, id: ref.id })
  //         )
  //         .catch((error) => {
  //           console.error(error);
  //           console.log('error for ', data);
  //           return Promise.reject(error);
  //         });

  //     });
  // }

  private update_subDocs(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
    return Promise.resolve(data); // TODO
  }

  update(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
    return Promise.all([
      super.update(this.extractMyData(data), location, options),
      this.update_subDocs(data, location, options)
    ]).then(() => data);
  }


  // public getModelFromSnapshot(snapshot: firestore.DocumentSnapshot): M {
  //   if (snapshot.exists) {
  //     return this.getNewModel(
  //       {
  //         ...snapshot.data() as Partial<M>,
  //         _id: snapshot.id,
  //         _collectionPath: snapshot.ref.parent.path,
  //         _snapshot: snapshot,
  //       }
  //     );
  //   }
  //   console.error(
  //     '[firestoreDao] - getNewModelFromDb return null because dbObj.exists is null or false. dbObj :',
  //     snapshot
  //   );
  //   return null;
  // }

  // public getSnapshot(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<DocumentSnapshot<M>> {
  //   const ref = (this.getAFReference(location) as AngularFirestoreDocument<M>);
  //   return options && options.completeOnFirst ?
  //     ref.get().pipe(map(snap => snap as DocumentSnapshot<M>)) :
  //     ref.snapshotChanges().pipe(map(action => action.payload));
  // }


  // appelé une fois par model
  // public async beforeSave(model: Partial<M>, location?: string | Partial<IMFLocation>): Promise<Partial<M>> {
  //   return Promise.resolve(model);
  // }
}
