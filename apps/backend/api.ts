import { Elysia, t } from 'elysia'

export const createAPI = (prefix = '') => 
  new Elysia({ prefix })
    .get('/', () => ({ hello: 'Bun👋' }))
    .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
    .post('/echo', ({ body }) => ({ echo: body }), {
      body: t.Object({
        message: t.String()
      })
    })
    .get('/users/:id', ({ params }) => ({ 
      user: { id: params.id, name: `User ${params.id}` } 
    }), {
      params: t.Object({
        id: t.String()
      })
    })