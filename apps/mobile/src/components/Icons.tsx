import React from 'react';
import {
  Smile,
  Heart,
  Frown,
  Angry,
  Brain,
  MessageCircle,
  Globe,
  Target,
  Volume2,
  Music,
  AlertTriangle,
  Ban,
  Pause,
  Phone,
  Settings,
  LogOut,
  User,
  Users,
  Smartphone,
  Upload,
  Trash,
  CheckCircle,
  Hourglass,
  Square,
  Clipboard,
  PartyPopper,
  Lock,
  Eye,
  EyeOff,
  Trophy,
  Dices,
  Star,
  Apple,
  ShieldAlert,
  ChevronLeft,
  X,
  Info,
} from 'lucide-react-native';
import { Icon, IconProps } from './Icon';
import Svg, { Path, G } from 'react-native-svg';

// This is our centralized SVG Icon library

// Common Icons
export const IconEye = (props: Omit<IconProps, 'icon'>) => <Icon icon={Eye} {...props} />;
export const IconEyeOff = (props: Omit<IconProps, 'icon'>) => <Icon icon={EyeOff} {...props} />;
export const IconLock = (props: Omit<IconProps, 'icon'>) => <Icon icon={Lock} {...props} />;
export const IconUser = (props: Omit<IconProps, 'icon'>) => <Icon icon={User} {...props} />;
export const IconUsers = (props: Omit<IconProps, 'icon'>) => <Icon icon={Users} {...props} />;
export const IconSettings = (props: Omit<IconProps, 'icon'>) => <Icon icon={Settings} {...props} />;
export const IconLogOut = (props: Omit<IconProps, 'icon'>) => <Icon icon={LogOut} {...props} />;
export const IconPhone = (props: Omit<IconProps, 'icon'>) => <Icon icon={Phone} {...props} />;
export const IconSmartphone = (props: Omit<IconProps, 'icon'>) => <Icon icon={Smartphone} {...props} />;
export const IconStar = (props: Omit<IconProps, 'icon'>) => <Icon icon={Star} {...props} />;
export const IconApple = (props: Omit<IconProps, 'icon'>) => <Icon icon={Apple} {...props} />;
export const IconChevronLeft = (props: Omit<IconProps, 'icon'>) => <Icon icon={ChevronLeft} {...props} />;
export const IconX = (props: Omit<IconProps, 'icon'>) => <Icon icon={X} {...props} />;
export const IconInfo = (props: Omit<IconProps, 'icon'>) => <Icon icon={Info} {...props} />;

// Game/Reactions Icons
export const IconSmile = (props: Omit<IconProps, 'icon'>) => <Icon icon={Smile} {...props} />;
export const IconHeart = (props: Omit<IconProps, 'icon'>) => <Icon icon={Heart} {...props} />;
export const IconFrown = (props: Omit<IconProps, 'icon'>) => <Icon icon={Frown} {...props} />;
export const IconAngry = (props: Omit<IconProps, 'icon'>) => <Icon icon={Angry} {...props} />;
export const IconTrophy = (props: Omit<IconProps, 'icon'>) => <Icon icon={Trophy} {...props} />;
export const IconDices = (props: Omit<IconProps, 'icon'>) => <Icon icon={Dices} {...props} />;

// Feedback / Status Icons
export const IconAlert = (props: Omit<IconProps, 'icon'>) => <Icon icon={AlertTriangle} {...props} />;
export const IconCheck = (props: Omit<IconProps, 'icon'>) => <Icon icon={CheckCircle} {...props} />;
export const IconHourglass = (props: Omit<IconProps, 'icon'>) => <Icon icon={Hourglass} {...props} />;
export const IconParty = (props: Omit<IconProps, 'icon'>) => <Icon icon={PartyPopper} {...props} />;

// Actions / Tools
export const IconUpload = (props: Omit<IconProps, 'icon'>) => <Icon icon={Upload} {...props} />;
export const IconTrash = (props: Omit<IconProps, 'icon'>) => <Icon icon={Trash} {...props} />;
export const IconClipboard = (props: Omit<IconProps, 'icon'>) => <Icon icon={Clipboard} {...props} />;
export const IconBan = (props: Omit<IconProps, 'icon'>) => <Icon icon={Ban} {...props} />;
export const IconPause = (props: Omit<IconProps, 'icon'>) => <Icon icon={Pause} {...props} />;

// Miscellanous Icons
export const IconBrain = (props: Omit<IconProps, 'icon'>) => <Icon icon={Brain} {...props} />;
export const IconMessage = (props: Omit<IconProps, 'icon'>) => <Icon icon={MessageCircle} {...props} />;
export const IconGlobe = (props: Omit<IconProps, 'icon'>) => <Icon icon={Globe} {...props} />;
export const IconTarget = (props: Omit<IconProps, 'icon'>) => <Icon icon={Target} {...props} />;
export const IconSquare = (props: Omit<IconProps, 'icon'>) => <Icon icon={Square} {...props} />;
export const IconShieldAlert = (props: Omit<IconProps, 'icon'>) => <Icon icon={ShieldAlert} {...props} />;

// Media Icons
export const IconVolumeUp = (props: Omit<IconProps, 'icon'>) => <Icon icon={Volume2} {...props} />;
export const IconMusic = (props: Omit<IconProps, 'icon'>) => <Icon icon={Music} {...props} />;

export function IconGoogle({ size = 24, style, accessibilityLabel }: { size?: number; style?: any; accessibilityLabel?: string }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48" style={style}>
      <G>
        <Path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.4-.4-3.4H24v6.1h11.3c-.2 1.5-1.2 3.8-3.6 5.3l-.1.9 5.2 4c3-2.7 4.8-6.7 4.8-12.9z"/>
        <Path fill="#0F9D58" d="M24 44c4.4 0 8.1-1.5 10.8-4.1l-5.2-4c-1.4.9-3.4 1.5-5.6 1.5-4.3 0-8-2.8-9.3-6.8l-.8.1-5.1 3.9-.1.8C12.3 40.7 17.7 44 24 44z"/>
        <Path fill="#4285F4" d="M14.7 30.6c-.3-.9-.5-1.9-.5-3s.2-2.1.5-3l-.1-1-5.2-4-.9.4C7 21.9 6.4 23.6 6.4 25.6s.6 3.7 1.6 5.4l6.7-5.2z"/>
        <Path fill="#DB4437" d="M24 14.9c3 0 5.1 1.3 6.2 2.4l4.5-4.4C32 9.6 28.4 8 24 8c-6.3 0-11.7 3.3-15 8.1l6.8 5.3c1.3-4 5-6.5 8.2-6.5z"/>
      </G>
    </Svg>
  );
}

export function IconAppleLogo({
  size = 24,
  color = '#fff',
  style,
  accessibilityLabel,
}: {
  size?: number;
  color?: string;
  style?: any;
  accessibilityLabel?: string;
}) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 384 512" style={style}>
      <Path
        fill={color}
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </Svg>
  );
}
