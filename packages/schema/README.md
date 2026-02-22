# @drizzle-graphql-suite/schema

> Part of [`drizzle-graphql-suite`](https://github.com/annexare/drizzle-graphql-suite).
> See also: [`client`](../client/README.md) | [`query`](../query/README.md)

Auto-generates a complete GraphQL schema with CRUD operations, relation-level filtering, and hooks from Drizzle PostgreSQL schemas.

## Installation

```bash
bun add @drizzle-graphql-suite/schema
```

```bash
npm install @drizzle-graphql-suite/schema
```

Or install the full suite:

```bash
bun add drizzle-graphql-suite
```

```bash
npm install drizzle-graphql-suite
```

## Motivation

Inspired by [`drizzle-graphql`](https://github.com/drizzle-team/drizzle-graphql), this package is a purpose-built replacement focused on PostgreSQL. Key improvements:

- **Small generated schema** — the generated schema stays compact even when supporting self-relations and deeply nested relations, thanks to configurable depth limiting (`limitRelationDepth`, `limitSelfRelationDepth`), per-relation pruning (`pruneRelations`), and per-table control (`tables.exclude`, per-table `queries`/`mutations` toggles) — up to 90% schema size reduction when tuned
- **Native PostgreSQL JSON/JSONB support** — `json` and `jsonb` columns map to a custom `JSON` GraphQL scalar, so structured data passes through without manual type wiring
- **Relation-level filtering** with EXISTS subqueries (`some`/`every`/`none` quantifiers)
- **Per-operation hooks system** (before/after/resolve) for auth, audit, and custom logic
- **Count queries** with full filter support
- **`buildEntities()`** for composable schema building (avoids redundant schema validation)
- **Configurable query/mutation suffixes** for naming customization
- **Self-relation depth limiting** — separate from general depth, prevents exponential type growth
- **Relation pruning** — `false`, `'leaf'`, or `{ only: [...] }` per relation
- **`buildSchemaFromDrizzle()`** — no database connection needed (for codegen/introspection)
- **Code generation** — `generateSDL`, `generateTypes`, `generateEntityDefs`
- **Architecture** — TypeScript source, PostgreSQL-only, `SchemaBuilder` class, type caching, lazy thunks for circular relations
- **Bug fixes** — relation filter join conditions (Drizzle v0.44+), operator map replacements, `catch (e: unknown)` narrowing

## API Reference

### `buildSchema(db, config?)`

Builds a complete `GraphQLSchema` with all CRUD operations from a Drizzle database instance. Returns `{ schema, entities }`.

```ts
import { buildSchema } from 'drizzle-graphql-suite/schema'
import { createYoga } from 'graphql-yoga'
import { db } from './db'

const { schema, entities } = buildSchema(db, {
  limitRelationDepth: 3,
  tables: { exclude: ['session'] },
})

const yoga = createYoga({ schema })
```

### `buildEntities(db, config?)`

Returns `GeneratedEntities` only — queries, mutations, inputs, and types — without constructing a `GraphQLSchema`. Use this when composing into a larger schema (e.g., Pothos) to avoid redundant schema validation.

```ts
import { buildEntities } from 'drizzle-graphql-suite/schema'

const entities = buildEntities(db, { mutations: false })
// entities.queries, entities.mutations, entities.inputs, entities.types
```

### `buildSchemaFromDrizzle(drizzleSchema, config?)`

Builds a schema directly from Drizzle schema exports — no database connection or `.env` required. Resolvers are stubs. Intended for schema introspection and code generation.

```ts
import { buildSchemaFromDrizzle } from 'drizzle-graphql-suite/schema'
import * as schema from './db/schema'

const { schema: graphqlSchema } = buildSchemaFromDrizzle(schema)
```

## Configuration

`BuildSchemaConfig` controls all aspects of schema generation:

### `mutations`

Enable or disable mutation generation globally.

- **Type**: `boolean`
- **Default**: `true`

### `limitRelationDepth`

Maximum depth of nested relation fields on queries. Set to `0` to omit relations, `undefined` for no limit.

- **Type**: `number | undefined`
- **Default**: `3`

### `limitSelfRelationDepth`

Maximum occurrences of the same table via direct self-relations (e.g., `asset.template → asset`). At `1`, self-relation fields are omitted entirely. At `2`, one level of expansion is allowed. Cross-table paths that revisit a table reset the counter and use `limitRelationDepth` instead.

- **Type**: `number`
- **Default**: `1`

### `suffixes`

Customize query field name suffixes for list and single queries.

- **Type**: `{ list?: string; single?: string }`
- **Default**: `{ list: '', single: 'Single' }`

### `tables`

Per-table schema control:

```ts
{
  tables: {
    // Remove tables entirely (relations to them are silently skipped)
    exclude: ['session', 'verification'],
    // Per-table operation overrides
    config: {
      auditLog: { queries: true, mutations: false },
      user: { mutations: false },
    },
  },
}
```

- `exclude` — `string[]` — tables removed from the schema entirely
- `config` — `Record<string, TableOperations>` — per-table `queries` and `mutations` booleans

### `pruneRelations`

Fine-grained per-relation pruning. Keys are `tableName.relationName`:

```ts
{
  pruneRelations: {
    // Omit this relation field entirely
    'asset.childAssets': false,
    // Expand with scalar columns only (no nested relations)
    'user.posts': 'leaf',
    // Expand with only the listed child relations
    'post.comments': { only: ['author'] },
  },
}
```

- `false` — relation field omitted entirely from parent type
- `'leaf'` — relation expands with scalar columns only
- `{ only: string[] }` — relation expands with only the listed child relation fields

### `hooks`

Per-table, per-operation hooks. See [Hooks System](#hooks-system).

### `debug`

Enable diagnostic logging for schema size and relation tree.

- **Type**: `boolean | { schemaSize?: boolean; relationTree?: boolean }`
- **Default**: `undefined`

## Hooks System

Hooks intercept operations for auth, validation, audit logging, or custom resolution.

### Hook Types

Each operation supports either **before/after** hooks or a **resolve** hook (not both):

| Hook | Timing | Use Case |
|------|--------|----------|
| `before` | Before default resolver | Auth checks, argument transformation, pass data to `after` |
| `after` | After default resolver | Audit logging, result transformation |
| `resolve` | Replaces default resolver | Full control, custom data sources |

### Operations

| Operation | Type | Description |
|-----------|------|-------------|
| `query` | Read | List query |
| `querySingle` | Read | Single record query |
| `count` | Read | Count query |
| `insert` | Write | Batch insert |
| `insertSingle` | Write | Single record insert |
| `update` | Write | Update mutation |
| `delete` | Write | Delete mutation |

### Example

```ts
buildSchema(db, {
  hooks: {
    user: {
      query: {
        before: async ({ args, context }) => {
          if (!context.user) throw new Error('Unauthorized')
          // Optionally modify args or pass data to after hook
          return { args, data: { startTime: Date.now() } }
        },
        after: async ({ result, beforeData }) => {
          console.log(`Query took ${Date.now() - beforeData.startTime}ms`)
          return result
        },
      },
      delete: {
        resolve: async ({ args, context, defaultResolve }) => {
          // Soft delete instead of hard delete
          return defaultResolve({ ...args, set: { deletedAt: new Date() } })
        },
      },
    },
  },
})
```

## Relation Filtering

Filter by related rows using EXISTS subqueries with `some`, `every`, and `none` quantifiers.

```graphql
query {
  users(where: {
    posts: {
      some: { published: { eq: true } }
      none: { flagged: { eq: true } }
    }
  }) {
    id
    name
    posts {
      title
    }
  }
}
```

- **`some`** — at least one related row matches
- **`every`** — all related rows match
- **`none`** — no related rows match

For one-to-one relations, filters apply directly (no quantifiers needed):

```graphql
query {
  posts(where: {
    author: { role: { eq: "admin" } }
  }) {
    title
  }
}
```

## Generated Operations

| Pattern | Example (`user` table) | Type |
|---------|----------------------|------|
| `{table}` | `user` | Single query |
| `{table}{listSuffix}` | `users` | List query |
| `{table}Count` | `userCount` | Count query |
| `insertInto{Table}` | `insertIntoUser` | Batch insert |
| `insertInto{Table}Single` | `insertIntoUserSingle` | Single insert |
| `update{Table}` | `updateUser` | Update |
| `deleteFrom{Table}` | `deleteFromUser` | Delete |

## Column Type Mapping

| Drizzle Type | GraphQL Type |
|-------------|--------------|
| `boolean` | `Boolean` |
| `text`, `varchar`, `char` | `String` |
| `integer`, `smallint`, `serial`, `smallserial`, `bigserial` | `Int` |
| `real`, `doublePrecision`, `numeric` | `Float` |
| `bigint` | `String` |
| `date`, `timestamp`, `time` | `String` |
| `json`, `jsonb` | `JSON` (custom scalar) |
| `bytea` | `[Int!]` |
| `vector` | `[Float!]` |
| `geometry` | `PgGeometryObject { x, y }` |
| `enum` | Generated `GraphQLEnumType` |

## Code Generation

Three code generation functions for producing static artifacts from a GraphQL schema:

### `generateSDL(schema)`

Generates the GraphQL Schema Definition Language string.

```ts
import { buildSchemaFromDrizzle, generateSDL } from 'drizzle-graphql-suite/schema'
import * as drizzleSchema from './db/schema'
import { writeFileSync } from 'node:fs'

const { schema } = buildSchemaFromDrizzle(drizzleSchema)
writeFileSync('schema.graphql', generateSDL(schema))
```

### `generateTypes(schema, options?)`

Generates TypeScript types: wire format types (Date → string), filter types, insert/update input types, and orderBy types. Optionally imports Drizzle types for precise wire format derivation.

```ts
import { generateTypes } from 'drizzle-graphql-suite/schema'

const types = generateTypes(schema, {
  drizzle: {
    importPath: '@myapp/db/schema',
    typeNames: { userProfile: 'UserProfile' },
  },
})
writeFileSync('generated/types.ts', types)
```

### `generateEntityDefs(schema, options?)`

Generates a runtime schema descriptor object and `EntityDefs` type for the client package. This is an alternative to `createDrizzleClient` — useful when you want to ship pre-built schema metadata.

```ts
import { generateEntityDefs } from 'drizzle-graphql-suite/schema'

const entityDefs = generateEntityDefs(schema, {
  drizzle: { importPath: '@myapp/db/schema' },
})
writeFileSync('generated/entity-defs.ts', entityDefs)
```

### Full Codegen Script

```ts
import { buildSchemaFromDrizzle, generateSDL, generateTypes, generateEntityDefs } from 'drizzle-graphql-suite/schema'
import * as drizzleSchema from './db/schema'
import { writeFileSync, mkdirSync } from 'node:fs'

const { schema } = buildSchemaFromDrizzle(drizzleSchema)

mkdirSync('generated', { recursive: true })
writeFileSync('generated/schema.graphql', generateSDL(schema))
writeFileSync('generated/types.ts', generateTypes(schema, {
  drizzle: { importPath: '@myapp/db/schema' },
}))
writeFileSync('generated/entity-defs.ts', generateEntityDefs(schema, {
  drizzle: { importPath: '@myapp/db/schema' },
}))
```

## `GeneratedEntities` Type

The return type from `buildEntities()` and `buildSchema()`:

```ts
type GeneratedEntities = {
  queries: Record<string, GraphQLFieldConfig<any, any>>
  mutations: Record<string, GraphQLFieldConfig<any, any>>
  inputs: Record<string, GraphQLInputObjectType>
  types: Record<string, GraphQLObjectType>
}
```

- **`queries`** — all generated query field configs, spreadable into a parent schema
- **`mutations`** — all generated mutation field configs
- **`inputs`** — filter, insert, update, and orderBy input types by name
- **`types`** — output object types by table name
