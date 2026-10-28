# [7.0.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v6.0.0...v7.0.0) (2026-10-28)


### Features

* df-init and df-react commands, REST endpoint generator and in-memory DB ([8eae3e3](https://github.com/alevnyacow/domain-first-project-structure/commit/8eae3e30a2e4126ab8d97e15c8e7c4307f4149fd))


### BREAKING CHANGES

* initialization moved to `df-init` and React modules to
`df-react`, `df-integration` no longer has "Missing domain-first packages",
error namespaces are created with the first error instead of up front, and the
Shared Layer is renamed to Shared Kernel (`shared/` → `shared-kernel/`,
`SharedErrors` → `SharedKernelErrors` with error codes `shared-kernel.*`, lint
check `shared-layer` → `shared-kernel`).

# [6.0.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v5.1.2...v6.0.0) (2026-10-24)


### Features

* multiple integrations ([5e0eea6](https://github.com/alevnyacow/domain-first-project-structure/commit/5e0eea66ed7ff57b073741236ea30bc7a812ec71))


### BREAKING CHANGES

* new scripts. `df-ps` => `df-scaffold`, `df-integration` for
integrations

## [5.1.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v5.1.1...v5.1.2) (2026-10-22)


### Bug Fixes

* no db ref moving in testcontainer integration ([a0e20ba](https://github.com/alevnyacow/domain-first-project-structure/commit/a0e20ba9846652d496f47e5599255fe11b89cd76))

## [5.1.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v5.1.0...v5.1.1) (2026-10-22)


### Bug Fixes

* automatic excluding integration tests in unit tests ([1cbee6f](https://github.com/alevnyacow/domain-first-project-structure/commit/1cbee6fafe8351eee3d13ff427f2fe09dbe997ec))

# [5.1.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v5.0.1...v5.1.0) (2026-10-22)


### Features

* `testcontainers` integration ([aefece2](https://github.com/alevnyacow/domain-first-project-structure/commit/aefece20aa6d6fe898789e2e9baf724292e5c8bb))

## [5.0.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v5.0.0...v5.0.1) (2026-10-22)


### Bug Fixes

* updated skill with modern domain-first/types API ([f879a6c](https://github.com/alevnyacow/domain-first-project-structure/commit/f879a6c3375b6f6db871ca0a7e5e016ab9fc13b2))

# [5.0.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v4.2.2...v5.0.0) (2026-10-22)


### Bug Fixes

* simplified queries and commands, removed `orchestrational` ones ([442edd2](https://github.com/alevnyacow/domain-first-project-structure/commit/442edd260909d0f2ccd592a78f3196a85d6387c9))


### BREAKING CHANGES

* new queries and commands placing

## [4.2.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v4.2.1...v4.2.2) (2026-10-19)


### Bug Fixes

* actual skills and rules ([3648725](https://github.com/alevnyacow/domain-first-project-structure/commit/36487252115a0f3b79d50d2ec4ccf92ac3d2bb40))

## [4.2.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v4.2.0...v4.2.1) (2026-10-19)


### Bug Fixes

* queries and commands in application services, `invalidRequest` in rest ([512ebce](https://github.com/alevnyacow/domain-first-project-structure/commit/512ebce76fb53d5b3892fd2044b66670ee4d0d0f))

# [4.2.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v4.1.0...v4.2.0) (2026-10-18)


### Features

* configurable dependency and lint rules ([1071fdf](https://github.com/alevnyacow/domain-first-project-structure/commit/1071fdf705c1af19c281df74162a47689b860d55))

# [4.1.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v4.0.0...v4.1.0) (2026-10-18)


### Features

* df-lint ([1499595](https://github.com/alevnyacow/domain-first-project-structure/commit/14995954c51dd989b1ce4ee144b31b4d4b2feff9))

# [4.0.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.3.2...v4.0.0) (2026-10-18)


### Features

* new errors format (+ skills) ([b425efd](https://github.com/alevnyacow/domain-first-project-structure/commit/b425efd25cf60a1c7e6893436741e851f3f45cf9))


### BREAKING CHANGES

* rest-endpoint-generator scaffolds for errors >= 9.0.0

## [3.3.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.3.1...v3.3.2) (2026-10-17)


### Bug Fixes

* in-memory db can import domain types of any bounded context ([9be45d9](https://github.com/alevnyacow/domain-first-project-structure/commit/9be45d914ffe5393ebc17625d2ba364b216865a0))

## [3.3.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.3.0...v3.3.1) (2026-10-17)


### Bug Fixes

* simplified errors scaffolding format ([2d0e315](https://github.com/alevnyacow/domain-first-project-structure/commit/2d0e31528068f0d8e7efa6dfa8db35b3ff1e639e))

# [3.3.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.2.2...v3.3.0) (2026-10-17)


### Features

* swagger ([88e1fea](https://github.com/alevnyacow/domain-first-project-structure/commit/88e1fea45cf6bb52875bdbbd78e7cda822030b95))

## [3.2.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.2.1...v3.2.2) (2026-10-17)


### Bug Fixes

* infrastructure can use application ports ([f3ada8a](https://github.com/alevnyacow/domain-first-project-structure/commit/f3ada8a5c32a109883f2728f1d993d8b227a477f))

## [3.2.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.2.0...v3.2.1) (2026-10-17)


### Bug Fixes

* `.of` in unit tests for entities and vos (including aggregate roots), ([ac234b2](https://github.com/alevnyacow/domain-first-project-structure/commit/ac234b2a60aef8d745d513d12cc73d92bf7a8059))

# [3.2.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.1.0...v3.2.0) (2026-10-17)


### Features

* in-memory db implementation out of the box ([79cd77a](https://github.com/alevnyacow/domain-first-project-structure/commit/79cd77ae14ff73e8b278586ae3e8fc72fd89681e))

# [3.1.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v3.0.0...v3.1.0) (2026-10-16)


### Features

* next prompt, adapter auto detecting ([82e405b](https://github.com/alevnyacow/domain-first-project-structure/commit/82e405b2cd63f85af183777179bff533123ea822))

# [3.0.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.18.1...v3.0.0) (2026-10-16)


### Features

* scaffolder ([a44e39f](https://github.com/alevnyacow/domain-first-project-structure/commit/a44e39f5dac7d387c0270c475078af894bc72777))


### BREAKING CHANGES

* new skills, new cli format

## [2.18.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.18.0...v2.18.1) (2026-10-15)


### Bug Fixes

* readme, api.md ([7d36dc0](https://github.com/alevnyacow/domain-first-project-structure/commit/7d36dc089c0c38218b6d465254586611303e7585))

# [2.18.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.17.1...v2.18.0) (2026-10-14)


### Features

* skills ([91a4aaa](https://github.com/alevnyacow/domain-first-project-structure/commit/91a4aaa0a09bf599536b8eb75d9431a3e831c4f7))

## [2.17.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.17.0...v2.17.1) (2026-10-12)


### Bug Fixes

* openapi extractor ([4a520f6](https://github.com/alevnyacow/domain-first-project-structure/commit/4a520f63a34e97f4150250f2aef8277bbf86dfd2))

# [2.17.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.16.2...v2.17.0) (2026-10-12)


### Features

* openapi extractor ([a69ef32](https://github.com/alevnyacow/domain-first-project-structure/commit/a69ef32b5dd305758624ba7501018e0d26b3479d))

## [2.16.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.16.1...v2.16.2) (2026-10-12)


### Bug Fixes

* path parameters support ([fc72a0f](https://github.com/alevnyacow/domain-first-project-structure/commit/fc72a0fda954cd33f65d8c37cc9a6cc9978a2cfe))

## [2.16.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.16.0...v2.16.1) (2026-10-11)


### Bug Fixes

* barrel imports in rename/movereact widgets ([a36d0b5](https://github.com/alevnyacow/domain-first-project-structure/commit/a36d0b5bb4f066c284dae1db3cbef9a9fdef0b14))

# [2.16.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.15.1...v2.16.0) (2026-10-11)


### Features

* move or rename pages and widgets ([8fa0362](https://github.com/alevnyacow/domain-first-project-structure/commit/8fa0362ee862c78e51e089387121354452ba8605))

## [2.15.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.15.0...v2.15.1) (2026-10-11)


### Bug Fixes

* openapi generation without trailing empty string ([903d4a5](https://github.com/alevnyacow/domain-first-project-structure/commit/903d4a51e5c7a814f5d7704d66e694bd699e02b7))

# [2.15.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.14.2...v2.15.0) (2026-10-11)


### Features

* openapi generation script, orval ([c8cb4a6](https://github.com/alevnyacow/domain-first-project-structure/commit/c8cb4a691fe36d0e2454b9cc110a2c51dde8321c))

## [2.14.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.14.1...v2.14.2) (2026-10-11)


### Bug Fixes

* full path name for widgets and pages ([683427e](https://github.com/alevnyacow/domain-first-project-structure/commit/683427e21c1449dfc0d4b675419d90bb08a12ab8))

## [2.14.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.14.0...v2.14.1) (2026-10-11)


### Bug Fixes

* simplified integration terminal outputs ([0379e1c](https://github.com/alevnyacow/domain-first-project-structure/commit/0379e1cd2c8577a4fc01a73c2c56c4d2af27e256))

# [2.14.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.13.1...v2.14.0) (2026-10-11)


### Features

* vitest and playwright integrations ([288762f](https://github.com/alevnyacow/domain-first-project-structure/commit/288762f159019684ea43d561c4fae6df20723268))

## [2.13.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.13.0...v2.13.1) (2026-10-11)


### Bug Fixes

* gitignore for prisma build files, lint ignore message ([64e58c5](https://github.com/alevnyacow/domain-first-project-structure/commit/64e58c53da681873583664ee9ef024db8be1ae26))

# [2.13.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.12.0...v2.13.0) (2026-10-11)


### Features

* add integrations ([0048d90](https://github.com/alevnyacow/domain-first-project-structure/commit/0048d90ca7dcb0da4b135e0d35c50f36eb98b6f7))

# [2.12.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.11.0...v2.12.0) (2026-10-11)


### Features

* automatic wiring ([f6971c3](https://github.com/alevnyacow/domain-first-project-structure/commit/f6971c329c76129cb33b5960a86a3cde1b5aa9d2))

# [2.11.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.10.4...v2.11.0) (2026-10-10)


### Bug Fixes

* missing files ([2ea3a9f](https://github.com/alevnyacow/domain-first-project-structure/commit/2ea3a9ffba7fc358059a879eed7f7308668bf8f1))


### Features

* nested names for react pages and widgets ([21ec208](https://github.com/alevnyacow/domain-first-project-structure/commit/21ec2085c42f81ec919a1ded3be6585618a5413e))

## [2.10.4](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.10.3...v2.10.4) (2026-10-08)


### Bug Fixes

* constructor in orchestrated commands / queries ([7a246ce](https://github.com/alevnyacow/domain-first-project-structure/commit/7a246cee25a2dc2a54649a5f4f458619a0abdfe3))

## [2.10.3](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.10.2...v2.10.3) (2026-10-06)


### Bug Fixes

* domain services can be scaffolded from shared ([25db2fa](https://github.com/alevnyacow/domain-first-project-structure/commit/25db2fab494d0712729e76c85561597300ed60f1))

## [2.10.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.10.1...v2.10.2) (2026-10-04)


### Bug Fixes

* added trims ([c9120dd](https://github.com/alevnyacow/domain-first-project-structure/commit/c9120dd0b9b92e0830d25f521885f2e5e02d58c8))

## [2.10.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.10.0...v2.10.1) (2026-10-04)


### Bug Fixes

* file override check ([747b551](https://github.com/alevnyacow/domain-first-project-structure/commit/747b55171f481a1cffd4aa1e47027515bf4ed0ce))

# [2.10.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.9.1...v2.10.0) (2026-10-04)


### Features

* scaffolding entities and value objects ([270a826](https://github.com/alevnyacow/domain-first-project-structure/commit/270a826291467ad58752788eac6faeec5561861e))

## [2.9.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.9.0...v2.9.1) (2026-10-04)


### Bug Fixes

* stories for widget ui ([a406b69](https://github.com/alevnyacow/domain-first-project-structure/commit/a406b693335b840e89e739513906223610bc1272))

# [2.9.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.8.1...v2.9.0) (2026-10-04)


### Features

* scaffold shared react hook ([9344d1d](https://github.com/alevnyacow/domain-first-project-structure/commit/9344d1dd7ba4f29bf06bc832c7f044c40b8d202e))

## [2.8.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.8.0...v2.8.1) (2026-10-04)


### Bug Fixes

* always generate unit tests, no barrel-files with logic ([2090de9](https://github.com/alevnyacow/domain-first-project-structure/commit/2090de9607139b8e98e3218a8e5f311bd60d909d))

# [2.8.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.7.5...v2.8.0) (2026-10-03)


### Features

* UI-Kit module scaffolding ([834836a](https://github.com/alevnyacow/domain-first-project-structure/commit/834836a1a0d5dc0f1dac14412d5f48df4d0aeb14))

## [2.7.5](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.7.4...v2.7.5) (2026-10-03)


### Bug Fixes

* naming ([50b378d](https://github.com/alevnyacow/domain-first-project-structure/commit/50b378d8a5891edc3c08b608096a5377cdb69b3b))

## [2.7.4](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.7.3...v2.7.4) (2026-10-02)


### Bug Fixes

* default persistence layer implementation for repos ([f074a7a](https://github.com/alevnyacow/domain-first-project-structure/commit/f074a7a5190dd95f495df88455e004286d5c3c10))

## [2.7.3](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.7.2...v2.7.3) (2026-10-01)


### Bug Fixes

* unit-tests without wiring ([8923c78](https://github.com/alevnyacow/domain-first-project-structure/commit/8923c78531fdeeaaf7c603c12676f25c8ba801c2))

## [2.7.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.7.1...v2.7.2) (2026-10-01)


### Bug Fixes

* paths fixes ([7ea5d50](https://github.com/alevnyacow/domain-first-project-structure/commit/7ea5d50ce8bb633bb6cd9f40aac9ae31c562a61f))

## [2.7.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.7.0...v2.7.1) (2026-10-01)


### Bug Fixes

* new README ([f01c061](https://github.com/alevnyacow/domain-first-project-structure/commit/f01c06147ee4d8b065c65fe0ee76d6f2f41c6326))

# [2.7.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.6.0...v2.7.0) (2026-10-01)


### Features

* infrastructure services, application services, presentation services ([fae522b](https://github.com/alevnyacow/domain-first-project-structure/commit/fae522b76e83d9b08f5842891540ef80418196b2))

# [2.6.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.5.0...v2.6.0) (2026-09-27)


### Features

* application-ports as separate wiring folder ([91caa60](https://github.com/alevnyacow/domain-first-project-structure/commit/91caa60ad02abac830d8aadd1e9cbeafb7f76275))

# [2.5.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.4.0...v2.5.0) (2026-09-22)


### Features

* unit-tests for queries, trim in command unit-tests file ([aa1a675](https://github.com/alevnyacow/domain-first-project-structure/commit/aa1a6751a834cb311725137954bef7629e21ee81))

# [2.4.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.3.1...v2.4.0) (2026-09-22)


### Features

* command unit-tests, fixed orchestrated command wiring folder ([f8211c7](https://github.com/alevnyacow/domain-first-project-structure/commit/f8211c765cab2f9eee47dcd714192d965125e808))

## [2.3.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.3.0...v2.3.1) (2026-09-22)


### Bug Fixes

* added readme ([15a7da2](https://github.com/alevnyacow/domain-first-project-structure/commit/15a7da26099cabb35647cb64f618e32c2cf87280))

# [2.3.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.2.0...v2.3.0) (2026-09-22)


### Features

* unit tests for application ports, default `api` implementation type ([e5351e6](https://github.com/alevnyacow/domain-first-project-structure/commit/e5351e6c8536747452eec4b29df352a117cd52ae))

# [2.2.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.1.0...v2.2.0) (2026-09-22)


### Features

* unit tests library, unit tests for aggregate ([c3ac8d3](https://github.com/alevnyacow/domain-first-project-structure/commit/c3ac8d3ca71dd7bf38620e0300c925a4fe04be5b))

# [2.1.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.0.1...v2.1.0) (2026-09-22)


### Features

* scaffold react page ([81042e7](https://github.com/alevnyacow/domain-first-project-structure/commit/81042e77e6f664ff77d1aedd50ee81f7d7cae131))

## [2.0.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v2.0.0...v2.0.1) (2026-09-22)


### Bug Fixes

* removed unused `logic` fiels ([676faa0](https://github.com/alevnyacow/domain-first-project-structure/commit/676faa078c59bdcbdf01985eb4903882735883cc))

# [2.0.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.2.0...v2.0.0) (2026-09-22)


### Features

* simplified wiring files, simplified API, all rest handlers already ([eac0507](https://github.com/alevnyacow/domain-first-project-structure/commit/eac05075eb7ea47cda063c46655640183f27a940))


### BREAKING CHANGES

* new contracts, new structure

# [1.2.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.1.3...v1.2.0) (2026-09-20)


### Features

* react modules scaffolding ([e0efa54](https://github.com/alevnyacow/domain-first-project-structure/commit/e0efa5471512fa6d89d53f2a2e9f066e8b6e32e0))

## [1.1.3](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.1.2...v1.1.3) (2026-09-17)


### Bug Fixes

* removed `type Handler` ([491717d](https://github.com/alevnyacow/domain-first-project-structure/commit/491717d9974bd3d9400c32f61aea2cc6ea4152b7))

## [1.1.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.1.1...v1.1.2) (2026-09-17)


### Bug Fixes

* passed urls as array ([048b616](https://github.com/alevnyacow/domain-first-project-structure/commit/048b616ad386b232e9ae42f56e20dce5fb6403dc))

## [1.1.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.1.0...v1.1.1) (2026-09-17)


### Bug Fixes

* `context/endpoint` url in endpoints instead of `context-endpoint` ([b486b22](https://github.com/alevnyacow/domain-first-project-structure/commit/b486b22ffae70046f36935346d884919e0b7fc37))

# [1.1.0](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.0.2...v1.1.0) (2026-09-17)


### Features

* orchestrator queries and commands ([a264d29](https://github.com/alevnyacow/domain-first-project-structure/commit/a264d29ae8394aa6261e511b5cfc2ba5cb1261f0))

## [1.0.2](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.0.1...v1.0.2) (2026-08-27)


### Bug Fixes

* no presentation actions for shared layer, no inner folders for application ([2ed16d0](https://github.com/alevnyacow/domain-first-project-structure/commit/2ed16d06273d3dfa1053bbd3d4f44a851e3d4531))

## [1.0.1](https://github.com/alevnyacow/domain-first-project-structure/compare/v1.0.0...v1.0.1) (2026-08-27)


### Bug Fixes

* `logic` is private in scaffolded endpoint files ([f6c4faa](https://github.com/alevnyacow/domain-first-project-structure/commit/f6c4faa3d8b5f630e9620734fa71cbbfc97e899c))

# 1.0.0 (2026-08-26)


### Features

* added semver ([44d98c4](https://github.com/alevnyacow/domain-first-project-structure/commit/44d98c4fe00dafb1b0b60ebb1f2fffed92ea137d))
