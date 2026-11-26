// Lets `node --test` run src/lib directly (Node strips TypeScript types itself).
// The app imports siblings without an extension ("./types"), as the bundler allows;
// this hook retries such imports with ".ts". No dependency needed.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
