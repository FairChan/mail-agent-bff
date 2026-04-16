/**
 * 认证相关类型
 */

export type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  passwordSalt: string;
  passwordHash: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserView = {
  id: string;
  email: string;
  displayName: string;
  locale: string;
};
