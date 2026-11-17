import { useId } from 'react';
import type { TeamCategory } from '../types/erp';

interface TeamPalette {
  primary: string;
  secondary: string;
  accent: string;
  stripeType: 'vertical' | 'solid' | 'sash' | 'hechter';
  badgeText: string;
}

export function getTeamVisualPalette(
  team: TeamCategory,
  model = '',
): TeamPalette {
  const lowerTeam = team.toLowerCase();
  const lowerModel = model.toLowerCase();

  if (lowerTeam.includes('barcelona') || lowerModel.includes('barcelona')) {
    return {
      primary: '#004D98',
      secondary: '#A50044',
      accent: '#EDBB00',
      stripeType: 'vertical',
      badgeText: 'FCB',
    };
  }
  if (lowerTeam.includes('real madrid') || lowerModel.includes('real madrid')) {
    return {
      primary: '#F8FAFC',
      secondary: '#1E293B',
      accent: '#D4AF37',
      stripeType: 'solid',
      badgeText: 'RMA',
    };
  }
  if (
    lowerTeam.includes('manchester city') ||
    lowerModel.includes('manchester city')
  ) {
    return {
      primary: '#6CABDD',
      secondary: '#1C2C5B',
      accent: '#FFC659',
      stripeType: 'solid',
      badgeText: 'MCI',
    };
  }
  if (lowerTeam.includes('psg') || lowerModel.includes('psg')) {
    return {
      primary: '#004170',
      secondary: '#DA291C',
      accent: '#FFFFFF',
      stripeType: 'hechter',
      badgeText: 'PSG',
    };
  }
  if (lowerModel.includes('argentina')) {
    return {
      primary: '#75AADB',
      secondary: '#FFFFFF',
      accent: '#D4AF37',
      stripeType: 'vertical',
      badgeText: 'ARG',
    };
  }
  if (lowerModel.includes('venezuela') || lowerModel.includes('vinotinto')) {
    return {
      primary: '#6D1A36',
      secondary: '#3A0A1B',
      accent: '#D4AF37',
      stripeType: 'solid',
      badgeText: 'VEN',
    };
  }
  if (lowerModel.includes('brasil')) {
    return {
      primary: '#FACC15',
      secondary: '#16A34A',
      accent: '#1D4ED8',
      stripeType: 'solid',
      badgeText: 'BRA',
    };
  }
  if (lowerModel.includes('españa') || lowerModel.includes('espana')) {
    return {
      primary: '#B91C1C',
      secondary: '#7F1D1D',
      accent: '#FACC15',
      stripeType: 'solid',
      badgeText: 'ESP',
    };
  }
  if (lowerModel.includes('liverpool') || lowerModel.includes('arsenal')) {
    return {
      primary: '#C8102E',
      secondary: '#7F1D1D',
      accent: '#F8FAFC',
      stripeType: 'solid',
      badgeText: lowerModel.includes('arsenal') ? 'ARS' : 'LIV',
    };
  }
  if (lowerModel.includes('inter miami')) {
    return {
      primary: '#F472B6',
      secondary: '#0F172A',
      accent: '#FFFFFF',
      stripeType: 'solid',
      badgeText: 'MIA',
    };
  }

  return {
    primary: '#2563EB',
    secondary: '#0F172A',
    accent: '#60A5FA',
    stripeType: 'sash',
    badgeText: team.slice(0, 3).toUpperCase() || 'X4S',
  };
}

export function TeamCrest({
  team,
  className = 'h-8 w-8',
}: {
  team: TeamCategory;
  className?: string;
}) {
  const lower = team.toLowerCase();

  if (lower.includes('barcelona')) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M8 10 C8 6, 40 6, 40 10 L40 24 C40 35, 24 43, 24 43 C24 43, 8 35, 8 24 Z"
          fill="#004D98"
          stroke="#EDBB00"
          strokeWidth="2.5"
        />
        <path d="M9.5 11 L24 11 L24 22 L9.5 22 Z" fill="#F8FAFC" />
        <path d="M16.75 11 L16.75 22 M9.5 16.5 L24 16.5" stroke="#DC2626" strokeWidth="3" />
        <path d="M24 11 L38.5 11 L38.5 22 L24 22 Z" fill="#FACC15" />
        <path d="M27 11 L27 22 M31.5 11 L31.5 22 M36 11 L36 22" stroke="#DC2626" strokeWidth="2" />
        <rect x="9.5" y="22" width="29" height="4" fill="#EDBB00" />
        <path d="M13 26 L13 33 M19 26 L19 37 M25 26 L25 39 M31 26 L31 36 M35 26 L35 31" stroke="#A50044" strokeWidth="3" />
        <circle cx="24" cy="31" r="4.2" fill="#EDBB00" stroke="#0F172A" strokeWidth="1" />
      </svg>
    );
  }

  if (lower.includes('real madrid')) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M17 10 L21 6 L24 10 L27 6 L31 10 L30 14 L18 14 Z"
          fill="#D4AF37"
        />
        <circle
          cx="24"
          cy="28"
          r="14"
          fill="#F8FAFC"
          stroke="#D4AF37"
          strokeWidth="2.8"
        />
        <path d="M13 35 L33 19" stroke="#2563EB" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="24" cy="28" r="7" fill="none" stroke="#D4AF37" strokeWidth="2" />
      </svg>
    );
  }

  if (lower.includes('manchester city')) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={className}
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="#6CABDD"
          stroke="#FFFFFF"
          strokeWidth="2.5"
        />
        <circle cx="24" cy="24" r="13.5" fill="#1C2C5B" stroke="#FFC659" strokeWidth="1.5" />
        <path
          d="M17 17 H31 V26 C31 31, 24 34, 24 34 C24 34, 17 31, 17 26 Z"
          fill="#6CABDD"
          stroke="#FFC659"
          strokeWidth="1.4"
        />
        <path d="M18 25 H30 M20 21 H28" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (lower.includes('psg')) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={className}
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="#004170"
          stroke="#FFFFFF"
          strokeWidth="2.5"
        />
        <circle cx="24" cy="24" r="13" fill="none" stroke="#DA291C" strokeWidth="1.5" />
        <path
          d="M24 12 L29 33 H19 Z"
          fill="#DA291C"
          stroke="#FFFFFF"
          strokeWidth="1.2"
        />
        <circle cx="24" cy="34" r="2.2" fill="#FACC15" />
      </svg>
    );
  }

  if (lower.includes('selecciones')) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={className}
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="#0F172A"
          stroke="#3B82F6"
          strokeWidth="2.5"
        />
        <circle cx="24" cy="24" r="12" fill="none" stroke="#60A5FA" strokeWidth="1.6" />
        <ellipse cx="24" cy="24" rx="6" ry="12" fill="none" stroke="#60A5FA" strokeWidth="1.4" />
        <path d="M12 24 H36" stroke="#60A5FA" strokeWidth="1.4" />
        <path d="M24 8 L25.6 12 H29.8 L26.4 14.5 L27.6 18.5 L24 16 L20.4 18.5 L21.6 14.5 L18.2 12 H22.4 Z" fill="#FACC15" />
      </svg>
    );
  }

  const palette = getTeamVisualPalette(team);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M10 10 H38 V25 C38 35, 24 42, 24 42 C24 42, 10 35, 10 25 Z"
        fill={palette.primary}
        stroke={palette.accent}
        strokeWidth="2.5"
      />
      <text
        x="24"
        y="27"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="11"
        fontWeight="700"
        fontFamily="Outfit, sans-serif"
      >
        {palette.badgeText}
      </text>
    </svg>
  );
}

export function JerseyShowcaseFallback({
  team,
  model,
  version,
}: {
  team: TeamCategory;
  model: string;
  version: string;
}) {
  const clipId = useId();
  const palette = getTeamVisualPalette(team, model);
  const isLightPrimary =
    palette.primary.toUpperCase() === '#F8FAFC' ||
    palette.primary.toUpperCase() === '#FACC15';

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0E182D] to-[#070D19] p-4">
      <svg
        viewBox="0 0 180 160"
        className="h-32 w-36 drop-shadow-lg"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <path d="M52 24 L74 18 Q90 28 106 18 L128 24 L158 50 L142 74 L126 62 L126 142 H54 V62 L38 74 L22 50 Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x="18" y="14" width="144" height="134" fill={palette.primary} />
          {palette.stripeType === 'vertical' && (
            <>
              <rect x="44" y="14" width="18" height="134" fill={palette.secondary} />
              <rect x="81" y="14" width="18" height="134" fill={palette.secondary} />
              <rect x="118" y="14" width="18" height="134" fill={palette.secondary} />
            </>
          )}
          {palette.stripeType === 'hechter' && (
            <>
              <rect x="78" y="14" width="24" height="134" fill={palette.secondary} />
              <rect x="75" y="14" width="3" height="134" fill="#FFFFFF" />
              <rect x="102" y="14" width="3" height="134" fill="#FFFFFF" />
            </>
          )}
          {palette.stripeType === 'sash' && (
            <path
              d="M40 20 L140 140 L156 126 L56 6 Z"
              fill={palette.secondary}
              opacity="0.7"
            />
          )}
        </g>
        <path
          d="M52 24 L74 18 Q90 28 106 18 L128 24 L158 50 L142 74 L126 62 L126 142 H54 V62 L38 74 L22 50 Z"
          fill="none"
          stroke={palette.accent}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M74 18 Q90 30 106 18"
          fill="none"
          stroke={palette.accent}
          strokeWidth="3"
        />
        <circle
          cx="106"
          cy="56"
          r="9"
          fill={isLightPrimary ? '#1E293B' : '#0B1324'}
          stroke={palette.accent}
          strokeWidth="1.5"
        />
        <text
          x="106"
          y="59"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="6.5"
          fontWeight="700"
          fontFamily="Outfit, sans-serif"
        >
          {palette.badgeText}
        </text>
      </svg>
      <span className="mt-1 text-[11px] font-medium tracking-wide text-slate-400">
        {version}
      </span>
    </div>
  );
}
