import cookieParser from 'cookie-parser'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'

import { config } from './config.js'
import { createMockAuthProvider } from './auth/mockProvider.js'
import { createUpstreamAuthProvider } from './auth/upstreamProvider.js'
import { createAuthRouter } from './routes/auth.js'

function createAuthProvider() {
  if (config.authProviderMode === 'upstream') {
    return createUpstreamAuthProvider(config.upstream)
  }

  return createMockAuthProvider()
}

function sendFrontendIndex(response: Response): void {
  if (!existsSync(config.frontend.indexFile)) {
    response.status(404).send('Frontend build not found.')
    return
  }

  response.sendFile(config.frontend.indexFile)
}

export function createApp(): Express {
  const app = express()
  const authProvider = createAuthProvider()

  app.disable('x-powered-by')

  if (config.nodeEnv === 'production') {
    app.set('trust proxy', 1)
  }

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.get('/api/health', (_, response) => {
    response.status(200).json({
      ok: true,
      provider: config.authProviderMode,
      environment: config.nodeEnv,
    })
  })

  app.use('/api/auth', createAuthRouter(authProvider, config.cookies))

  if (config.frontend.serve) {
    app.use(express.static(config.frontend.distDir, { index: false, maxAge: '1h' }))

    app.get(/^\/(?!api(?:\/|$)).*/, (request, response, next) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        next()
        return
      }

      if (request.accepts('html')) {
        sendFrontendIndex(response)
        return
      }

      next()
    })
  }

  app.use((request: Request, response: Response) => {
    if (request.path.startsWith('/api/')) {
      response.status(404).json({
        code: 'UNKNOWN_ERROR',
        message: 'API route not found.',
      })
      return
    }

    response.status(404).send('Not Found')
  })

  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      if (error instanceof SyntaxError && 'body' in error) {
        response.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Malformed JSON payload.',
        })
        return
      }

      response.status(500).json({
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error.',
      })
    },
  )

  return app
}
