
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/storage';
import { IMFLocation } from '@modelata/types-fire';
import { MFDao } from './mf-dao';


export class SubMFDao extends MFDao<any>{

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
      this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key).split('/')[0]) &&
      data.hasOwnProperty(key)
    );
  }

  // extractMyData(data: Object): Object {
  //     const refModel = this.referentGetNewModel(data);
  //     return Object.keys(refModel).reduce(
  //         (myData, key) => {
  //             if (
  //                 Reflect.hasMetadata('subDocPath', refModel, key) &&
  //                 this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key).split('/')[0]) &&
  //                 data.hasOwnProperty(key)
  //             ) {
  //                 (myData as any)[key] = (data as any)[key];
  //             }
  //             return myData;
  //         },
  //         {}
  //     );
  // }

  splitDataByDocId(data: Partial<any>): { [docId: string]: object } {
    const refModel = this.referentGetNewModel(data);
    return Object.keys(refModel).reduce(
      (dataById, key) => {
        if (
          Reflect.hasMetadata('subDocPath', refModel, key) &&
          this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key).split('/')[0])
          //  &&
          // (data as Object).hasOwnProperty(key) // comment for create empty subDoc
        ) {
          const docId = Reflect.getMetadata('subDocPath', refModel, key).split('/')[1];
          if (!(dataById as any)[docId]) {
            (dataById as any)[docId] = {};
          }
          if ((data as Object).hasOwnProperty(key)) {
            (dataById as any)[docId][key] = data[key];
          }
        }
        return dataById;
      },
      {}
    );
  }

  getNewModel(data?: Partial<any>, location?: Partial<IMFLocation>): any {
    const refModel = this.referentGetNewModel(data, location);
    Object.keys(refModel).forEach((key) => {
      if (
        !Reflect.hasMetadata('subDocPath', refModel, key) ||
        !this.mustachePath.endsWith(Reflect.getMetadata('subDocPath', refModel, key).split('/')[0])
      ) {
        delete refModel[key];
      }
    });
    return refModel;
  }

}
