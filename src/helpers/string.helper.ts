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

export function concatMustachePaths(p1: string, p2: string): string {
  const p1Poped = p1.endsWith('/') ? p1.slice(0, p1.length - 1) : p1;
  const p2Shifted = p2.startsWith('/') ? p2.slice(1) : p2;
  return `${p1Poped}/{parentId}/${p2Shifted}`;
}
