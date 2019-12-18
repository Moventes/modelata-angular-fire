import 'reflect-metadata';

/**
 * Sets redirect link in user verification email
 *
 * @param path link with mustache user id (e.g. https://monApp.io/users/{userId}/board)
 */
export function EmailVerificationLink(link: string): any {
    return (target: Object) => {
        Reflect.defineMetadata('verificationMustacheLink', link, target);
    };
}
