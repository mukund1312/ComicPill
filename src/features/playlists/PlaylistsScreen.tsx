import { useMemo, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { usePlaylists } from './usePlaylists';
import type { ImportResult } from '../../lib/db/queries/playlists';
import type { SearchWorkResult } from '../../lib/db/queries/search';
import { AppShell } from '../../ui/AppShell';
import { ComicCover, ComicRow } from '../../ui/comic';
import { Button, EmptyState, Eyebrow, Input, Pill, Progress, SectionHeader, Sheet } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';

const moods = [
  ['dark', 'Dark'], ['mysterious', 'Mysterious'], ['epic', 'Epic'],
  ['character-driven', 'Character-driven'], ['fun', 'Fun'], ['emotional', 'Emotional'],
] as const;

type Playlist = ReturnType<typeof usePlaylists>['playlists'][number];
type ImportOutcome = ImportResult;
type BrowseItem = Playlist | SearchWorkResult;

function isSearchWork(item: BrowseItem): item is SearchWorkResult {
  return 'workId' in item;
}

export default function PlaylistsScreen() {
  const state = usePlaylists();
  const [newOpen, setNewOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState('');
  const [generatedName, setGeneratedName] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [seedName, setSeedName] = useState('');
  const [count, setCount] = useState(8);
  const [importCodeText, setImportCodeText] = useState('');
  const [importResult, setImportResult] = useState<ImportOutcome | null>(null);
  const [journeyCharacter, setJourneyCharacter] = useState<string | null>(null);
  const [journeyName, setJourneyName] = useState('');
  const selected = state.selected;
  const searching = Boolean(state.query.trim());

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    state.create(name);
    setNewName('');
    setNewOpen(false);
  };
  const generate = () => {
    const name = generatedName.trim() || (seedName.trim() ? `${seedName.trim()} essentials` : mood ? `${mood[0].toUpperCase()}${mood.slice(1)} reads` : 'My next reads');
    state.generateForMe(name, mood, seedName.trim() || null, count);
    setGeneratedName('');
    setSeedName('');
    setMood(null);
    setGenerateOpen(false);
  };
  const importPlaylist = () => {
    const code = importCodeValue(importCodeText);
    if (!code) return;
    setImportResult(state.importFromCode(code));
  };
  const startJourney = (characterName: string) => {
    setJourneyCharacter(characterName);
    setJourneyName(`${characterName}’s Journey`);
  };
  const generateJourney = () => {
    if (!journeyCharacter) return;
    state.generateJourney(journeyName.trim() || `${journeyCharacter}’s Journey`, journeyCharacter);
    state.setQuery('');
    setJourneyCharacter(null);
  };

  if (selected) {
    return <PlaylistDetail
      playlist={selected}
      query={state.query}
      searchResults={state.searchResults}
      onQuery={state.setQuery}
      onBack={() => state.select(null)}
      onAdd={() => { state.setQuery(''); setPickerOpen(true); }}
      onRemoveItem={(workId) => state.removeItem(selected.id, workId)}
      onReorder={(orderedWorkIds) => state.reorder(selected.id, orderedWorkIds)}
      onShare={() => { setCopied(false); setShareCode(state.share(selected.id)); }}
      onDelete={() => state.remove(selected.id)}
      onAddWork={(workId) => state.addItem(selected.id, workId)}
      pickerOpen={pickerOpen}
      closePicker={() => { setPickerOpen(false); state.setQuery(''); }}
      shareCode={shareCode}
      closeShare={() => setShareCode(null)}
      copied={copied}
      onCopy={async () => { if (shareCode) { await Clipboard.setStringAsync(shareCode); setCopied(true); } }}
    />;
  }

  return <AppShell active="library" title="Playlists">
    <FlashList<BrowseItem>
      data={searching ? state.searchResults : state.playlists}
      keyExtractor={(item) => isSearchWork(item) ? item.workId : item.id}
      getItemType={(item) => isSearchWork(item) ? 'playlist-search-row' : 'playlist-row'}
      renderItem={({ item }) => isSearchWork(item)
        ? <ComicRow title={item.title} workId={item.workId} recyclingKey={item.workId} meta={item.creators[0] ?? item.characters[0] ?? 'ComicPill catalog'} status="View comic" onPress={() => router.push(`/comic/${item.workId}`)} />
        : <PlaylistRow playlist={item} onPress={() => state.select(item.id)} />}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<PlaylistListHeader query={state.query} onQuery={state.setQuery} searching={searching} characters={state.characterSuggestions} onJourney={startJourney} onNew={() => setNewOpen(true)} onGenerate={() => setGenerateOpen(true)} onImport={() => { setImportResult(null); setImportOpen(true); }} />}
      ListEmptyComponent={<EmptyState mark={searching ? '⌕' : '☷'} title={searching ? 'No matching comics' : 'No playlists yet'} copy={searching ? 'Try a title, creator, or character.' : 'Keep a reading run, a character journey, or the stories you want to return to.'} action={!searching ? 'Make a playlist' : undefined} onAction={!searching ? () => setNewOpen(true) : undefined} />}
    />
    {newOpen ? <SheetOverlay title="New playlist"><Input placeholder="Playlist name" value={newName} onChangeText={setNewName} /><Button disabled={!newName.trim()} style={styles.sheetButton} onPress={create}>Create playlist</Button><Button kind="ghost" onPress={() => setNewOpen(false)}>Cancel</Button></SheetOverlay> : null}
    {generateOpen ? <SheetOverlay title="Ask ComicPill"><Text style={styles.sheetCopy}>A small, editable list built around your taste. Choose a mood or name a creator or character.</Text><Input placeholder="Name this playlist (optional)" value={generatedName} onChangeText={setGeneratedName} /><Text style={styles.sheetLabel}>Mood</Text><View style={styles.sheetPills}>{moods.map(([id, label]) => <Pill key={id} label={label} active={mood === id} onPress={() => setMood(mood === id ? null : id)} />)}</View><Input placeholder="Creator or character (optional)" value={seedName} onChangeText={setSeedName} /><CountStepper value={count} onChange={setCount} /><Button style={styles.sheetButton} onPress={generate}>Build my playlist</Button><Button kind="ghost" onPress={() => setGenerateOpen(false)}>Cancel</Button></SheetOverlay> : null}
    {importOpen ? <SheetOverlay title="Import a playlist"><Text style={styles.sheetCopy}>Paste a code someone sent you directly. It stays on this device; nothing posts or syncs automatically.</Text><Input placeholder="Paste playlist code" value={importCodeText} onChangeText={(value) => { setImportCodeText(value); setImportResult(null); }} /><Button disabled={!importCodeText.trim()} style={styles.sheetButton} onPress={importPlaylist}>Import playlist</Button>{importResult ? <ImportMessage result={importResult} /> : null}<Button kind="ghost" onPress={() => setImportOpen(false)}>Close</Button></SheetOverlay> : null}
    {journeyCharacter ? <SheetOverlay title="Build a character journey"><Text style={styles.sheetCopy}>A clear, ordered route through the essential books we have for {journeyCharacter}. It may be short today, and it will grow as the catalog does.</Text><Input placeholder="Playlist name" value={journeyName} onChangeText={setJourneyName} /><Button disabled={!journeyName.trim()} style={styles.sheetButton} onPress={generateJourney}>Build journey</Button><Button kind="ghost" onPress={() => setJourneyCharacter(null)}>Cancel</Button></SheetOverlay> : null}
  </AppShell>;
}

function importCodeValue(value: string) { return value.trim(); }

function PlaylistListHeader({ query, onQuery, searching, characters, onJourney, onNew, onGenerate, onImport }: { query: string; onQuery: (query: string) => void; searching: boolean; characters: string[]; onJourney: (character: string) => void; onNew: () => void; onGenerate: () => void; onImport: () => void }) {
  return <View><Input placeholder="Search comics, creators, characters" value={query} onChangeText={onQuery} />{searching ? <>{characters.length ? <View style={styles.journeySuggestions}>{characters.map((character) => <Pressable key={character} accessibilityRole="button" onPress={() => onJourney(character)} style={styles.journeySuggestion}><Text style={styles.journeySuggestionText}>Build {character}’s journey</Text><Text style={styles.journeySuggestionArrow}>›</Text></Pressable>)}</View> : null}<SectionHeader title="Search results" /></> : <><Text style={styles.intro}>A few intentional lists, ready when a path or a mood calls for one.</Text><View style={styles.actions}><Button style={styles.actionButton} onPress={onNew}>+ New playlist</Button><Button kind="secondary" style={styles.actionButton} onPress={onGenerate}>Ask ComicPill</Button></View><Pressable accessibilityRole="button" onPress={onImport} style={styles.importLink}><Text style={styles.importLinkText}>Import a shared code</Text><Text style={styles.importArrow}>›</Text></Pressable><SectionHeader title="Your playlists" /></>}</View>;
}

function PlaylistRow({ playlist, onPress }: { playlist: Playlist; onPress: () => void }) {
  const meta = `${playlist.items.length} ${playlist.items.length === 1 ? 'comic' : 'comics'}${playlist.sourceHint ? ` · ${playlist.sourceHint}` : ''}`;
  return <View style={styles.playlistRow}><ComicRow title={playlist.name} recyclingKey={playlist.id} meta={meta} status={playlist.createdBy === 'app' ? 'App-made' : 'Personal'} onPress={onPress} /></View>;
}

function PlaylistDetail({ playlist, query, searchResults, onQuery, onBack, onAdd, onRemoveItem, onReorder, onShare, onDelete, onAddWork, pickerOpen, closePicker, shareCode, closeShare, copied, onCopy }: {
  playlist: Playlist; query: string; searchResults: ReturnType<typeof usePlaylists>['searchResults']; onQuery: (query: string) => void; onBack: () => void; onAdd: () => void; onRemoveItem: (workId: string) => void; onReorder: (orderedWorkIds: string[]) => void; onShare: () => void; onDelete: () => void; onAddWork: (workId: string) => void; pickerOpen: boolean; closePicker: () => void; shareCode: string | null; closeShare: () => void; copied: boolean; onCopy: () => void;
}) {
  const completed = useMemo(() => playlist.items.filter((item) => item.status === 'done').length, [playlist.items]);
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= playlist.items.length) return;
    const ids = playlist.items.map((item) => item.workId);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    onReorder(ids);
  };
  const existing = new Set(playlist.items.map((item) => item.workId));
  return <AppShell active="library" title="Playlist">
    <FlashList
      data={playlist.items}
      keyExtractor={(item) => item.workId}
      getItemType={() => 'playlist-timeline'}
      renderItem={({ item, index }) => <PlaylistTimelineItem item={item} index={index} length={playlist.items.length} onRemove={() => onRemoveItem(item.workId)} onMove={(direction) => move(index, direction)} />}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<><Pressable onPress={onBack}><Text style={styles.back}>‹ All playlists</Text></Pressable><Eyebrow>{playlist.createdBy === 'app' ? 'App-made playlist' : 'Personal playlist'}</Eyebrow><Text numberOfLines={2} ellipsizeMode="tail" style={styles.detailTitle}>{playlist.name}</Text>{playlist.sourceHint ? <Text style={styles.why}>Why this playlist · Built around: {playlist.sourceHint}</Text> : null}<View style={styles.progressLine}><Text style={styles.progressLabel}>{completed} of {playlist.items.length} complete</Text><Progress value={playlist.items.length ? completed / playlist.items.length : 0} /></View><View style={styles.detailActions}><Button style={styles.detailAction} onPress={onAdd}>Add books</Button><Button kind="secondary" style={styles.detailAction} onPress={onShare}>Share</Button></View><Text style={styles.reorderHint}>Use the arrows to keep this reading order exactly how you want it.</Text></>}
      ListEmptyComponent={<EmptyState title="This list is ready" copy="Add a few comics and turn it into a reading journey." action="Add books" onAction={onAdd} />}
      ListFooterComponent={<Button kind="destructive" style={styles.deleteButton} onPress={onDelete}>Delete playlist</Button>}
    />
    {pickerOpen ? <PickerOverlay query={query} results={searchResults} existing={existing} onQuery={onQuery} onAdd={(workId) => { onAddWork(workId); }} onClose={closePicker} /> : null}
    {shareCode ? <SheetOverlay title="Share this playlist"><Text style={styles.sheetCopy}>Send this code directly by text, chat, or email. It does not post anywhere or sync automatically.</Text><Text selectable style={styles.shareCode}>{shareCode}</Text><Button style={styles.sheetButton} onPress={onCopy}>{copied ? 'Copied' : 'Copy code'}</Button><Button kind="ghost" onPress={closeShare}>Close</Button></SheetOverlay> : null}
  </AppShell>;
}

function PlaylistTimelineItem({ item, index, length, onRemove, onMove }: { item: Playlist['items'][number]; index: number; length: number; onRemove: () => void; onMove: (direction: -1 | 1) => void }) {
  return <View style={styles.timelineItem}><View style={[styles.node, item.status === 'done' && styles.nodeDone]}><Text style={styles.nodeText}>{item.status === 'done' ? '✓' : index + 1}</Text></View>{index < length - 1 ? <View style={styles.line} /> : null}<ComicCover title={item.title} workId={item.workId} size="tiny" recyclingKey={item.workId} /><View style={styles.itemBody}><Text numberOfLines={2} ellipsizeMode="tail" style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemMeta}>{item.status === 'done' ? 'Completed' : item.status === 'reading' ? 'Reading' : 'Unread'}</Text></View><View style={styles.itemControls}><Pressable accessibilityLabel={`Move ${item.title} up`} disabled={index === 0} onPress={() => onMove(-1)} style={[styles.orderButton, index === 0 && styles.disabled]}><Text style={styles.orderText}>↑</Text></Pressable><Pressable accessibilityLabel={`Move ${item.title} down`} disabled={index === length - 1} onPress={() => onMove(1)} style={[styles.orderButton, index === length - 1 && styles.disabled]}><Text style={styles.orderText}>↓</Text></Pressable><Pressable accessibilityLabel={`Remove ${item.title}`} onPress={onRemove} style={styles.removeButton}><Text style={styles.removeText}>×</Text></Pressable></View></View>;
}

function PickerOverlay({ query, results, existing, onQuery, onAdd, onClose }: { query: string; results: ReturnType<typeof usePlaylists>['searchResults']; existing: Set<string>; onQuery: (query: string) => void; onAdd: (workId: string) => void; onClose: () => void }) {
  return <View style={styles.pickerOverlay}><Sheet title="Add books"><Input placeholder="Search titles, creators, characters" value={query} onChangeText={onQuery} /><FlashList data={results} keyExtractor={(item) => item.workId} getItemType={() => 'playlist-search-result'} renderItem={({ item }) => <View style={styles.searchResult}><ComicCover title={item.title} workId={item.workId} size="tiny" recyclingKey={item.workId} /><View style={styles.searchBody}><Text numberOfLines={2} style={styles.searchTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.searchMeta}>{item.creators[0] ?? item.characters[0] ?? 'ComicPill catalog'}</Text></View><Pressable disabled={existing.has(item.workId)} onPress={() => onAdd(item.workId)} style={[styles.addButton, existing.has(item.workId) && styles.disabled]}><Text style={styles.addText}>{existing.has(item.workId) ? 'Added' : 'Add'}</Text></Pressable></View>} ListEmptyComponent={query ? <EmptyState title="No matching comics" copy="Try a title, creator, or character." /> : <EmptyState title="Find a book" copy="Search your ComicPill catalog to add it here." />} style={styles.searchList} /><Button kind="ghost" onPress={onClose}>Done</Button></Sheet></View>;
}

function CountStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <View style={styles.stepper}><Text style={styles.stepperLabel}>List length</Text><View style={styles.stepperControls}><Pressable accessibilityLabel="Fewer comics" onPress={() => onChange(Math.max(4, value - 1))} style={styles.stepperButton}><Text style={styles.stepperText}>−</Text></Pressable><Text style={styles.stepperValue}>{value} comics</Text><Pressable accessibilityLabel="More comics" onPress={() => onChange(Math.min(16, value + 1))} style={styles.stepperButton}><Text style={styles.stepperText}>+</Text></Pressable></View></View>;
}

function ImportMessage({ result }: { result: ImportOutcome }) {
  if (!result.playlist) return <Text style={styles.importError}>That code could not be read. Ask the sender to share the complete code again.</Text>;
  if (result.resolvedCount === 0) return <View style={styles.importResult}><Text style={styles.importError}>The code was read, but none of its comics match this device’s catalog yet.</Text>{result.unresolvedTitles.map((title) => <Text key={title} style={styles.unresolved}>• {title}</Text>)}</View>;
  return <View style={styles.importResult}><Text style={styles.importSuccess}>{result.resolvedCount} {result.resolvedCount === 1 ? 'comic made it in' : 'comics made it in'}.</Text>{result.unresolvedTitles.length ? <><Text style={styles.importError}>Not available in this catalog yet:</Text>{result.unresolvedTitles.map((title) => <Text key={title} style={styles.unresolved}>• {title}</Text>)}</> : null}</View>;
}

function SheetOverlay({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.overlay}><Sheet title={title}>{children}</Sheet></View>;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105 },
  intro: { color: color.text, fontFamily: font.display, fontSize: 27, lineHeight: 34, maxWidth: 324 },
  journeySuggestions: { gap: space.sm, marginTop: space.md }, journeySuggestion: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.accentDeep, backgroundColor: color.surface2 }, journeySuggestionText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption }, journeySuggestionArrow: { color: color.accent, fontSize: 24 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg }, actionButton: { flex: 1, paddingHorizontal: space.sm },
  importLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, marginTop: space.md, paddingHorizontal: space.md, borderWidth: 1, borderRadius: radius.md, borderColor: color.border, backgroundColor: color.surface2 },
  importLinkText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption }, importArrow: { color: color.accent, fontSize: 25 }, playlistRow: { minHeight: 104 },
  back: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.body, marginBottom: 18 }, detailTitle: { color: color.text, fontFamily: font.display, fontSize: 31, lineHeight: 37, marginTop: 6 }, why: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 19, marginTop: 8 }, progressLine: { gap: 8, marginTop: 18 }, progressLabel: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
  detailActions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg }, detailAction: { flex: 1, paddingHorizontal: space.sm }, reorderHint: { color: color.faint, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: space.sm, marginBottom: space.sm },
  timelineItem: { flexDirection: 'row', minHeight: 82, gap: 10, alignItems: 'center', position: 'relative', paddingVertical: 7 }, node: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: color.faint, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, nodeDone: { backgroundColor: color.positive, borderColor: color.positive }, nodeText: { color: color.text, fontFamily: font.bodySemibold, fontSize: 11 }, line: { position: 'absolute', width: 1, backgroundColor: color.border, left: 14, top: 35, bottom: -12 }, itemBody: { flex: 1, minWidth: 0 }, itemTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 21 }, itemMeta: { color: color.accent, fontFamily: font.bodyMedium, fontSize: 11, marginTop: 4, textTransform: 'capitalize' }, itemControls: { flexDirection: 'column', alignItems: 'center', gap: 1 }, orderButton: { width: 27, height: 24, alignItems: 'center', justifyContent: 'center' }, orderText: { color: color.muted, fontSize: 17 }, removeButton: { width: 27, height: 27, borderRadius: 14, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 2 }, removeText: { color: color.accent, fontFamily: font.body, fontSize: 21 }, disabled: { opacity: 0.38 }, deleteButton: { marginTop: space.xl },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, sheetCopy: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 22, marginBottom: space.md }, sheetButton: { marginTop: space.md }, sheetLabel: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption, marginTop: space.lg, marginBottom: space.sm }, sheetPills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1 }, stepperLabel: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption }, stepperControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, stepperButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }, stepperText: { color: color.text, fontSize: 21 }, stepperValue: { minWidth: 62, color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption, textAlign: 'center' },
  shareCode: { color: color.text, fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 18, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface2, borderColor: color.border, borderWidth: 1 },
  pickerOverlay: { ...StyleSheet.absoluteFill, zIndex: 30, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, searchList: { height: 330, marginTop: space.md }, searchResult: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 78, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border }, searchBody: { flex: 1, minWidth: 0 }, searchTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 21 }, searchMeta: { color: color.muted, fontFamily: font.body, fontSize: 11, marginTop: 3 }, addButton: { minWidth: 48, minHeight: 34, borderRadius: radius.pill, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, addText: { color: color.text, fontFamily: font.bodySemibold, fontSize: 11 },
  importResult: { marginTop: space.md, gap: 5 }, importSuccess: { color: color.positive, fontFamily: font.bodySemibold, fontSize: type.caption }, importError: { color: color.warning, fontFamily: font.body, fontSize: type.caption, lineHeight: 19, marginTop: space.md }, unresolved: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
});
