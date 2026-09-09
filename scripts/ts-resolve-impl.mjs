export function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    try { return next(specifier + '.ts', context) } catch { /* 원래 규칙으로 */ }
  }
  return next(specifier, context)
}
