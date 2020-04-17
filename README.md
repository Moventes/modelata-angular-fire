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

#### GetByRef
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

#### InSubDoc
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

#### FormControlValidators decorator
```ts
@FormControlValidators(value?: ValidatorFn[])
```
Adds validators to form control when generating form group data

```ts
    @FormControlValidators([Validators.minLength(2)])
    public name: string = null;
```

#### NotInFormControl decorator
```ts
@NotInFormControl()
```
Explicitly DOES NOT generates form control for this property

#### ToFormControl decorator
```ts
@ToFormControl()
```
Generates form control for this property
(ex: for a private attribute)

#### ToFormGroupFunction decorator
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

#### getNewModel


### PUBLIC METHOD

#### get

#### getByReference

#### getByPath

#### getList

#### getListByPath

#### update

#### create

#### delete

#### deleteByReference

#### getReference

#### getReferenceFromPath

#### getSnapshot

#### getModelFromSnapshot


#### beforeSave

#### isCompatible


#### saveFile

#### deleteFile

#### updateFile



## ----- CACHE -----

### DECORATOR

### FUNCTIONS
