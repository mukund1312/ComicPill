// Edit profile: name, handle, bio, photo and monthly reading goal. Nothing is
// saved until "Save", every field is validated with a message that says what
// to fix, and leaving with unsaved changes asks first.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../../ui/primitives';
import { Avatar } from '../../ui/Avatar';
import { SettingsPage } from '../../ui/SettingsPage';
import { ChoiceSheet, SettingsSection, TextField } from '../../ui/settingsUi';
import { confirm, notice } from '../../ui/dialogs';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { useProfile } from '../../lib/state/settings';
import { LIMITS, initialOf, sameProfile, validateProfile, type UserProfile } from '../../lib/settings/profileModel';
import { toAvatarDataUri } from '../../lib/platform/avatar';
import { feedback } from '../../lib/platform/feedback';
import { usePermissions } from '../settings/usePermissions';

type PhotoAction = 'library' | 'camera' | 'remove';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };

export default function EditProfileScreen() {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const saved = useProfile(useShallow((s): UserProfile => ({ displayName: s.displayName, username: s.username, bio: s.bio, avatar: s.avatar, monthlyGoal: s.monthlyGoal })));
  const save = useProfile((s) => s.save);
  const perms = usePermissions();

  const [draft, setDraft] = useState<UserProfile>(saved);
  const [submitted, setSubmitted] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => validateProfile(draft), [draft]);
  const dirty = !sameProfile(result.value, saved) || draft.avatar !== saved.avatar;
  const errors = submitted ? result.errors : {};
  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const leave = async () => {
    if (!dirty || await confirm({ title: 'Discard changes?', message: 'Your edits to this profile haven’t been saved.', confirmLabel: 'Discard', destructive: true, cancelLabel: 'Keep editing' })) router.back();
  };

  const onSave = () => {
    setSubmitted(true);
    if (!result.ok) { feedback.warning(); return; }
    if (save({ ...result.value, avatar: draft.avatar })) { feedback.success(); router.back(); }
  };

  const takeAsset = async (launch: () => Promise<ImagePicker.ImagePickerResult>) => {
    setBusy(true);
    try {
      const picked = await launch();
      const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
      if (uri) set('avatar', await toAvatarDataUri(uri));
    } catch {
      notice('Couldn’t use that photo', 'Please try a different one.');
    } finally {
      setBusy(false);
    }
  };

  const onPhotoAction = async (action: PhotoAction) => {
    setPhotoSheet(false);
    if (action === 'remove') { set('avatar', null); return; }
    if (action === 'library') { await takeAsset(() => ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS)); return; }
    if (await perms.ensure('camera')) await takeAsset(() => ImagePicker.launchCameraAsync(PICKER_OPTIONS));
  };

  const goalUp = () => set('monthlyGoal', Math.min(LIMITS.goalMax, draft.monthlyGoal + 1));
  const goalDown = () => set('monthlyGoal', Math.max(LIMITS.goalMin, draft.monthlyGoal - 1));

  return (
    <SettingsPage
      title="Edit profile" backLabel="Cancel" onBack={leave}
      footer={<Button onPress={onSave} disabled={!dirty || busy}>{busy ? 'Working…' : 'Save changes'}</Button>}
    >
      <View style={styles.avatarBlock}>
        <Avatar uri={draft.avatar} initial={initialOf(result.value)} size={104} />
        <Button kind="secondary" onPress={() => setPhotoSheet(true)} disabled={busy}>{draft.avatar ? 'Change photo' : 'Add photo'}</Button>
      </View>

      <SettingsSection>
        <View style={styles.fields}>
          <TextField label="Name" value={draft.displayName} onChangeText={(t) => set('displayName', t)} error={errors.displayName} maxLength={LIMITS.displayName} autoCapitalize="words" placeholder="Your name" />
          <TextField label="Username" prefix="@" value={draft.username} onChangeText={(t) => set('username', t)} error={errors.username} hint="Letters, numbers, dots and underscores." autoCapitalize="none" autoCorrect={false} placeholder="username" />
          <TextField label="Bio" value={draft.bio} onChangeText={(t) => set('bio', t)} error={errors.bio} maxLength={LIMITS.bio} multiline placeholder="What kind of reader are you?" />
        </View>
      </SettingsSection>

      <SettingsSection title="Monthly reading goal" footer="Your Profile tracks how many books you finish each month against this.">
        <View style={styles.goalRow}>
          <Button kind="secondary" onPress={goalDown} disabled={draft.monthlyGoal <= LIMITS.goalMin} style={styles.stepper}>−</Button>
          <View style={styles.goalValue}>
            <Text accessibilityLiveRegion="polite" style={[styles.goalNumber, { color: c.textPrimary, fontFamily: typography.display }]}>{draft.monthlyGoal}</Text>
            <Text style={[styles.goalLabel, { color: c.textSecondary, fontFamily: typography.body }]}>{draft.monthlyGoal === 1 ? 'book a month' : 'books a month'}</Text>
          </View>
          <Button kind="secondary" onPress={goalUp} disabled={draft.monthlyGoal >= LIMITS.goalMax} style={styles.stepper}>+</Button>
        </View>
        {errors.monthlyGoal ? <Text style={[styles.error, { color: c.error, fontFamily: typography.bodyMedium }]}>{errors.monthlyGoal}</Text> : null}
      </SettingsSection>

      <ChoiceSheet<PhotoAction>
        visible={photoSheet}
        title="Profile photo"
        choices={[
          { id: 'library', label: 'Choose from library' },
          { id: 'camera', label: 'Take a photo', detail: 'Uses your camera' },
          ...(draft.avatar ? [{ id: 'remove' as const, label: 'Remove photo' }] : []),
        ]}
        onSelect={onPhotoAction}
        onClose={() => setPhotoSheet(false)}
        footnote="Your photo is kept on this device only."
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  avatarBlock: { alignItems: 'center', gap: space.md, marginTop: space.lg },
  fields: { padding: space.md, gap: space.lg },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, gap: space.md },
  stepper: { width: 56, paddingHorizontal: 0 },
  goalValue: { alignItems: 'center' },
  goalNumber: { fontSize: 40 },
  goalLabel: { fontSize: 14 },
  error: { fontSize: 12, paddingHorizontal: space.md, paddingBottom: space.md },
});
