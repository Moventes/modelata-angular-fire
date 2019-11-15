import { Validator, ValidatorFn } from '@angular/forms';
import { MFModel } from 'models/mf.model';

export function FormControlValidators<M extends MFModel>(value: Array<Validator | ValidatorFn> = []) {
  return function (target: M, propertyKey: string) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    if (!target._controlsConfig[propertyKey] || target._controlsConfig[propertyKey].length === 0) {
      target._controlsConfig[propertyKey] = value;
    }
  };
}

export function ToFormControl<M extends MFModel>() {
  return function (target: any, propertyKey: string) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = [];
    }
  };
}

export function NotInFormControl<M extends MFModel>() {
  return function (target: any, propertyKey: string) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey] = true;
  };
}
