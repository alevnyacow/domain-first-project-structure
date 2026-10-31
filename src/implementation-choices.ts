import { ConfigFile, configFileName } from './config-file';
import {
    type ImplementationKind,
    type ImplementationPurpose,
    implementationLabelSchema
} from './implementation-options-schema';

export {
    type ImplementationKind,
    type ImplementationPurpose,
    implementationKinds
} from './implementation-options-schema';
/** Implementation choices now live in the shared project config. */
export const implementationChoicesFileName = configFileName;

/** Saved choices are project-wide, isolated by contract kind and environment role. */
export const savedImplementations = (
    kind: ImplementationKind,
    purpose: ImplementationPurpose
) => [
    ...new Set(
        ConfigFile.Instance.data.backend?.implementations?.[kind]?.[purpose] ??
            []
    )
];

/** Cancelling a run cancels its saved choices and any config migration too. */
export const rememberImplementation = (
    kind: ImplementationKind,
    purpose: ImplementationPurpose,
    label: string
) => {
    implementationLabelSchema.parse(label);
    const backend = ConfigFile.backend;
    const choices = { ...backend.implementations };
    const group = choices[kind] ?? { primary: [], test: [] };
    if (group[purpose].includes(label)) return;
    choices[kind] = { ...group, [purpose]: [...group[purpose], label] };
    ConfigFile.update({ backend: { ...backend, implementations: choices } });
};
