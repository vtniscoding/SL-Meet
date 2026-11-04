import './fonts/fonts.css';
import logoPrimary from './images/brand/logo-primary.png';
import andyNote from './images/illustrations/andy-note.png';
import ad11s from './videos/ads/ad-11s.mp4';

// Primary asset exports
export { logoPrimary, andyNote, ad11s };

// Backwards-compatible aliases
export const brandLogo = logoPrimary;
export const videoAds = ad11s;

export default {
  logoPrimary,
  brandLogo,
  andyNote,
  ad11s,
  videoAds,
};
