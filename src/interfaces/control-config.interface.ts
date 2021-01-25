import { FormGroup, ValidatorFn, AbstractControlOptions } from '@angular/forms';

/**
 * Configuration for form controls
 */
export interface MFControlConfig {
  validators?: ValidatorFn[];
  notControl?: boolean;
  toFormGroupFunction?: (value?: any, options?: AbstractControlOptions, specialData?: any) => [any, AbstractControlOptions] | FormGroup;
}
