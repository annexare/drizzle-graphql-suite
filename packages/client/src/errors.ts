export type GraphQLErrorLocation = {
  line: number
  column: number
}

export type GraphQLErrorEntry = {
  message: string
  locations?: GraphQLErrorLocation[]
  path?: (string | number)[]
  extensions?: Record<string, unknown>
}

export class GraphQLClientError extends Error {
  readonly errors: GraphQLErrorEntry[]
  readonly status: number

  constructor(errors: GraphQLErrorEntry[], status = 200) {
    const message = errors.map((e) => e.message).join('; ')
    super(message)
    this.name = 'GraphQLClientError'
    this.errors = errors
    this.status = status
  }
}

export class NetworkError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'NetworkError'
    this.status = status
  }
}
