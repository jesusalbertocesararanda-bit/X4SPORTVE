import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateByPassword,
  canAccessConfiguration,
  completeFirstTimeLogin,
  DEFAULT_AUTHORIZED_USERS,
  findAuthorizedUser,
  generateOtpCode,
  isAdminUser,
  MAIN_ADMIN_EMAIL,
  verifyOtpCode,
  type ERPUser,
} from './auth';
import type { AuthorizedUserRecord } from '../types/erp';

test('auth: MAIN_ADMIN_EMAIL is jesusalbertocesararanda@gmail.com', () => {
  assert.equal(MAIN_ADMIN_EMAIL, 'jesusalbertocesararanda@gmail.com');
  const mainAdmin = DEFAULT_AUTHORIZED_USERS.find(
    (u) => u.email === MAIN_ADMIN_EMAIL,
  );
  assert.ok(mainAdmin, 'Main admin must exist in default authorized users');
  assert.equal(mainAdmin?.role, 'admin');
});

test('auth: canAccessConfiguration strictly enforces main admin email', () => {
  const mainAdminUser: ERPUser = {
    id: 'u-main',
    email: 'jesusalbertocesararanda@gmail.com',
    name: 'Jesús César',
    role: 'admin',
    title: 'Administrador Principal',
    phone: '',
    avatarBg: 'bg-blue-600',
  };
  const aliasUser: ERPUser = {
    id: 'u-alias',
    email: 'jesus@x4sport.app',
    name: 'Jesús César',
    role: 'admin',
    title: 'Administrador Principal',
    phone: '',
    avatarBg: 'bg-blue-600',
  };
  const partnerUser: ERPUser = {
    id: 'u-partner',
    email: 'josue@x4sport.app',
    name: 'Josué Ojeda',
    role: 'partner',
    title: 'Socio Operativo',
    phone: '',
    avatarBg: 'bg-emerald-600',
  };
  const otherAdmin: ERPUser = {
    id: 'u-other',
    email: 'otheradmin@x4sport.app',
    name: 'Otro Admin',
    role: 'admin',
    title: 'Administrador',
    phone: '',
    avatarBg: 'bg-indigo-600',
  };

  assert.equal(canAccessConfiguration(mainAdminUser), true);
  assert.equal(canAccessConfiguration(aliasUser), true);
  assert.equal(canAccessConfiguration(partnerUser), false);
  assert.equal(canAccessConfiguration(otherAdmin), false);
  assert.equal(canAccessConfiguration(null), false);
  assert.equal(canAccessConfiguration(undefined), false);
});

test('auth: isAdminUser permits admin roles', () => {
  const partnerUser: ERPUser = {
    id: 'u-partner',
    email: 'josue@x4sport.app',
    name: 'Josué Ojeda',
    role: 'partner',
    title: 'Socio Operativo',
    phone: '',
    avatarBg: 'bg-emerald-600',
  };
  const adminUser: ERPUser = {
    id: 'u-admin',
    email: 'jesusalbertocesararanda@gmail.com',
    name: 'Jesús César',
    role: 'admin',
    title: 'Administrador Principal',
    phone: '',
    avatarBg: 'bg-blue-600',
  };

  assert.equal(isAdminUser(adminUser), true);
  assert.equal(isAdminUser(partnerUser), false);
  assert.equal(isAdminUser(null), false);
});

test('auth: authenticateByPassword rejects unregistered emails', () => {
  const res = authenticateByPassword('unknown@x4sport.app', 'pass123');
  assert.equal(res.ok, false);
  assert.ok(res.error?.includes('no está registrado'));
});

test('auth: authenticateByPassword detects firstLoginPending', () => {
  const preRegistered: AuthorizedUserRecord[] = [
    {
      id: 'user-new',
      email: 'newuser@x4sport.app',
      name: 'Nuevo Socio',
      role: 'partner',
      firstLoginPending: true,
      createdAt: '2026-11-17T00:00:00.000Z',
    },
  ];

  const res = authenticateByPassword('newuser@x4sport.app', 'anypass', preRegistered);
  assert.equal(res.ok, false);
  assert.equal(res.isFirstLoginPending, true);
  assert.ok(res.error?.includes('primer ingreso'));
});

test('auth: authenticateByPassword validates correct credentials', () => {
  const res = authenticateByPassword('jesusalbertocesararanda@gmail.com', 'jesus2026');
  assert.equal(res.ok, true);
  assert.equal(res.user?.email, 'jesusalbertocesararanda@gmail.com');
  assert.equal(res.user?.role, 'admin');

  const badRes = authenticateByPassword('jesusalbertocesararanda@gmail.com', 'wrongpassword');
  assert.equal(badRes.ok, false);
  assert.ok(badRes.error?.includes('Contraseña incorrecta'));
});

test('auth: completeFirstTimeLogin verifies OTP and saves new password', () => {
  const preRegistered: AuthorizedUserRecord[] = [
    {
      id: 'user-test',
      email: 'testpartner@x4sport.app',
      name: 'Test Partner',
      role: 'partner',
      firstLoginPending: true,
      createdAt: '2026-11-17T00:00:00.000Z',
    },
  ];

  // Fallback 123456 verifies in test runner
  const res = completeFirstTimeLogin(
    'testpartner@x4sport.app',
    '123456',
    'mypassword2026',
    preRegistered,
  );

  assert.equal(res.ok, true);
  assert.equal(res.user?.email, 'testpartner@x4sport.app');
  assert.ok(res.updatedUsers, 'updatedUsers must be returned');

  const updatedTarget = res.updatedUsers?.find(
    (u) => u.email === 'testpartner@x4sport.app',
  );
  assert.equal(updatedTarget?.firstLoginPending, false);
  assert.equal(updatedTarget?.password, 'mypassword2026');
});
