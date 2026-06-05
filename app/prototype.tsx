import { LinearGradient } from 'expo-linear-gradient';
import { PrototypeChatPanel } from '@/components/PrototypeChatPanel';

export default function PrototypeScreen() {
  return (
    <LinearGradient colors={['#EEF3FF', '#DCE8FF', '#F6F9FF']} style={{ flex: 1 }}>
      <PrototypeChatPanel />
    </LinearGradient>
  );
}
