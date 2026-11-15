import { StyleSheet, Text, View } from 'react-native';
import { SettingsPage } from '../../ui/SettingsPage';
import { SettingsSection } from '../../ui/settingsUi';
import { space, type } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';

function P({ children }: { children: string }) { const { styles } = useThemed(makeStyles); return <Text style={styles.p}>{children}</Text>; }

/** A plain-words page on exactly what Mind Space does with screenshots. Keep it in step with the code. */
export default function PrivacyScreen() {
  const { styles } = useThemed(makeStyles);
  return (
    <SettingsPage title="What is sent" subtitle="Mind Space reads your screenshots to build a reading plan. Here is everything it does, in order.">
      <SettingsSection title="On your phone, always first">
        <View style={styles.box}>
          <P>1. It looks only at the one album you chose — never the rest of your gallery.</P>
          <P>2. The text in each new screenshot is read on this phone. Nothing is uploaded for this.</P>
          <P>3. Anything that looks private — one-time codes, bank messages, phone numbers, email addresses — is dropped on the spot. Its text is not kept and it is never sent.</P>
          <P>4. Screenshots with nothing about comics are skipped and their text is discarded.</P>
          <P>5. The rest are shown to you. Only the ones you approve are sent. (You can turn on auto-send once you trust it.)</P>
        </View>
      </SettingsSection>
      <SettingsSection title="What leaves the phone">
        <View style={styles.box}>
          <P>• The approved screenshot, shrunk to about 1280 pixels wide and re-saved, which removes location and camera details, plus up to 1,500 characters of its text — sent straight from your phone to the AI provider you picked (Claude or OpenAI), using your own key.</P>
          <P>• The comic’s title, as a search, to AniList (manga) and, if you added a key, Comic Vine (Western comics).</P>
          <P>• A short description of each new comic to your AI provider, once per comic, to tag it and weigh its reading order.</P>
        </View>
      </SettingsSection>
      <SettingsSection title="What does not">
        <View style={styles.box}>
          <P>• ComicPill has no server and no account. Nothing passes through us.</P>
          <P>• Your ratings, scores, library and plans stay on this phone. The taste score and the buy-or-not verdict are worked out here, from your own rules.</P>
          <P>• Your API keys sit in the phone’s secure storage and are sent only to the provider they belong to.</P>
        </View>
      </SettingsSection>
      <SettingsSection title="Your control" footer="The “Delete all Mind Space data” button is in Mind Space settings. It clears everything above from this phone; your screenshots themselves are never touched.">
        <View style={styles.box}>
          <P>You can stop watching an album, switch off the weekly digest, or delete everything at any time. A provider’s own privacy policy applies to what it receives.</P>
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  box: { padding: space.md, gap: space.sm },
  p: { color: color.text, fontFamily: font.body, fontSize: type.body, lineHeight: 22 },
});
