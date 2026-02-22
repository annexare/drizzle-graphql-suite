import { GraphQLScalarType, Kind } from 'graphql'

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description:
    'The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).',

  serialize(value: unknown) {
    return value
  },

  parseValue(value: unknown) {
    return value
  },

  // biome-ignore lint/suspicious/noExplicitAny: JSON scalar returns dynamic types
  parseLiteral(ast): any {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value
      case Kind.INT:
      case Kind.FLOAT:
        return parseFloat(ast.value)
      case Kind.OBJECT: {
        // biome-ignore lint/suspicious/noExplicitAny: JSON object accumulator
        const value: Record<string, any> = Object.create(null)
        ast.fields.forEach((field) => {
          value[field.name.value] = GraphQLJSON.parseLiteral(field.value)
        })
        return value
      }
      case Kind.LIST:
        return ast.values.map((n) => GraphQLJSON.parseLiteral(n))
      case Kind.NULL:
        return null
      default:
        return undefined
    }
  },
})
