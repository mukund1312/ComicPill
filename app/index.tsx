// Placeholder smoke-test screen — proves the db -> engine -> hook pipeline
// works end to end on a real device. The frontend build (see /docs) replaces
// this with the real Today screen from the design blueprint.
import { ScrollView, Text, View } from 'react-native';
import { useToday } from '../src/features/today/useToday';
import { color, space, type, font } from '../src/ui/tokens';

function Card({ label, workId, title, bucket, reasons }: { label: string; workId?: string; title?: string; bucket?: string; reasons?: string[] }) {
  return (
    <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, padding: space.lg, marginBottom: space.md }}>
      <Text style={{ color: color.muted, fontSize: type.caption, fontFamily: font.bodySemibold, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
      {workId ? (
        <>
          <Text style={{ color: color.text, fontSize: type.title, fontFamily: font.display, marginTop: space.xs }}>{title}</Text>
          <Text style={{ color: color.muted, fontSize: type.body, marginTop: 2 }}>{bucket}</Text>
          {reasons?.map((r) => (
            <Text key={r} style={{ color: color.faint, fontSize: type.caption, marginTop: space.xs }}>· {r}</Text>
          ))}
        </>
      ) : (
        <Text style={{ color: color.faint, fontSize: type.body, marginTop: space.xs }}>Nothing to show yet</Text>
      )}
    </View>
  );
}

export default function TodayScreen() {
  const today = useToday();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: space.lg, paddingTop: 64 }}>
      <Text style={{ color: color.text, fontSize: type.display, fontFamily: font.display, marginBottom: space.lg }}>
        Comic<Text style={{ color: color.accent }}>Pill</Text>
      </Text>
      <Card label="Continue" {...today.continueCard} title={today.continueCard?.title} bucket={today.continueCard?.bucket} reasons={today.continueCard?.reasons} workId={today.continueCard?.workId} />
      <Card label="Switch it up" title={today.switchCard?.title} bucket={today.switchCard?.bucket} reasons={today.switchCard?.reasons} workId={today.switchCard?.workId} />
      <Card label="Explore" title={today.exploreCard?.title} bucket={today.exploreCard?.bucket} reasons={today.exploreCard?.reasons} workId={today.exploreCard?.workId} />
      <Text style={{ color: color.faint, fontSize: type.caption, marginTop: space.md }}>lead: {today.lead}</Text>
    </ScrollView>
  );
}
