import type { AnyEntityDefs, GraphQLClient, SchemaDescriptor } from 'drizzle-graphql-suite/client'

export type GraphQLClientContext<
  TSchema extends SchemaDescriptor = SchemaDescriptor,
  TDefs extends AnyEntityDefs = AnyEntityDefs,
> = {
  client: GraphQLClient<TSchema, TDefs>
}
