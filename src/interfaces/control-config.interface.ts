import { FormGroup, ValidatorFn } from '@angular/forms';

/**
 * Configuration for form controls
 */
export interface MFControlConfig {
  validators?: ValidatorFn[];
  notControl?: boolean;
  toFormGroupFunction?: (value: any, validators: ValidatorFn[]) => FormGroup;
}
