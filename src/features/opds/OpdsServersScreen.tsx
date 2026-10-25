import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { listServers, normalizeServerUrl, passwordOf, removeServer, saveServer, type OpdsServer } from '../../lib/opds/servers';
import { loadFeed } from '../../lib/opds/client';
import { SettingsPage } from '../../ui/SettingsPage';
import { ActionRow, LinkRow, SettingsSection, TextField } from '../../ui/settingsUi';
import { Button } from '../../ui/primitives';
import { color, font, space } from '../../ui/tokens';

export default function OpdsServersScreen() {
  const [servers, setServers] = useState<OpdsServer[]>(() => listServers());
  const [editing, setEditing] = useState<OpdsServer | 'new' | null>(null);
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [user, setUser] = useState(''); const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const startEdit = async (s: OpdsServer | 'new') => {
    setEditing(s);
    if (s === 'new') { setName(''); setUrl(''); setUser(''); setPass(''); return; }
    setName(s.name); setUrl(s.url); setUser(s.user); setPass(await passwordOf(s.id));
  };

  const save = async () => {
    const address = normalizeServerUrl(url);
    if (!address) { Alert.alert('Add the address', 'For example: comics.myserver.com/opds'); return; }
    setBusy(true);
    try {
      const saved = await saveServer({ id: editing && editing !== 'new' ? editing.id : undefined, name, url: address, user }, pass);
      // Try it now, so a typo shows up here and not later in the browser.
      try { await loadFeed(saved.url, saved); } catch (e) { Alert.alert('Saved, but it didn’t connect', (e as Error).message); }
      setServers(listServers()); setEditing(null);
    } finally { setBusy(false); }
  };

  return (
    <SettingsPage title="OPDS servers" subtitle="Read from a comic server you run — Komga, Kavita, Calibre-Web and others. Comics download to your library, so you can read them offline.">
      <SettingsSection title="Your servers" footer={servers.length ? undefined : 'None yet. Add the address your server shows for OPDS, often ending in /opds.'}>
        {servers.map((s, i) => <LinkRow key={s.id} label={s.name} detail={s.url} onPress={() => router.push({ pathname: '/reader/opds/browse', params: { server: s.id, url: s.url } })} last={i === servers.length - 1 && editing === null} />)}
        {editing === null ? <ActionRow label="Add a server" onPress={() => startEdit('new')} last /> : null}
      </SettingsSection>

      {editing !== null ? (
        <View style={styles.form}>
          <Text style={styles.heading}>{editing === 'new' ? 'New server' : 'Edit server'}</Text>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Home server" maxLength={40} />
          <TextField label="OPDS address" value={url} onChangeText={setUrl} placeholder="comics.example.com/opds" autoCapitalize="none" autoCorrect={false} />
          <TextField label="User name (if it needs one)" value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} />
          <TextField label="Password" value={pass} onChangeText={setPass} secure />
          <Text style={styles.note}>The password stays in this phone’s secure storage and is sent only to this server. Plain http:// addresses send it unencrypted — fine on your home network, not over the internet.</Text>
          <Button onPress={save} disabled={busy}>{busy ? 'Connecting…' : 'Save and test'}</Button>
          <Button kind="ghost" onPress={() => setEditing(null)}>Cancel</Button>
          {editing !== 'new' ? <Button kind="destructive" onPress={() => Alert.alert('Remove this server?', 'Comics you already downloaded stay in your library.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await removeServer(editing.id); setServers(listServers()); setEditing(null); } }])}>Remove server</Button> : null}
        </View>
      ) : servers.length ? <ActionRow label="Edit a server…" onPress={() => Alert.alert('Which one?', undefined, [...servers.map((s) => ({ text: s.name, onPress: () => void startEdit(s) })), { text: 'Cancel', style: 'cancel' as const }])} /> : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md, marginTop: space.md },
  heading: { color: color.text, fontFamily: font.displayMedium, fontSize: 20 },
  note: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17 },
});
