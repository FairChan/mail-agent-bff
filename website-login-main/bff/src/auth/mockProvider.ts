import {
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

import type {
  AuthProviderResult,
  AuthProviderSession,
  AuthUser,
  LoginRequestBody,
  RegisterRequestBody,
} from '../types.js'
import { validateLoginInput, validateRegisterInput } from './validation.js'
import type { AuthProvider } from './provider.js'

interface MockUserRecord {
  id: string
  email: string
  displayName: string
  passwordSalt: string
  passwordHash: string
}

interface MockSessionRecord {
  userId: string
  accessToken: string
  refreshToken?: string
  createdAt: string
  expiresAt?: string
}

function userToPublicUser(user: MockUserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  }
}

function derivePassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function buildPasswordRecord(password: string): { passwordSalt: string; passwordHash: string } {
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = derivePassword(password, passwordSalt)

  return { passwordSalt, passwordHash }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function buildDisplayName(username: string): string {
  return username
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

export class MockAuthProvider implements AuthProvider {
  private readonly usersByEmail = new Map<string, MockUserRecord>()
  private readonly usersById = new Map<string, MockUserRecord>()
  private readonly sessions = new Map<string, MockSessionRecord>()

  constructor() {
    this.seedDemoUser()
  }

  async login(input: LoginRequestBody): Promise<AuthProviderResult> {
    const validationError = validateLoginInput(input)
    if (validationError) {
      return { ok: false, error: validationError }
    }

    const email = normalizeEmail(input.email)
    const user = this.usersByEmail.get(email)

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'The email or password is incorrect.',
        },
      }
    }

    const providedHash = derivePassword(input.password, user.passwordSalt)
    if (!constantTimeEqual(providedHash, user.passwordHash)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'The email or password is incorrect.',
        },
      }
    }

    return {
      ok: true,
      user: userToPublicUser(user),
      session: this.createSession(user.id, input.remember),
    }
  }

  async register(input: RegisterRequestBody): Promise<AuthProviderResult> {
    const validationError = validateRegisterInput(input)
    if (validationError) {
      return { ok: false, error: validationError }
    }

    const email = normalizeEmail(input.email)
    if (this.usersByEmail.has(email)) {
      return {
        ok: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
        },
      }
    }

    const id = randomUUID()
    const { passwordSalt, passwordHash } = buildPasswordRecord(input.password)
    const user: MockUserRecord = {
      id,
      email,
      displayName: buildDisplayName(input.username),
      passwordSalt,
      passwordHash,
    }

    this.usersByEmail.set(email, user)
    this.usersById.set(id, user)

    return {
      ok: true,
      user: userToPublicUser(user),
      session: this.createSession(user.id, true),
    }
  }

  async me(session: AuthProviderSession): Promise<AuthProviderResult> {
    const record = this.findSession(session)
    if (!record) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired or invalid.',
        },
      }
    }

    const user = this.usersById.get(record.userId)
    if (!user) {
      this.deleteSession(record)
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired or invalid.',
        },
      }
    }

    return {
      ok: true,
      user: userToPublicUser(user),
    }
  }

  async logout(session: AuthProviderSession): Promise<AuthProviderResult | void> {
    const record = this.findSession(session)
    if (!record) {
      return
    }

    this.deleteSession(record)
  }

  private seedDemoUser(): void {
    const id = 'demo-user'
    const { passwordSalt, passwordHash } = buildPasswordRecord('MailPilot123!')
    const user: MockUserRecord = {
      id,
      email: 'demo@mailpilot.com',
      displayName: 'MailPilot Demo',
      passwordSalt,
      passwordHash,
    }

    this.usersByEmail.set(user.email, user)
    this.usersById.set(user.id, user)
  }

  private createSession(userId: string, remember: boolean): AuthProviderSession {
    const accessToken = randomUUID()
    const refreshToken = remember ? randomUUID() : undefined

    this.sessions.set(accessToken, {
      userId,
      accessToken,
      refreshToken,
      createdAt: new Date().toISOString(),
      expiresAt: remember ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() : undefined,
    })

    if (refreshToken) {
      this.sessions.set(refreshToken, this.sessions.get(accessToken)!)
    }

    return {
      accessToken,
      refreshToken,
    }
  }

  private findSession(session: AuthProviderSession): MockSessionRecord | undefined {
    const token = session.accessToken || session.refreshToken
    if (!token) {
      return undefined
    }

    const record = this.sessions.get(token)
    if (!record) {
      return undefined
    }

    if (record.expiresAt && Date.now() > Date.parse(record.expiresAt)) {
      this.deleteSession(record)
      return undefined
    }

    return record
  }

  private deleteSession(record: MockSessionRecord): void {
    this.sessions.delete(record.accessToken)
    if (record.refreshToken) {
      this.sessions.delete(record.refreshToken)
    }
  }
}

export function createMockAuthProvider(): AuthProvider {
  return new MockAuthProvider()
}
