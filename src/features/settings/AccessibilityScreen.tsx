// Accessibility: two controls that genuinely change how the whole app feels.
// Haptics is checked on every tap in the shared buttons; "Reduce motion" turns
// off press-scaling animation — and the phone's own Reduce Motion is honoured
// too, without the reader having to set it twice.
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';
import { SettingsPage } from '../../ui/SettingsPage';
import { InfoRow, SettingsSection, ToggleRow } from '../../ui/settingsUi';
import { useSettings } from '../../lib/state/settings';
import { feedback } from '../../lib/platform/feedback';

export default function AccessibilityScreen() {
  const s = useSettings();
  const [systemReduce, setSystemReduce] = useState(false);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setSystemReduce(v); });
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => { if (alive) setScreenReader(v); });
    const a = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce);
    const b = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { alive = false; a.remove(); b.remove(); };
  }, []);

  return (
    <SettingsPage title="Accessibility" subtitle="Make ComicPill feel right for you." backLabel="Settings">
      <SettingsSection title="Feel">
        <ToggleRow
          label="Haptic feedback" detail="A light tap when you press buttons and make choices."
          value={s.haptics}
          onChange={(v) => { s.update({ haptics: v }); if (v) feedback.success(); }}
        />
        <ToggleRow
          label="Reduce motion" detail={systemReduce ? 'Also on in your phone’s settings, so motion is already reduced.' : 'Skips the press-and-shrink animation on buttons.'}
          value={s.reduceMotion} onChange={(v) => s.update({ reduceMotion: v })} last
        />
      </SettingsSection>

      <SettingsSection title="From your phone" footer="ComicPill follows these system settings automatically. Change them in your phone’s Settings app.">
        <InfoRow label="Reduce Motion" value={systemReduce ? 'On' : 'Off'} />
        <InfoRow label="Screen reader" value={screenReader ? 'On' : 'Off'} detail="Buttons, switches and fields are labelled for VoiceOver and TalkBack." />
        <InfoRow label="Text size" value="Follows your phone" last />
      </SettingsSection>
    </SettingsPage>
  );
}
