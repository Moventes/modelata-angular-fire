export function mustache(str: string, data = {}) {
    return Object.entries<string>(data)
        .reduce(
            (res, [key, valueToReplace]) => res.replace(
                new RegExp(`{s*${key}s*}`, 'g'),
                valueToReplace
            ),
            str
        );
}
