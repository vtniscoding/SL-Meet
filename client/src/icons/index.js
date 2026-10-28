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
  faHouseUser,
  faComment,
  faCamera,
  faGear,
} from '@fortawesome/free-solid-svg-icons';
import '@fortawesome/fontawesome-svg-core/styles.css';

import {
  // Meeting Controls
  Mic,
  MicOff,
  PhoneOff,
  Monitor,
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
  UserCheck,
  UserX,
  Volume2,

  // AI, Vision & Captions
  Captions,
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
export const MicOnIcon = Mic;
export const MicOffIcon = MicOff;

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
export const ScreenShareIcon = Monitor;
export const EndCallIcon = PhoneOff;
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
export const CaptionsIcon = Captions;
export const HandTrackingOnIcon = Eye;
export const HandTrackingOffIcon = EyeOff;
export const SignGestureIcon = Hand;
export const AiTranslateIcon = Sparkles;
export const TextFontIcon = Type;
export const GlobeIcon = Globe;
export const TtFontSizeIcon = ({ className = 'w-4 h-4', ...props }) =>
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
    React.createElement('polyline', { points: '4 7 4 4 14 4 14 7' }),
    React.createElement('line', { x1: '9', y1: '4', x2: '9', y2: '20' }),
    React.createElement('polyline', { points: '15 11 15 9 21 9 21 11' }),
    React.createElement('line', { x1: '18', y1: '9', x2: '18', y2: '20' })
  );
export const TextAlignLeftIcon = AlignLeft;
export const HardwareCameraIcon = Camera;
export const AIFeatureIcon = Zap;

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

export const MoreHorizontalNavIcon = MoreHorizontal;
export const ChatDrawerIcon = MessageSquare;
export const ParticipantsDrawerIcon = Users;
export const CloseIcon = X;
export const SearchIcon = Search;
export const SendIcon = Send;
export const SettingsIcon = Settings;
export const TranscriptFileIcon = FileText;
export const DownloadTranscriptIcon = Download;
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
export const AlertErrorIcon = AlertCircle;
export const SuccessCheckIcon = CheckCircle2;
export const TimestampClockIcon = Clock;
export const SystemHealthIcon = Activity;
export const NetworkRadioIcon = Radio;
export const ProcessingCpuIcon = Cpu;
export const ServerIcon = Server;
export const TerminalIcon = Terminal;
export const RefreshIcon = RefreshCw;

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
  TextFont: TextFontIcon,
  TextAlignLeft: TextAlignLeftIcon,
  HardwareCamera: HardwareCameraIcon,
  AIFeature: AIFeatureIcon,

  // Navigation & Drawers
  Home: HomeNavIcon,
  Calendar: CalendarNavIcon,
  More: MoreHorizontalNavIcon,
  Chat: ChatDrawerIcon,
  Participants: ParticipantsDrawerIcon,
  Close: CloseIcon,
  Search: SearchIcon,
  Send: SendIcon,
  Settings: SettingsIcon,
  Transcript: TranscriptFileIcon,
  Download: DownloadTranscriptIcon,
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
