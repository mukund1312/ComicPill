// On a comic's page: read it, download it for offline reading, or put the download away. Shown only when a file (on Drive, a comic server or the device) backs the comic.
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../ui/primitives';
import { MakeRoomSheet } from '../reader/MakeRoomSheet';
import { downloadComics, planFor, putAway, readerComicForWork, toDownload } from '../../lib/library/collectionActions';
import { freeSpaceFor, isCached, readyComics } from '../../lib/reader/cloudCache';
import { runJob, useJob } from '../../lib/reader/importJob';
import { formatBytes } from '../../lib/reader/bytes';
import { font, space, type } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';
import type { RoomPlan } from '../../lib/reader/makeRoom';

export function FileActions({ workId }: { workId: string }) {
  const { styles } = useThemed(makeStyles);
  const [tick, setTick] = useState(0);
  const running = useJob().running;
  const [room, setRoom] = useState<RoomPlan | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is how a change on disk reaches the screen
  const comic = useMemo(() => readerComicForWork(workId), [workId, tick]);
  if (!comic) return null;
  const remote = !!comic.sourceUri;
  const onDevice = !remote || isCached(comic.id);

  const start = () => { void runJob('Downloading', async (p) => ({ verb: 'Downloaded', result: await downloadComics([comic], p) })).then((started) => { if (!started) Alert.alert('Another import is running', 'Wait for it to finish, or press Stop on the bar at the bottom.'); setTick((t) => t + 1); }); };
  const download = () => {
    const [one] = toDownload([workId]);
    if (!one) return;
    const plan = planFor([one]);
    if (plan.over > 0 || plan.overCount > 0) setRoom(plan); else start();
  };

  return (
    <View style={styles.box}>
      <Button onPress={() => router.push(`/reader/${comic.id}`)}>Read</Button>
      {remote ? (
        <>
          <Text style={styles.note}>{onDevice ? 'Downloaded: it reads offline.' : `Not on this device yet. Opening it downloads ${comic.sizeBytes ? formatBytes(comic.sizeBytes) : 'it'} first.`}</Text>
          {onDevice
            ? <Button kind="secondary" onPress={() => { putAway([workId]); setTick((t) => t + 1); }}>Put away (keeps it in My Collection)</Button>
            : <Button kind="secondary" disabled={running} onPress={download}>{running ? 'An import is running…' : 'Download for offline reading'}</Button>}
        </>
      ) : null}
      {room ? <MakeRoomSheet verb="download" title={comic.title} need={comic.sizeBytes ?? 0} recompute={() => planFor([comic])} plan={room} ready={readyComics()} onCancel={() => setRoom(null)} onConfirm={(ids) => { ids.forEach(freeSpaceFor); setRoom(null); start(); }} /> : null}
    </View>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  box: { marginTop: space.lg, gap: space.sm },
  note: { color: color.muted, fontFamily: font.body, fontSize: type.caption },
});
