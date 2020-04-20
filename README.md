# modelata angular fire

modelata-angular-fire is a wrapper of @angular/fire with firestore for angular application    
modelata-angular-fire implement and extend modelata-fire

modelata-angular-fire gives abstract class and abstract dao to be extend.


## ----- MFModel -----

### BASE

```ts
export class UserModel extends MFModel<UserModel> {

    name?: string = null;

    constructor(
        data: Partial<UserModel>,
        mustachePath: string,
        location: Partial<IMFLocation>,
    ) {
        super();
        super.initialize(data, mustachePath, location);
    }
}
```

- your models extends MFModel.
- this minimal constructor is same for all models. userModel is instanciate by UserDao only.
- all attributes must be set with a default value (any value).

### PREFIX SUFFIX

its possible to add attribute don't save in database.  
prefix it by an underscrore or suffix it by $ if is an observable.

```ts
export class UserModel extends MFModel<UserModel> {
    _notSavedInDb: number = null;
    notSavedInDb$: Observable<any> = null;
    _notSavedInDb$: Observable<any> = null;
    savedInDb: number = null;
    // ...
}
```

### AUTOMATIQUE VALUE
modelata-angular-fire set some attribute an all models.

- _id : document id.
- _collectionPath : document path.
- _snapshot : document firestore snapshot.
- _fromCache : true if the document comes from the cache.
- updateDate : date of last update.
- creationDate : creation date of document in db. 

### DECORATORS

modelata-angular-fire give some decorator for your model attributes.

#### @SubCollectionGetList  
```ts
@SubCollectionGetList<M = any>(collectionName: string, daoName: string, options?: IMFGetListOptions<M>) 
```
Decorator to use on a model property. Its value will then be an observable of the list of documents present in the specified collection.
 
 - @param collectionName name of the subCollection
 - @param daoName dao used to fetch documents list
 - @param options getListOptions (withSnapshot, completeOnFirst, where, orderBy, limit, offset, cacheable)

 /!\ for use this Decorator, you must have the dao in your model.
 ```ts
 export class UserModel extends MFModel<UserModel> {

    @SubCollectionGetList('subCollectionName','subUserDAOService')
    _subUserCollectionDocs$: Observable<SubUserCollectionDocModel[]> = null;
    
    @SubCollectionGetList('subCollectionName','subUserDAOService',{
        orderBy:{
            field:'myDate',
            operator:'asc'
        }
    })
    _subUserCollectionDocsSorted$: Observable<SubUserCollectionDocModel[]> = null;

     constructor(
         data: Partial<UserModel>,
        mustachePath: string,
        location: Partial<IMFLocation>,
        protected subUserDAOService: SubUserDAOService
    ) {
        super();
        super.initialize(data, mustachePath, location);
    }
}
 
```

#### @GetByRef
```ts
@GetByRef(attributeName: string, daoName: string)
```


Decorator to use on a model property. Its value will then be an observable of the document referenced by the linked attribute.  

- @param attributeName The attribute refencing a document from database
- @param daoName The DAO used to fetch the document


 /!\ for use this Decorator, you must have the dao in your model.

```ts
 export class UserModel extends MFModel<UserModel> {

    @GetByRef('myRefDoc','myRefDAOService')
    _myRef$: Observable<RefDocModel> = null;

    myRefDoc: DocumentReference = null;

     constructor(
         data: Partial<UserModel>,
        mustachePath: string,
        location: Partial<IMFLocation>,
        protected myRefDAOService: MyRefDAOService
    ) {
        super();
        super.initialize(data, mustachePath, location);
    }
}

```

For GetByRef AND SubCollectionGetList.  
add MyRefDAOService via getNewModel method of UserDaoService 

```ts
export class UserDaoService extends MFFlattableDao<UserModel> {

    constructor(
        db: AngularFirestore,
        storage: AngularFireStorage,
        protected myRefDAOService: MyRefDAOService // Injection de dependance
    ) {        super(db, storage);    }

    getNewModel(data?: Partial<UserModel>, location?: Partial<IMFLocation>): UserModel {
        const userModel = new UserModel(data, this.mustachePath, location, this.myRefDAOService); // add myRefDAOService for GetByRef AND SubCollectionGetList.
        return userModel;
    }
}

```


#### @InSubDoc
```ts
@InSubDoc(subDocPath: string)
```

Decorates a property that is constructed by DAO with the value of the same property of a subdocument.
 
- @param subDocPath the path of the subdocument (WITHOUT main document path)
 
/!\ the dao must be extend 'MFFlattableDao' (not MFDao).
```ts
 export class UserModel extends MFModel<UserModel> {

    @InSubDoc('protectedData/private')
    phone: Observable<RefDocModel> = null;
// ....
}
```

#### @StorageProperty
```ts
@StorageProperty(options: IMFStorageOptions)
```
Decorates a property that is a file to save in firebase Storage.  
The property must be of type : IMFFile.
```ts
  @StorageProperty({
    deletePreviousOnUpdate: false,
    deleteOnDelete: true
  })
  picture: IMFFile = null;
```

### FORM

MFModel give two public methods `toFormBuilderData` (and toString).
we have four decorators for add any validators on model attribute or add/remove attributes control.

#### toFormBuilderData 

Returns data to build a form group

- @param an object {[modelAttributeName]:requiredBoolean} . 

```ts
// myComponent.component.ts
this.myFormGroup = this.angularFormBuilder.group(myModel.toFormBuilderData({phone:true}));
```

#### @FormControlValidators decorator
```ts
@FormControlValidators(value?: ValidatorFn[])
```
Adds validators to form control when generating form group data

```ts
    @FormControlValidators([Validators.minLength(2)])
    public name: string = null;
```

#### @NotInFormControl decorator
```ts
@NotInFormControl()
```
Explicitly DOES NOT generates form control for this property

#### @ToFormControl decorator
```ts
@ToFormControl()
```
Generates form control for this property
(ex: for a private attribute)

#### @ToFormGroupFunction decorator
```ts
@ToFormGroupFunction(fn: function(value,validators))
```
Generates specific form group data with the given function

```ts
@ToFormGroupFunction((geopos,validators)=>{
    return {
        lat: [geopos.lat, [...validators, Validator.latitude]],
        long: [geopos.long, [...validators, Validator.longitude]],
    }
})
public geopos:{lat:string,long:string} = null;
```




## ----- DAO -----


### BASE

```ts
@Injectable({
    providedIn: 'root'
})
@CollectionPath('/users')
export class UserDaoService extends MFDao<UserModel> {

    constructor(
        db: AngularFirestore,
        storage: AngularFireStorage,
    ) {
        super(db, storage);
    }

    getNewModel(data?: Partial<UserModel>, location?: Partial<IMFLocation>): UserModel {
        const userModel = new UserModel(data, this.mustachePath, location);
        return userModel;
    }
}
```

- your DAOs extends MFDao ( or MFFlattableDao if you use '@InSubDoc' decorator in model).
- this minimal constructor is same for all DAOs. 
- this minimal getNewModel methode is same for all DAOs.
- DAOs are all decorated by @CollectionPath.

#### getNewModel
getNewModel methode is used by MFDao, MFFlattableDao and by your components/service for instanciate a new model.  
If you want to add data calculated from existing data (or any data that is not in database) to your models, this is the method to do it.

#### beforeSave
beforeSave methode is called by MFDao or MFFlattableDao on all model just before saving it to the database.  
If you want delete field or add calculated data, this is the method to do it.

```ts
    beforeSave(dataReadyToSave, idOrLocation){
        if (dataReadyToSave.birthdate){
            dataReadyToSave.age = dataReadyToSave.birthdate.toAge();
            delete dataReadyToSave.birthdate;
        }
        return dataReadyToSave;
    }
```

#### @CollectionPath decorator
```ts
@CollectionPath('/users')
```
CollectionPath decorator must be used on all DAO.  
CollectionPath take in parameter a string representing the collection path in firestore db.  
If the collection is a subcollection (collection in a document), use the "mustache" syntaxe for all document id.
```ts
@CollectionPath('/users/{userId}/mySubCollection/{mySubDocId}/subSubcollection')
```
All methods that need an id or a location (like "get"), now take a Location with ids mentioned in CollectionPath.
```ts
const location = {
    id:'mySubSubDocId',
    mySubDocId:'id',
    userId:'id'
}
```

### PUBLIC METHOD

#### get
```ts
get(idOrLocation: string | IMFLocation, options?: IMFGetOneOptions)
```
Get a model from database from id or location

- options :
```ts
export interface IMFGetOneOptions {
  /**
   * Document will include an hidden property containing document snapshot
   */
  withSnapshot?: boolean;

  /**
   * Observable returned will complete on first result
   */
  completeOnFirst?: boolean;

  /**
   * Request result will be cached in order to get a faster answer on same getOne request
   */
  cacheable?: boolean;

  /**
   * Display an error in console when requested document not exists (default: true)
   */
  warnOnMissing?: boolean;
}
```

#### getByReference
```ts
getByReference(reference: DocumentReference, options?: IMFGetOneOptions)
```
Get a model from database from its reference

#### getByPath
```ts
getByPath(path: string, options?: IMFGetOneOptions)
```
Get a model from database from its path

#### getList
```ts
getList(location?: MFOmit<IMFLocation, "id">, options?: IMFGetListOptions<M>)
```
Get a list of documents in the collection

 - options :
 ```ts
 export interface IMFGetListOptions<M> {
  /**
   * Documents will include an hidden property containing document snapshote
   */
  withSnapshot?: boolean;

  /**
   * Observable returned will complete on first result
   */
  completeOnFirst?: boolean;

  /**
   * Where conditions
   */
  where?: IMFWhere[];

  /**
   * Order by
   */
  orderBy?: IMFOrderBy;

  /**
   * Maximum result returned
   */
  limit?: number;

  /**
   * boundary of the get, only one is applied
   */
  offset?: IMFOffset<M>;

  /**
   * Request result will be cached in order to get a faster answer on same getList request
   */
  cacheable?: boolean;
}
 ```

#### getModelFromSnapshot
```ts
getModelFromSnapshot(snapshot: DocumentSnapshot, options?: Partial<IMFGetOneOptions>)
```
get a model from a snapshot

#### getListByPath
```ts
getListByPath(path: string, options?: IMFGetListOptions<M>)
```
Get list of document by collection path

#### update
```ts
update(data: Partial<M>, location?: string | IMFLocation | M, options?: IMFUpdateOptions<M>)
```
update some field of a model.

- options :
```ts
/**
 * List of file properties of the model M for which stored files MUST (true) or MUST NOT be deleted on document update
 * (Overrides behaviour configured in model decorators)
 */
export type IMFDeletePreviousOnUpdateFilesOptions<M extends IMFModel<M>> = {
  /**
   * File property : true => the previous file will be deleted if updated
   * File property : false => the fprevious ile will NOT be deleted if updated
   */[fileAttribute in NonFunctionPropertyNames<M>]?: boolean;
};

/**
 * Options to pass to update method
 */
export interface IMFUpdateOptions<M extends IMFModel<M>> {
  deletePreviousOnUpdateFiles?: IMFDeletePreviousOnUpdateFilesOptions<M>;
}
```

#### create
```ts
create(data: M, location?: string | Partial<IMFLocation>, options?: IMFSaveOptions)
```
save a new model in db, update if already exist.

- options :
```ts
export interface IMFSaveOptions {
  /**
   * If document already exists, it will be fully overwritten
   */
  overwrite?: boolean;
}
```

#### delete
```ts
delete(idLocationOrModel: string | IMFLocation | M, options?: IMFDeleteOptions<M>)
```
Delete a model by id

- options :

```ts
/**
 * List of file properties of the model M for which stored files MUST (true) or MUST NOT be deleted on document deletion
 * (Overrides behaviour configured in model decorators)
 */
export declare type IMFDeleteOnDeleteFilesOptions<M extends IMFModel<M>> = {
  /**
   * File property : true => the file will be deleted
   * File property : false => the file will NOT be deleted
   */
  [fileAttribute in NonFunctionPropertyNames<M>]?: boolean;
};

/**
 * Options to pass to delete method
 */
export interface IMFDeleteOptions<M extends IMFModel<M>> {
  deleteOnDeleteFiles?: IMFDeleteOnDeleteFilesOptions<M>;
  cascadeOnDelete?: boolean;
}
```

#### deleteByReference
```ts
deleteByReference(reference: AngularFirestoreDocument<M>)
```
Delete a model by its reference

#### getReference
```ts
getReference(idOrLocationOrModel: string | Partial<IMFLocation> | M)
```
Get a reference from an id, a location or directly from model

#### getReferenceFromPath
```ts
getReferenceFromPath(path: string)
```
Get a reference from a compatible path

#### getSnapshot
```ts
getSnapshot(idOrLocation: string | IMFLocation, options?: IMFGetOneOptions)
```
Get a document snapshot from database from an id or a location


#### isCompatible
```ts
isCompatible(doc: M | DocumentReference | CollectionReference)
```
Check if the model or reference is compatible with this DAO based on its path







## ----- CACHE -----

### DECORATOR

### FUNCTIONS


## ----- AUTHENTICATION -----

### BASE

### FUNCTIONS

### DECORATOR
