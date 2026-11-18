import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react';
import type { AuthorizedUserRecord } from '../types/erp';
import {
  authenticateByPassword,
  completeFirstTimeLogin,
  findAuthorizedUser,
  generateOtpCode,
  MAIN_ADMIN_EMAIL,
  verifyOtpCode,
  type ERPUser,
} from '../utils/auth';

interface LoginModalProps {
  onLoginSuccess: (user: ERPUser) => void;
  authorizedUsers?: AuthorizedUserRecord[];
  onUpdateAuthorizedUsers?: (users: AuthorizedUserRecord[]) => void;
}

export function LoginModal({
  onLoginSuccess,
  authorizedUsers,
  onUpdateAuthorizedUsers,
}: LoginModalProps) {
  const [tab, setTab] = useState<'password' | 'otp' | 'first-time'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const startFirstTimeFlow = (targetEmail: string) => {
    generateOtpCode(targetEmail);
    setTab('first-time');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setInfoMessage(
      `Se detectó tu primer ingreso al ERP. Hemos enviado el código de verificación OTP al correo autorizado (${targetEmail}). Ingrésalo manualmente para activar tu contraseña personal.`,
    );
  };

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    const res = authenticateByPassword(cleanEmail, password, authorizedUsers);

    if (res.isFirstLoginPending) {
      startFirstTimeFlow(cleanEmail);
      return;
    }

    if (!res.ok || !res.user) {
      setError(
        res.error ??
          'Credenciales incorrectas. Verifica tu correo y contraseña.',
      );
      return;
    }

    onLoginSuccess(res.user);
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    const record = findAuthorizedUser(cleanEmail, authorizedUsers);
    if (!record) {
      setError(
        `El correo "${email}" no está registrado. Solicita acceso al Administrador Principal (${MAIN_ADMIN_EMAIL}).`,
      );
      return;
    }

    if (record.firstLoginPending) {
      startFirstTimeFlow(cleanEmail);
      return;
    }

    generateOtpCode(cleanEmail);
    setOtpSent(true);
    setInfoMessage(
      `Código OTP enviado al correo autorizado (${email.trim()}). Revisa tu bandeja e ingrésalo manualmente para continuar.`,
    );
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otpCode.trim();

    if (!cleanOtp) {
      setError('Ingresa el código OTP de 6 dígitos.');
      return;
    }

    const isValid = verifyOtpCode(cleanEmail, cleanOtp);
    if (!isValid) {
      setError('Código OTP inválido o expirado. Ingresa un código válido de 6 dígitos.');
      return;
    }

    const record = findAuthorizedUser(cleanEmail, authorizedUsers);
    if (!record) {
      setError('Usuario no encontrado en los registros del sistema.');
      return;
    }

    const user: ERPUser = {
      id: record.id,
      email: record.email,
      name: record.name,
      role: record.role,
      title: record.title || (record.role === 'admin' ? 'Administrador Principal' : 'Socio Operativo'),
      phone: record.phone || '',
      avatarBg: record.avatarBg || (record.role === 'admin' ? 'bg-blue-600' : 'bg-emerald-600'),
    };

    onLoginSuccess(user);
  };

  const handleCompleteFirstTime = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otpCode.trim();

    if (!cleanOtp) {
      setError('Ingresa el código OTP recibido.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setError('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden. Verifícalas cuidadosamente.');
      return;
    }

    const result = completeFirstTimeLogin(
      cleanEmail,
      cleanOtp,
      newPassword,
      authorizedUsers,
    );

    if (!result.ok || !result.user) {
      setError(result.error ?? 'Error al configurar tu cuenta de usuario.');
      return;
    }

    if (result.updatedUsers && onUpdateAuthorizedUsers) {
      onUpdateAuthorizedUsers(result.updatedUsers);
    }

    onLoginSuccess(result.user);
  };

  return (
    <div
      data-testid="login-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040812]/92 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#080F1E] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-3 shadow-inner">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            X4SPORT <span className="text-blue-500">ERP</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sistema de Autenticación Multi-Usuario y Control de Roles SAP
          </p>
        </div>

        {tab !== 'first-time' && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#0D1526] p-1 border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setTab('password');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                tab === 'password'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Contraseña</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('otp');
                setOtpSent(false);
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                tab === 'otp'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Código OTP</span>
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200 flex items-start gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Tab 1: Password Login */}
        {tab === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="ejemplo@x4sport.app o tu correo"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#070D19] pl-10 pr-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Contraseña de Acceso
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#070D19] pl-10 pr-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="btn-login-submit"
              className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-semibold text-white transition-colors hover:bg-blue-500 shadow-lg shadow-blue-600/20 active:scale-[0.99]"
            >
              <UserCheck className="h-4 w-4" />
              <span>Iniciar Sesión en ERP</span>
            </button>
          </form>
        )}

        {/* Tab 2: OTP Login */}
        {tab === 'otp' && (
          <div className="space-y-4">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="otp-email"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Correo Electrónico Autorizado
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      id="otp-email"
                      type="email"
                      required
                      placeholder="ejemplo@x4sport.app o tu correo"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#070D19] pl-10 pr-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-semibold text-white transition-colors hover:bg-blue-500 shadow-lg shadow-blue-600/20"
                >
                  <Zap className="h-4 w-4" />
                  <span>Enviar Código OTP al Correo</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div
                  role="status"
                  data-testid="otp-sent-confirmation"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200"
                >
                  <p className="font-semibold mb-1">Código OTP enviado a tu correo</p>
                  <p className="text-[11px] text-emerald-300/85">
                    Hemos enviado un código temporal de 6 dígitos al correo autorizado{' '}
                    <span className="font-mono font-bold text-white">{email}</span>. Ingrésalo manualmente debajo.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="otp-code-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Ingresa el Código de 6 Dígitos
                  </label>
                  <input
                    id="otp-code-input"
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full text-center font-mono text-lg tracking-widest min-h-[44px] rounded-xl border border-slate-700 bg-[#070D19] px-3.5 py-2 text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setError(null);
                    }}
                    className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-[#0D1526] text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    className="flex-2 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Verificar e Ingresar</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab 3: First-time Login / Password Setup */}
        {tab === 'first-time' && (
          <form onSubmit={handleCompleteFirstTime} className="space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
              <p className="font-semibold mb-1">Primer Ingreso de Usuario Pre-registrado</p>
              <p className="text-[11px] text-blue-300/85">
                Ingresa manualmente el código OTP enviado a tu correo autorizado ({email}) y define la contraseña personal que usarás para acceder al ERP.
              </p>
            </div>

            <div>
              <label
                htmlFor="first-time-otp"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Código OTP de Verificación (6 dígitos)
              </label>
              <input
                id="first-time-otp"
                type="text"
                required
                maxLength={6}
                placeholder="Ingresa los 6 dígitos"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full text-center font-mono text-base tracking-widest min-h-[42px] rounded-xl border border-slate-700 bg-[#070D19] px-3.5 py-2 text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="first-time-newpass"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Nueva Contraseña Personal
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  id="first-time-newpass"
                  type="password"
                  required
                  placeholder="Mínimo 4 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-[#070D19] pl-10 pr-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="first-time-confirmpass"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Confirmar Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  id="first-time-confirmpass"
                  type="password"
                  required
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-[#070D19] pl-10 pr-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTab('password');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-[#0D1526] text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Cancelar</span>
              </button>
              <button
                type="submit"
                className="flex-2 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
              >
                <UserCheck className="h-4 w-4" />
                <span>Activar y Entrar</span>
              </button>
            </div>
          </form>
        )}

        {/* Public Catalog Link for End-Clients */}
        <div className="mt-8 border-t border-slate-800/80 pt-5 text-center">
          <p className="text-xs text-slate-400">
            ¿Eres cliente final? Puedes ver nuestro{' '}
            <a
              href="?catalogo=1"
              className="text-blue-400 font-semibold underline hover:text-blue-300"
            >
              Catálogo Público en Tiempo Real
            </a>{' '}
            sin necesidad de iniciar sesión.
          </p>
        </div>
      </div>
    </div>
  );
}
