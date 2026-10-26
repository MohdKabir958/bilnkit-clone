import path from 'path';

/** Evidence must never be exposed by the public product-image static handler. */
export function privateSupportPath(publicRoot: string, configured?: string): string {
  const root = path.resolve(configured || path.join(publicRoot, '..', 'private-support'));
  assertSeparateStorage(publicRoot, root);
  return root;
}

export function assertSeparateStorage(publicRoot: string, privateRoot: string): void {
  const relative = path.relative(publicRoot, privateRoot);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Private evidence storage must be outside public product-image storage.');
  }
}
