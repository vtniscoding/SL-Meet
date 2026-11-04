import React, { useState } from 'react';
import { colorForSender } from '../../utils/captionUtils.js';
import { UserAvatarIcon as User } from '@sl-meet/shared/icons';

/**
 * Universal Participant Avatar Component
 * --------------------------------------
 * 1. If avatarUrl exists and image loads successfully -> renders user's uploaded avatar image.
 * 2. If no avatarUrl or image load fails -> renders clean circular avatar with user's initial and consistent avatarColor.
 */
export default function ParticipantAvatar({
  name = '',
  avatarUrl = null,
  avatarColor = null,
  id = null,
  className = 'w-7 h-7 text-xs',
  iconSize = 'w-4 h-4',
  alt = 'Avatar',
}) {
  const [imgError, setImgError] = useState(false);

  const cleanName = (name || '')
    .replace(/\s*\(You\)/i, '')
    .replace(/\s*\(Presentation\)/i, '')
    .trim();

  const initial = cleanName ? cleanName.charAt(0).toUpperCase() : '';
  const bgColor = avatarColor || colorForSender(id || cleanName || 'user');

  if (avatarUrl && !imgError) {
    return (
      <div
        className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center select-none shadow-xs ${className}`}
        style={{ backgroundColor: bgColor }}
      >
        <img
          src={avatarUrl}
          alt={alt || cleanName || 'Avatar'}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none shadow-xs ${className}`}
      style={{ backgroundColor: bgColor }}
      title={cleanName || name}
    >
      {initial || <User className={`${iconSize} text-white/90`} />}
    </div>
  );
}

