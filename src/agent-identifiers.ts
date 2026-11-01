import type { BackendUnit } from './backend-module-move';
import { boundedContextLocation } from './context-dependencies';
import type { WiredModule } from './wiring';

export const moduleId = (module: WiredModule) =>
    `${boundedContextLocation(module.typeFile)?.name ?? 'shared-kernel'}:${module.typeName}`;
export const unitId = (unit: BackendUnit) =>
    `${unit.kind}:${unit.aggregate ? `${unit.aggregate}/` : ''}${unit.name}`;
