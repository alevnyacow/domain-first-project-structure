import { ConfigFile } from './config-file';
import { crossContextImplementation } from './context-dependencies';
import type { ImplementationKind } from './implementation-choices';
import { usesInMemoryDb } from './in-memory-db';

/** Only implementation labels that activate generator or boundary behavior. */
export const systemImplementationChoices = (
    kind: ImplementationKind,
    crossContext = false
) => {
    if (kind === 'ports') {
        return crossContext
            ? [
                  {
                      name: 'System: cross-context (calls handlers in another bounded context)',
                      value: crossContextImplementation
                  }
              ]
            : [];
    }
    return ConfigFile.exists && usesInMemoryDb('in-memory')
        ? [
              {
                  name: 'System: in-memory (uses the shared in-memory database)',
                  value: 'in-memory'
              }
          ]
        : [];
};
