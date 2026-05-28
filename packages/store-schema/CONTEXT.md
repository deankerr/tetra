# Store Schema

The store-schema context defines the language for Tetra's durable TinyBase data shape and the boundary where that shape is applied to raw TinyBase objects.

## Language

**Tetra store schema**:
The package-owned definition of Tetra's durable TinyBase tables, values, and indexes. It describes the storage shape, not core behavior or app workflow.
_Avoid_: Tetra DB, app state schema

**rawStore and rawIndexes**:
The paired TinyBase store and indexes after Tetra's schema and index definitions have been applied, before persisted or synchronized data has been loaded and before typed app APIs are bound.
_Avoid_: runtime, Tetra DB

**Index definitions**:
Tetra's named TinyBase index definitions belong to the store-schema package and are applied as part of rawStore/rawIndexes creation.
_Avoid_: Consumer-applied index setup
