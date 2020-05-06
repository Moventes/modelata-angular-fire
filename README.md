# modelata angular fire

modelata-angular-fire is a wrapper of @angular/fire with firestore for angular application    
modelata-angular-fire implement and extend modelata-fire

modelata-angular-fire gives abstract class and abstract dao to be extend.




## Summary

### Model

A model/class describes a type of document stored in Firestore.

Modelata adds the following features to it:

- simplified retrieval of a sub-collection content : @SubCollectionGetList
- simplified retrieval of a document referenced by a property of this class  : @GetByRef
- simplified storage and retreival of a file referenced by a property of this class and stored in Firebase Storage: @StorageProperty
- "controlsConfig" generation of this class, to be used as parameter of myFormBuilder.group() 


### DAO service

Modelata provides the following "CRUD" functions to manipulate easily documents stored in Firestore:

- get list of documents in the collection
- get one document (by id or path or reference)
- create/save a new document (use getNewModel() to get a new blank instance of document)
- udpate an existing document 
- delete (hard: remove it from Firestore / soft: add "deleted" flag)



### Auth User

This Modelata service makes it easy to manage the current authenticated user:

- register and login by email & password
- is connected ?
- get data about him (his "FirebaseUser" and his Firestore own document)
- logout


----------------


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
- deleted : boolean used for soft deletion mode

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

    @SubCollectionGetList('subCollectionName','_subUserDAOService')
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
        protected _subUserDAOService: SubUserDAOService // dao attribute name must be start with an underscore, else the DAO try to save it in database (cf prefix/suffix)
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

    @GetByRef('myRefDoc','_myRefDAOService')
    _myRef$: Observable<RefDocModel> = null;

    myRefDoc: DocumentReference = null;

     constructor(
        data: Partial<UserModel>,
        mustachePath: string,
        location: Partial<IMFLocation>,
        protected _myRefDAOService: MyRefDAOService // dao attribute name must be start with an underscore, else the DAO try to save it in database (cf prefix/suffix)
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
- @param value changes trigger ex:
```ts
'blur' // all control on blur

{ 
    anwser:'blur'
    name:'change'
} // each control with his value, other to default

{
    default:'blur',
    except:{
        name:'change'
    }
} // all control to blur except name on change
```  
- @param an object {[modelAttributeName]:anyValue } - to give some data to  ToFormGroupFunction.

```ts
// myComponent.component.ts
this.myFormGroup = this.angularFormBuilder.group(myModel.toFormBuilderData({phone:true},'blur',{anwser:sectionModel}));
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
@ToFormGroupFunction(fn: function(value,options: AbstractControlOptions,speacialData:any))
```
Generates specific form group data with the given function

```ts
    @ToFormGroupFunction<AnswerModel>((defaultValue?: any, options: AbstractControlOptions = {}, sectionModel?: SectionModel) => {
        if (!options.validators) {
            options.validators = [];
        }
        if (sectionModel && sectionModel.textMaxLength) {
            (options.validators as ValidatorFn[]).push(Validators.maxLength(sectionModel.textMaxLength));
        }
        if (sectionModel && sectionModel.textMinLength) {
            (options.validators as ValidatorFn[]).push(Validators.minLength(sectionModel.textMinLength));
        }
        return [defaultValue, options];

    })
    answer: string = null;
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

#### @DeletionMode decorator
```ts
@DeletionMode(MFDeleteMode.SOFT)
```
DeletionMode decorator is used for set the deletion strategy for this DAO. (default : HARD)
DeletionMode take in parameter a enum value MFDeleteMode.SOFT or MFDeleteMode.HARD.  
MFDeleteMode.SOFT :  
 - when a dao delete a document (with delete methode), the document is just updated with delete = true;  
 - all getList calls have a "where filter" on deleted field  
 MFDeleteMode.HARD :
 - when a dao delete a document (with delete methode), the document is definitely deleted.  


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
  mode?: MFDeleteMode; // used for override defaultvalue (HARD or @DeletionMode)
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

with modelata-angular-fire, all database request result are cached with a bypass ( like behaviorSubject )

all current cached results are automatically destroyed on auth user logout.

### MFCache class
### FUNCTIONS

#### clearAllMFCache
```ts
MFCache.clearAllMFCache()
```

#### setClearAllCacheObservable(clearAllCacheAndSubscription$: Observable<any>)
```ts
MFCache.setClearAllCacheObservable(clearAllCacheAndSubscription$: Observable<any>)
```

### DECORATOR

#### DisableCache
dao class decorator 
Tells the DAO to NOT cache the result

```ts
@DisableCache  // without '()'
export class UserDaoService extends MFDao<UserModel>
```

#### Cacheable
method decorator  
Tells the Dao to cache request results

```ts
export class UserDaoService extends MFDao<UserModel>{
// ...

@Cacheable
public getFooByBar():Observable<Foo>{
    // return myObservable
}

}
```



## ----- AUTHENTICATION -----

### BASE

### FUNCTIONS

### DECORATOR


## ----- LOGS -----
