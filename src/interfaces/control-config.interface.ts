import { FormGroup, ValidatorFn } from '@angular/forms';

export interface MFControlConfig {
  validators?: ValidatorFn[];
  notControl?: boolean;
  toFormGroupFunction?: (value: any, validators: ValidatorFn[]) => FormGroup;
}
