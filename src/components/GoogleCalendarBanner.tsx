import { Calendar, CheckCircle2, LogOut } from 'lucide-react';
import type { GoogleCalendarAuthState } from '../utils/googleCalendar';

interface GoogleCalendarBannerProps {
  authState: GoogleCalendarAuthState;
  onConnect: () => Promise<boolean>;
  onDisconnect: () => Promise<void>;
  variant?: 'card' | 'compact';
  contextText?: string;
}

function GoogleSignInButton({
  disabled,
  onClick,
  label = 'Sign in with Google',
  testId = 'btn-google-signin',
}: {
  disabled: boolean;
  onClick: () => void;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="gsi-material-button"
      aria-label={label}
    >
      <div className="gsi-material-button-state" />
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            style={{ display: 'block' }}
            aria-hidden="true"
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </div>
        <span className="gsi-material-button-contents">
          {disabled ? 'Conectando...' : label}
        </span>
        <span style={{ display: 'none' }}>{label}</span>
      </div>
    </button>
  );
}

export function GoogleCalendarBanner({
  authState,
  onConnect,
  onDisconnect,
  variant = 'compact',
  contextText,
}: GoogleCalendarBannerProps) {
  if (variant === 'card') {
    return (
      <section
        aria-label="Integración con Google Calendar"
        data-testid="google-calendar-settings-card"
        className="space-y-3 rounded-xl border border-slate-800 bg-[#080E1C] p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-white">
                Google Calendar Automático
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Agenda automáticamente en tu calendario la llegada estimada de compras en tránsito y recordatorios de ventas pendientes o con fecha de entrega.
            </p>
          </div>

          {authState.isConnected ? (
            <div className="flex flex-col items-start gap-2 sm:items-end shrink-0">
              <span
                data-testid="google-calendar-connected-badge"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {authState.userEmail || authState.userName || 'Conectado'}
              </span>
              <button
                type="button"
                data-testid="btn-google-signout"
                onClick={() => void onDisconnect()}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1526] px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Desconectar Google
              </button>
            </div>
          ) : (
            <div className="shrink-0">
              <GoogleSignInButton
                disabled={authState.isConnecting}
                onClick={() => void onConnect()}
                testId="btn-google-signin-settings"
              />
            </div>
          )}
        </div>

        {authState.error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
          >
            {authState.error}
          </p>
        )}
      </section>
    );
  }

  return (
    <div
      data-testid="google-calendar-compact-banner"
      className={`rounded-xl border px-3.5 py-2.5 ${
        authState.isConnected
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-blue-500/30 bg-blue-500/10'
      }`}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Calendar
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              authState.isConnected ? 'text-emerald-300' : 'text-blue-300'
            }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">
              {authState.isConnected
                ? `Google Calendar activo (${authState.userEmail || authState.userName || 'Cuenta conectada'})`
                : 'Conecta Google Calendar para agendar automáticamente'}
            </p>
            {contextText && (
              <p className="mt-0.5 text-[11px] text-slate-300">{contextText}</p>
            )}
          </div>
        </div>

        {authState.isConnected ? (
          <button
            type="button"
            data-testid="btn-google-signout-compact"
            onClick={() => void onDisconnect()}
            className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-700 bg-[#080E1C] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white sm:self-center"
          >
            <LogOut className="h-3 w-3" aria-hidden="true" />
            Desconectar
          </button>
        ) : (
          <div className="shrink-0">
            <GoogleSignInButton
              disabled={authState.isConnecting}
              onClick={() => void onConnect()}
              testId="btn-google-signin-compact"
            />
          </div>
        )}
      </div>

      {authState.error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200"
        >
          {authState.error}
        </p>
      )}
    </div>
  );
}
