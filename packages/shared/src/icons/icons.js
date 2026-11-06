/**
 * Standardized Application Icon Registry (Design System Icons)
 * -------------------------------------------------------------
 * Centralized place for all icons used across the SL-Meet application.
 *
 * Benefits:
 * 1. Single source of truth: To change or replace any icon in the app,
 *    simply update its mapping here instead of searching across multiple components.
 * 2. Semantic naming: Icons are named by their function/action (e.g. MicOnIcon, CaptionsIcon)
 *    rather than their visual library name.
 * 3. Easy custom SVG support: Can be swapped with custom SVGs or different icon libraries
 *    without touching consuming components.
 *
 * Usage:
 *   import { MicOnIcon, CameraOffIcon, AppIcons } from '../icons';
 *   // or
 *   import AppIcons from '../icons';
 *   <AppIcons.MicOn className="w-5 h-5 text-white" />
 */

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faVideo,
  faVideoSlash,
  faMicrophone,
  faMicrophoneSlash,
  faHouseUser,
  faComment,
  faCamera,
  faGear,
  faClosedCaptioning,
  faPhoneSlash,
  faHands,
  faUserGroup,
  faBell,
} from '@fortawesome/free-solid-svg-icons';
import '@fortawesome/fontawesome-svg-core/styles.css';

import {
  // Meeting Controls
  PhoneOff,
  Monitor,
  MonitorUp,
  ALargeSmall,
  Pin,
  PinOff,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Grid,
  Sidebar,
  Columns,
  LayoutTemplate,
  Info,
  MoreVertical,
  Check,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserX,
  Volume2,

  // AI, Vision & Captions
  Captions,
  AudioLines,
  Eye,
  EyeOff,
  Hand,
  Sparkles,
  Type,
  AlignLeft,
  Globe,

  // Navigation, Drawers & Communication
  Home,
  Calendar,
  MoreHorizontal,
  MessageSquare,
  Users,
  Search,
  Send,
  X,
  Settings,
  FileText,
  Download,
  Upload,
  Plus,
  Key,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  LogOut,
  Pencil,
  Trash2,
  Copy,
  History,

  // Status, Feedback & System
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Cpu,
  Radio,
  Server,
  Terminal,
  Play,
  Pause,
  Save,
  RefreshCw,
  Mail,
  Lock,
  User,
  Camera,
  Keyboard,
  Zap,
} from 'lucide-react';

/* =========================================================================
   1. Meeting Controls (Audio, Video, Screen Share, Call Management)
   ========================================================================= */
// Font Awesome solid microphone/microphone-slash icons for audio controls
// Normalized to 576x512 viewBox to match faMicrophoneSlash and faVideo/faVideoSlash,
// eliminating any size differences or layout shifts when toggling mute state.
export const MicOnIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = {
    overflow: 'visible',
    ...(size ? { width: size, height: size } : {}),
    ...style,
  };
  return React.createElement(
    'svg',
    {
      viewBox: '-96 0 576 512',
      fill: 'currentColor',
      className,
      style: customStyle,
      role: 'img',
      'aria-hidden': 'true',
      ...props,
    },
    React.createElement('path', { d: faMicrophone.icon[4] })
  );
};

export const MicOffIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = {
    overflow: 'visible',
    ...(size ? { width: size, height: size } : {}),
    ...style,
  };
  return React.createElement(
    'svg',
    {
      viewBox: '0 0 576 512',
      fill: 'currentColor',
      className,
      style: customStyle,
      role: 'img',
      'aria-hidden': 'true',
      ...props,
    },
    React.createElement('path', { d: faMicrophoneSlash.icon[4] })
  );
};

// Font Awesome video/video-slash icons for camera controls
export const CameraOnIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faVideo,
    className,
    style: customStyle,
    ...props,
  });
};

export const CameraOffIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faVideoSlash,
    className,
    style: customStyle,
    ...props,
  });
};
export const ScreenShareIcon = MonitorUp;
export const EndCallIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faPhoneSlash,
    className,
    style: customStyle,
    ...props,
  });
};
export const PinIcon = Pin;
export const UnpinIcon = PinOff;
export const VolumeIcon = Volume2;
export const FullscreenIcon = Maximize2;
export const TiledLayoutIcon = Grid;
export const GalleryLayoutIcon = Grid;
export const SidebarLayoutIcon = Columns || Sidebar;
export const SpotlightLayoutIcon = LayoutTemplate;
export const SpeakerLayoutIcon = LayoutTemplate;
export const InfoIcon = Info;
export const RoomDetailsIcon = Info;
export const PictureInPictureIcon = PictureInPicture2;
export const ExpandPipIcon = Maximize2;
export const MinimizePipIcon = Minimize2;
export const MoreOptionsIcon = MoreVertical;
export const CheckmarkIcon = Check;
export const ChevronDownIcon = ChevronDown;
export const ChevronUpIcon = ChevronUp;
export const ViewDropdownIcon = ChevronDown;

// Zoom-Style Solid / Filled Layout Icons
export const ZoomSpeakerFillIcon = ({ className = 'w-4 h-4', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 16 16', fill: 'currentColor', className, ...props },
    React.createElement('rect', { x: '1', y: '2', width: '3.5', height: '2.5', rx: '0.5' }),
    React.createElement('rect', { x: '6.25', y: '2', width: '3.5', height: '2.5', rx: '0.5' }),
    React.createElement('rect', { x: '11.5', y: '2', width: '3.5', height: '2.5', rx: '0.5' }),
    React.createElement('rect', { x: '1', y: '6', width: '14', height: '8', rx: '1' })
  );

export const ZoomGalleryFillIcon = ({ className = 'w-4 h-4', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 16 16', fill: 'currentColor', className, ...props },
    React.createElement('rect', { x: '1.5', y: '1.5', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '6.25', y: '1.5', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '11', y: '1.5', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '1.5', y: '6.25', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '6.25', y: '6.25', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '11', y: '6.25', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '1.5', y: '11', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '6.25', y: '11', width: '3.5', height: '3.5', rx: '0.6' }),
    React.createElement('rect', { x: '11', y: '11', width: '3.5', height: '3.5', rx: '0.6' })
  );

export const ZoomSideBySideFillIcon = ({ className = 'w-4 h-4', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 16 16', fill: 'currentColor', className, ...props },
    React.createElement('rect', { x: '1.5', y: '2', width: '3.5', height: '12', rx: '0.8' }),
    React.createElement('rect', { x: '6.25', y: '2', width: '3.5', height: '12', rx: '0.8' }),
    React.createElement('rect', { x: '11', y: '2', width: '3.5', height: '12', rx: '0.8' })
  );

/* =========================================================================
   2. AI, Vision, Gesture & Captions
   ========================================================================= */
export const CaptionsIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faClosedCaptioning,
    className,
    style: customStyle,
    ...props,
  });
};
export const HandTrackingOnIcon = Eye;
export const HandTrackingOffIcon = EyeOff;
export const AiInspectorIcon = Eye;
export const SignGestureIcon = Hand;
export const AiTranslateIcon = Sparkles;
export const SparklesIcon = Sparkles;
export const TextFontIcon = Type;
export const GlobeIcon = Globe;
export const HandsIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faHands,
    className,
    style: customStyle,
    ...props,
  });
};
export const UserGroupIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faUserGroup,
    className,
    style: customStyle,
    ...props,
  });
};
export const AudioLinesIcon = AudioLines;
export const MicAudioLinesIcon = AudioLines;
export const TtFontSizeIcon = ({ className = 'w-5 h-5', size = 20, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, minWidth: size, minHeight: size, ...style } : style;
  return React.createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: `${className} shrink-0`,
      style: customStyle,
      ...props,
    },
    // Capital 'A' (Full standard icon height)
    React.createElement('path', { d: 'm2.5 19 5-14 5 14' }),
    React.createElement('path', { d: 'M4.5 14h6' }),
    // Lowercase 'a'
    React.createElement('path', { d: 'M15 19v-5.5a3 3 0 0 1 6 0V19' }),
    React.createElement('path', { d: 'M21 16.5h-6' })
  );
};
export const TextAlignLeftIcon = AlignLeft;
export const HardwareCameraIcon = Camera;
export const AIFeatureIcon = Zap;
export const FocusTargetIcon = ({ className = 'w-4 h-4', ...props }) =>
  React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className,
      ...props,
    },
    React.createElement('path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }),
    React.createElement('path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }),
    React.createElement('path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }),
    React.createElement('path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }),
    React.createElement('circle', { cx: '12', cy: '12', r: '3' })
  );

/* =========================================================================
   3. Navigation, Drawers & Interaction
   ========================================================================= */
// Font Awesome Solid Sidebar Navigation Icons
export const HomeNavIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faHouseUser,
    className,
    style: customStyle,
    ...props,
  });
};

export const ChatNavIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faComment,
    className,
    style: customStyle,
    ...props,
  });
};

export const MeetingsNavIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faVideo,
    className,
    style: customStyle,
    ...props,
  });
};
export const CalendarNavIcon = MeetingsNavIcon; // alias

export const SettingsFilledIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faGear,
    className,
    style: customStyle,
    ...props,
  });
};
export const SettingsNavIcon = SettingsFilledIcon; // alias for filled sidebar setting

export const MediaPipeLogoIcon = ({ className = 'w-5 h-5', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', className, ...props },
    React.createElement('path', {
      fill: '#007F99',
      d: 'M2.182 0C1 0 .037.94.002 2.114L0 2.182v6.545a2.182 2.182 0 0 0 4.364 0V2.182A2.182 2.182 0 0 0 2.182 0Zm6.545 0c-1.182 0-2.145.94-2.18 2.114l-.002.068v13.09a2.182 2.182 0 0 0 4.364 0V2.183A2.182 2.182 0 0 0 8.727 0Zm6.546 0a2.182 2.182 0 0 0-2.182 2.182 2.182 2.182 0 0 0 2.182 2.182 2.182 2.182 0 0 0 2.182-2.182A2.182 2.182 0 0 0 15.273 0Zm6.545 0c-1.182 0-2.145.94-2.18 2.114l-.002.068v19.636a2.182 2.182 0 0 0 4.364 0V2.182A2.182 2.182 0 0 0 21.818 0Zm-6.545 6.545c-1.183 0-2.145.94-2.181 2.114l-.001.068v13.091a2.182 2.182 0 0 0 4.364 0V8.728a2.182 2.182 0 0 0-2.182-2.183zM2.182 13.091c-1.182 0-2.145.94-2.18 2.114L0 15.273v6.545a2.182 2.182 0 0 0 4.364 0v-6.545a2.182 2.182 0 0 0-2.182-2.182zm6.545 6.545a2.182 2.182 0 0 0-2.182 2.182A2.182 2.182 0 0 0 8.727 24a2.182 2.182 0 0 0 2.182-2.182 2.182 2.182 0 0 0-2.182-2.182Z',
    })
  );

export const TensorFlowLogoIcon = ({ className = 'w-5 h-5', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', className, ...props },
    React.createElement('path', {
      fill: '#FF6F00',
      d: 'M1.292 5.856L11.54 0v24l-4.095-2.378V7.603l-6.168 3.564l.015-5.31zm21.43 5.311l-.014-5.31L12.46 0v24l4.095-2.378V14.87l3.092 1.788l-.018-4.618l-3.074-1.756V7.603z',
    })
  );

export const ReactLogoIcon = ({ className = 'w-5 h-5', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '-11.5 -10.23174 23 20.46348', className, ...props },
    React.createElement('circle', { cx: '0', cy: '0', r: '2.05', fill: '#61DAFB' }),
    React.createElement(
      'g',
      { stroke: '#61DAFB', strokeWidth: '1', fill: 'none' },
      React.createElement('ellipse', { rx: '11', ry: '4.2' }),
      React.createElement('ellipse', { rx: '11', ry: '4.2', transform: 'rotate(60)' }),
      React.createElement('ellipse', { rx: '11', ry: '4.2', transform: 'rotate(120)' })
    )
  );

export const GoogleLogoIcon = ({ className = 'w-5 h-5', ...props }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', className, ...props },
    React.createElement('path', {
      fill: '#4285F4',
      d: 'M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z',
    }),
    React.createElement('path', {
      fill: '#34A853',
      d: 'M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z',
    }),
    React.createElement('path', {
      fill: '#FBBC05',
      d: 'M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z',
    }),
    React.createElement('path', {
      fill: '#EA4335',
      d: 'M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z',
    })
  );

export const MoreHorizontalNavIcon = MoreHorizontal;
export const ChatDrawerIcon = MessageSquare;
export const ParticipantsDrawerIcon = UserGroupIcon;
export const CloseIcon = X;
export const SearchIcon = Search;
export const SendIcon = Send;
export const SettingsIcon = Settings;
export const TranscriptFileIcon = FileText;
export const DownloadTranscriptIcon = Download;
export const UploadBackupIcon = Upload;
export const PlusActionIcon = Plus;
export const KeySecretIcon = Key;
export const ResetSettingsIcon = RotateCcw;
export const BackNavIcon = ArrowLeft;
export const ForwardNavIcon = ArrowRight;
export const LeaveRoomIcon = LogOut;
export const EditActionIcon = Pencil;
export const DeleteActionIcon = Trash2;
export const CopyActionIcon = Copy;
export const HistoryNavIcon = History;

/* =========================================================================
   4. Status, Telemetry & Alerts
   ========================================================================= */
export const LoadingSpinnerIcon = Loader2;
export const AlertWarningIcon = AlertTriangle;
export const AlertTriangleIcon = AlertTriangle;
export const AlertErrorIcon = AlertCircle;
export const SuccessCheckIcon = CheckCircle2;
export const CheckCircleIcon = CheckCircle2;
export const Volume2Icon = Volume2;
export const HandIcon = Hand;
export const TimestampClockIcon = Clock;
export const SystemHealthIcon = Activity;
export const NetworkRadioIcon = Radio;
export const ProcessingCpuIcon = Cpu;
export const ServerIcon = Server;
export const TerminalIcon = Terminal;
export const RefreshIcon = RefreshCw;
export const NotificationBellIcon = ({ className = '', size, style, ...props }) => {
  const customStyle = size ? { width: size, height: size, ...style } : style;
  return React.createElement(FontAwesomeIcon, {
    icon: faBell,
    className,
    style: customStyle,
    ...props,
  });
};
export const UpdateSparklesIcon = Sparkles;

/* =========================================================================
   5. User, Roles, Moderation & Security
   ========================================================================= */
export const UserAvatarIcon = User;
export const HostShieldIcon = Shield;
export const VerifiedShieldIcon = ShieldCheck;
export const SecurityAlertIcon = ShieldAlert;
export const ModerationKickIcon = UserX;
export const RoleAssignedIcon = UserCheck;
export const EmailIcon = Mail;
export const PasswordLockIcon = Lock;
export const KeyboardShortcutIcon = Keyboard;

/* =========================================================================
   6. Media / Studio Actions
   ========================================================================= */
export const PlayActionIcon = Play;
export const PauseActionIcon = Pause;
export const SaveActionIcon = Save;

/* =========================================================================
   Namespace Object: AppIcons
   (Allows `import { AppIcons } from '../icons'; <AppIcons.MicOn />`)
   ========================================================================= */
export const AppIcons = {
  // Controls
  MicOn: MicOnIcon,
  MicOff: MicOffIcon,
  CameraOn: CameraOnIcon,
  CameraOff: CameraOffIcon,
  ScreenShare: ScreenShareIcon,
  EndCall: EndCallIcon,
  Pin: PinIcon,
  Unpin: UnpinIcon,
  Volume: VolumeIcon,
  Fullscreen: FullscreenIcon,
  TiledLayout: TiledLayoutIcon,
  GalleryLayout: GalleryLayoutIcon,
  SidebarLayout: SidebarLayoutIcon,
  SpotlightLayout: SpotlightLayoutIcon,
  SpeakerLayout: SpeakerLayoutIcon,
  MoreOptions: MoreOptionsIcon,
  Checkmark: CheckmarkIcon,
  ChevronDown: ChevronDownIcon,
  ViewDropdown: ViewDropdownIcon,
  ZoomSpeakerFill: ZoomSpeakerFillIcon,
  ZoomGalleryFill: ZoomGalleryFillIcon,
  ZoomSideBySideFill: ZoomSideBySideFillIcon,
  Info: InfoIcon,
  RoomDetails: RoomDetailsIcon,

  // AI & Vision
  Captions: CaptionsIcon,
  HandTrackingOn: HandTrackingOnIcon,
  HandTrackingOff: HandTrackingOffIcon,
  SignGesture: SignGestureIcon,
  AiTranslate: AiTranslateIcon,
  AiInspector: AiInspectorIcon,
  TextFont: TextFontIcon,
  TextAlignLeft: TextAlignLeftIcon,
  HardwareCamera: HardwareCameraIcon,
  AIFeature: AIFeatureIcon,
  FocusTarget: FocusTargetIcon,

  // Navigation & Drawers
  Home: HomeNavIcon,
  Calendar: CalendarNavIcon,
  More: MoreHorizontalNavIcon,
  Chat: ChatDrawerIcon,
  Participants: ParticipantsDrawerIcon,
  UserGroup: UserGroupIcon,
  Close: CloseIcon,
  Search: SearchIcon,
  Send: SendIcon,
  Settings: SettingsIcon,
  Transcript: TranscriptFileIcon,
  Download: DownloadTranscriptIcon,
  UploadBackup: UploadBackupIcon,
  Plus: PlusActionIcon,
  KeySecret: KeySecretIcon,
  Reset: ResetSettingsIcon,
  Back: BackNavIcon,
  Forward: ForwardNavIcon,
  Leave: LeaveRoomIcon,
  Edit: EditActionIcon,
  Delete: DeleteActionIcon,
  Copy: CopyActionIcon,
  History: HistoryNavIcon,

  // Status & Feedback
  Spinner: LoadingSpinnerIcon,
  Warning: AlertWarningIcon,
  Error: AlertErrorIcon,
  Success: SuccessCheckIcon,
  Clock: TimestampClockIcon,
  Activity: SystemHealthIcon,
  Radio: NetworkRadioIcon,
  Cpu: ProcessingCpuIcon,
  Server: ServerIcon,
  Terminal: TerminalIcon,
  Refresh: RefreshIcon,
  Notification: NotificationBellIcon,
  UpdateSparkles: UpdateSparklesIcon,

  // Users & Auth
  User: UserAvatarIcon,
  Shield: HostShieldIcon,
  ShieldCheck: VerifiedShieldIcon,
  ShieldAlert: SecurityAlertIcon,
  Kick: ModerationKickIcon,
  Role: RoleAssignedIcon,
  Email: EmailIcon,
  Password: PasswordLockIcon,
  Keyboard: KeyboardShortcutIcon,

  // Studio / Media
  Play: PlayActionIcon,
  Pause: PauseActionIcon,
  Save: SaveActionIcon,
};

export default AppIcons;
