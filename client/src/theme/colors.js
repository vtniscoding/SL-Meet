/**
 * SL-Meet Standardized Color Design Tokens
 * --------------------------------------------------------------------------
 * Single Source of Truth for all color palettes across the application.
 *
 * Rules:
 * 1. Brand Primary: #5CA0F2 (Sky Blue) - used for primary CTAs, active brand elements.
 * 2. Meeting Room: Google Meet Dark Theme (#202124, #3C4043, #8AB4F8, #EA4335).
 * 3. Dashboard / Portal: Material Light Theme (#F8FAFC, #E9EEF6, #0B57D0).
 * 4. Roles: Signer (#5CA0F2) vs Speaker (#10B981).
 */

export const brandColors = {
  primary: '#5CA0F2',
  hover: '#4A8FE0',
  active: '#3B7ECE',
  subtle: '#EBF3FD',
  border: 'rgba(92, 160, 242, 0.4)',
};

export const roomColors = {
  // Canvases
  bg: '#121212',             // Ultra dark meeting room backdrop
  surface: '#202124',        // Control bar, drawers header, modals
  surfaceSubtle: '#28292C',  // 3-dots popup menu, floating cards

  // Buttons & Controls
  button: '#3C4043',         // Inactive control buttons (mic on, cam on, layout)
  buttonHover: '#474B4F',    // Hover state on inactive buttons
  active: '#8AB4F8',         // Active toggle accent (captions on, screen share on)
  activeText: '#202124',     // Dark text contrast on #8AB4F8

  // Alerts & Danger
  danger: '#EA4335',         // Mic off, camera off, end call
  dangerHover: '#D93025',    // End call / mic off hover

  // Borders
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.15)',
};

export const dashboardColors = {
  bg: '#EAECEE',             // Refined Zoom Workplace light gray backdrop
  card: '#FFFFFF',           // Card and container surface
  border: '#E2E8F0',         // Soft slate-200 border

  // Material 3 Code Input Pill
  pillBg: '#E9EEF6',         // Soft grayish-blue pill background
  pillFocusBorder: 'rgba(11, 87, 208, 0.3)',
  pillSubmit: '#0B57D0',     // Join active button blue
  pillSubmitHover: '#0842A0',

  // Typography
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
};

export const statusColors = {
  success: '#10B981',        // Emerald success
  warning: '#F59E0B',        // Amber warning
  danger: '#EA4335',         // Red alert
  info: '#5CA0F2',           // Brand info
};

export const roleColors = {
  signer: {
    primary: '#5CA0F2',
    bg: 'rgba(92, 160, 242, 0.12)',
    border: 'rgba(92, 160, 242, 0.35)',
    text: '#5CA0F2',
    name: 'Signer',
  },
  speaker: {
    primary: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#10B981',
    name: 'Speaker',
  },
};

export const appTheme = {
  brand: brandColors,
  room: roomColors,
  dashboard: dashboardColors,
  status: statusColors,
  role: roleColors,
};

export default appTheme;
